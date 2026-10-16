/** Blocks → land parcels with street frontage, addresses and boundary treatments. */
import type { Block, Parcel, ParcelUse, Polygon, Vec2, RoadEdge, RoadClass } from '../src/shared/types';
import { corridorHalfWidth, CLASS_RANK } from '../src/shared/types';
import { obb, splitPolygon, area, centroid, v2, distToPolyline, dedupe, polylineAt, projectOnSeg } from '../src/shared/geom';
import { RNG } from '../src/shared/rng';
import { DISTRICTS } from './config';
import { BUILDING_LINE, r2 } from './blocks';

export interface ParcelTargets { w: number; d: number; jitter: number; }

export function targetsFor(block: Block): ParcelTargets {
  const d = DISTRICTS.find(x => x.code === block.districtId);
  const base = d ? d.parcel : { w: 40, d: 60, jitter: 0.2 };
  switch (block.use) {
    case 'commercial': return block.districtId === 'CD' ? { w: 36, d: 40, jitter: 0.25 } : block.districtId === 'MQ' ? { w: 28, d: 34, jitter: 0.3 } : { w: base.w * 1.6, d: base.d * 1.2, jitter: base.jitter };
    case 'mixed': return block.districtId === 'CD' ? { w: 24, d: 34, jitter: 0.25 } : base;
    case 'civic': return { w: 60, d: 70, jitter: 0.15 };
    case 'industrial': return base;
    case 'market': return base;
    default: return base;
  }
}

/** recursive oriented-box subdivision */
export function subdivideParcels(poly: Polygon, t: ParcelTargets, rng: RNG): Polygon[] {
  const out: Polygon[] = [];
  const target = t.w * t.d;
  const rec = (p: Polygon, depth: number) => {
    p = dedupe(p, 0.01);
    if (p.length < 3) return;
    const A = area(p);
    if (A < target * 0.2) { out.push(p); return; }
    const box = obb(p);
    const L = box.hu * 2, S = box.hv * 2;
    if (depth > 11 || (A <= target * 1.25 && S <= t.d * 1.6) || (S <= t.d * 1.15 && L <= t.w * 1.5)) { out.push(p); return; }
    let dir: Vec2, o: Vec2;
    if (S > t.d * 1.6 && S >= L * 0.42) {
      // split into two rows (back to back parcels)
      dir = box.u; const off = rng.range(-0.06, 0.06) * S;
      o = [box.center[0] + box.v[0] * off, box.center[1] + box.v[1] * off];
    } else {
      dir = box.v; const off = rng.range(-t.jitter, t.jitter) * 0.3 * L;
      o = [box.center[0] + box.u[0] * off, box.center[1] + box.u[1] * off];
    }
    const [a, b] = splitPolygon(p, o, dir);
    if (a.length < 3 || b.length < 3 || area(a) < target * 0.12 || area(b) < target * 0.12) { out.push(p); return; }
    rec(a, depth + 1); rec(b, depth + 1);
  };
  rec(poly, 0);
  return out;
}

export interface Frontage { edge: RoadEdge; dir: Vec2; normal: Vec2; mid: Vec2; length: number; }

/** find the best street frontage of a parcel among the block's bounding roads */
export function findFrontage(poly: Polygon, blockEdges: RoadEdge[]): Frontage | null {
  const c = centroid(poly);
  let best: Frontage | null = null; let bestScore = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = v2.dist(a, b);
    if (len < 3.5) continue;
    const dir = v2.norm(v2.sub(b, a));
    const mid = v2.lerp(a, b, 0.5);
    for (const e of blockEdges) {
      const tol = corridorHalfWidth(e.cls) + BUILDING_LINE + 1.6;
      const da = distToPolyline(a, e.points), db = distToPolyline(b, e.points), dm = distToPolyline(mid, e.points);
      if (Math.max(da, db, dm) > tol) continue;
      // parallel check against the nearest segment
      let nd: Vec2 = dir, bd = Infinity;
      for (let k = 1; k < e.points.length; k++) { const pr = projectOnSeg(mid, e.points[k - 1], e.points[k]); if (pr.dist < bd) { bd = pr.dist; nd = v2.norm(v2.sub(e.points[k], e.points[k - 1])); } }
      if (Math.abs(v2.dot(nd, dir)) < 0.8) continue;
      let normal = v2.perp(dir);
      if (v2.dot(normal, v2.sub(mid, c)) < 0) normal = [-normal[0], -normal[1]];
      const score = CLASS_RANK[e.cls] * 100 + len;
      if (score > bestScore) { bestScore = score; best = { edge: e, dir, normal, mid, length: len }; }
    }
  }
  return best;
}

const addressCounters = new Map<string, number>();
export function nextAddress(streetName: string): string {
  const n = (addressCounters.get(streetName) ?? 0) + 1; addressCounters.set(streetName, n);
  return `${n * 2 - (n % 2)} ${streetName}`;
}

export function buildParcels(blocks: Block[], edgeById: Map<string, RoadEdge>, rng: RNG): Parcel[] {
  const parcels: Parcel[] = [];
  let pi = 0;
  for (const b of blocks) {
    if (!b.buildable) continue;
    const blockEdges = b.edgeIds.map(id => edgeById.get(id)!);
    const single: ParcelUse | null =
      b.use === 'park' ? 'park' : b.use === 'plaza' ? 'plaza' : b.use === 'transport' ? 'open' : b.use === 'landmark' ? 'open'
      : b.use === 'farmland' ? 'field' : b.use === 'open' ? 'open' : b.use === 'water' ? null : (b.use === 'market' && b.reservedFor) ? 'stalls' : b.reservedFor ? 'open' : null;
    if (b.use === 'water') continue;
    if (single) {
      const fr = findFrontage(b.buildable, blockEdges);
      parcels.push({ id: `p${pi++}`, blockId: b.id, districtId: b.districtId, polygon: b.buildable, area: Math.round(area(b.buildable)), frontageEdgeId: fr?.edge.id ?? null, frontDir: fr ? [r2(fr.dir[0]), r2(fr.dir[1])] : null, frontNormal: fr ? [r2(fr.normal[0]), r2(fr.normal[1])] : null, use: single, fence: null, gate: null, address: fr ? nextAddress(fr.edge.name) : b.reservedFor ?? 'Vora City' });
      continue;
    }
    const t = targetsFor(b);
    const polys = subdivideParcels(b.buildable, t, rng.fork('parcels-' + b.id));
    for (const poly of polys) {
      const A = area(poly);
      if (A < 25) continue;
      const fr = findFrontage(poly, blockEdges);
      const interiorUse: ParcelUse = b.use === 'industrial' ? 'yard' : b.use === 'commercial' ? 'parking' : b.use === 'market' ? 'stalls' : b.use === 'residential' ? 'garden' : 'courtyard';
      parcels.push({
        id: `p${pi++}`, blockId: b.id, districtId: b.districtId, polygon: poly.map(p => [r2(p[0]), r2(p[1])]), area: Math.round(A),
        frontageEdgeId: fr?.edge.id ?? null, frontDir: fr ? [r2(fr.dir[0]), r2(fr.dir[1])] : null, frontNormal: fr ? [r2(fr.normal[0]), r2(fr.normal[1])] : null,
        use: fr ? 'building' : interiorUse, fence: null, gate: null, address: fr ? nextAddress(fr.edge.name) : `${b.id} interior`,
      });
    }
  }
  return parcels;
}

export type { RoadClass };
export { polylineAt };
