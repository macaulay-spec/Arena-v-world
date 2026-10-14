/** Road network meshes: carriageways, sidewalks, kerbs, medians, drains, junction fillets, roundabouts, markings, bridges. */
import * as THREE from 'three';
import type { CityData, RoadEdge, RoadNode, Vec2, RoadClass } from '../../shared/types';
import { ROAD_PROFILES, carriagewayHalfWidth, CLASS_RANK } from '../../shared/types';
import { v2 } from '../../shared/geom';
import { junctionGeometry, profileHeightAt, ROUNDABOUT_RING, ROUNDABOUT_WALK, edgeDirAt } from '../../shared/roadgeom';
import { AtlasBuilder, ColorBuilder, type V3 } from '../geom';
import type { WorldBase } from './terrain';
import type { ChunkSet } from './chunks';

const ASPHALT_Y = 0.02, WALK_Y = 0.15, MARK_Y = 0.045, DRAIN_W = 0.6;
const C = (h: string) => new THREE.Color(h);
const COLORS = {
  asphaltNew: C('#8b8b8b'), asphaltMid: C('#9a9894'), asphaltOld: C('#a39f99'), kerb: C('#cfcac0'), walk: C('#cdc6b8'), walkCD: C('#d6d1c8'), walkOT: C('#c6b9a2'),
  median: C('#7a9a4a'), medianKerb: C('#d2cdc3'), drain: C('#6a6a66'), drainCover: C('#b9b3a7'), white: C('#f2f2ee'), yellow: C('#e6c33c'), concrete: C('#c9c4b8'), bridgeDeck: C('#b4b0a8'), railing: C('#dddcd8'), cable: C('#e8e8e8'), pylon: C('#d5d2cc'),
};

interface PolyPt { p: Vec2; y: number; }

export interface RoadBuild { atlas: ChunkSet<AtlasBuilder>; marks: ChunkSet<ColorBuilder>; }

export function buildRoads(city: CityData, base: WorldBase, out: RoadBuild) {
  const edgeById = new Map(city.roads.edges.map(e => [e.id, e]));
  const nodeById = new Map(city.roads.nodes.map(n => [n.id, n]));
  const { ground } = base;
  const walkColor = (district: string) => district === 'CD' ? COLORS.walkCD : district === 'OT' ? COLORS.walkOT : COLORS.walk;
  const walkTile = (district: string, cls: RoadClass) => cls === 'lane' || cls === 'access' ? 'concrete-plain' : district === 'CD' ? 'paving-plaza' : 'paving';
  const asphaltFor = (cls: RoadClass): [string, THREE.Color] => cls === 'arterial' || cls === 'waterfront' ? ['asphalt', COLORS.asphaltNew] : cls === 'secondary' || cls === 'service' ? ['asphalt', COLORS.asphaltMid] : ['asphalt-old', COLORS.asphaltOld];
  const districtOfEdge = (e: RoadEdge) => { const m = e.points[Math.floor(e.points.length / 2)]; const b = base.blockAt(m[0] + 1, m[1] + 1) ?? base.blockAt(m[0] - 1, m[1] - 1); return b?.districtId ?? 'HL'; };

  // ── edges ──
  for (const e of city.roads.edges) {
    const a = nodeById.get(e.a)!, b = nodeById.get(e.b)!;
    const ja = junctionGeometry(a, edgeById), jb = junctionGeometry(b, edgeById);
    let trimA = ja.trims[ja.order.indexOf(e)] ?? 0, trimB = jb.trims[jb.order.indexOf(e)] ?? 0;
    if (trimA + trimB > e.length - 1.5) { const k = (e.length - 1.5) / (trimA + trimB); trimA *= k; trimB *= k; }
    const full = e.points.map((p, i) => ({ p, y: e.heights ? e.heights[i] : ground.height(p[0], p[1]) }));
    const line = cutPolyline(full, trimA, e.length - trimB);
    if (line.length < 2) continue;
    const prof = ROAD_PROFILES[e.cls];
    const h = carriagewayHalfWidth(e.cls);
    const district = districtOfEdge(e);
    const mid = line[Math.floor(line.length / 2)].p;
    const B = out.atlas.get(mid[0], mid[1]);
    const M = out.marks.get(mid[0], mid[1]);
    const [asTile, asCol] = asphaltFor(e.cls);
    const drain = !!e.drain && !e.bridge;
    const kerbOut = h + (drain ? DRAIN_W : 0);
    const sw = prof.sidewalk;
    const wTile = e.bridge ? 'concrete-plain' : walkTile(district, e.cls), wCol = e.bridge ? COLORS.bridgeDeck : walkColor(district);

    // carriageway
    if (prof.median > 0) {
      const m = prof.median / 2;
      ribbon(B, line, -h, -m, ASPHALT_Y, asTile, asCol, 8);
      ribbon(B, line, m, h, ASPHALT_Y, asTile, asCol, 8);
      // median island with openings at both ends
      const med = cutPolyline(line, 6, polyLength(line) - 6);
      if (med.length >= 2 && polyLength(med) > 4) {
        ribbon(B, med, -m, m, WALK_Y + 0.05, 'grass', COLORS.median, 6);
        kerbFaces(B, med, -m, ASPHALT_Y, WALK_Y + 0.05, COLORS.medianKerb, -1);
        kerbFaces(B, med, m, ASPHALT_Y, WALK_Y + 0.05, COLORS.medianKerb, 1);
        endCap(B, med, -m, m, ASPHALT_Y, WALK_Y + 0.05, COLORS.medianKerb);
      }
    } else {
      ribbon(B, line, -h, h, ASPHALT_Y, asTile, asCol, 8);
    }
    // drains (open concrete channels between kerb and sidewalk)
    if (drain) {
      ribbon(B, line, h, h + DRAIN_W, -0.25, 'concrete-plain', COLORS.drain, 2);
      ribbon(B, line, -h - DRAIN_W, -h, -0.25, 'concrete-plain', COLORS.drain, 2);
      // channel walls
      kerbFaces(B, line, h, -0.25, ASPHALT_Y, COLORS.kerb, -1);
      kerbFaces(B, line, -h, -0.25, ASPHALT_Y, COLORS.kerb, 1);
      kerbFaces(B, line, h + DRAIN_W, -0.25, WALK_Y, COLORS.kerb, 1);
      kerbFaces(B, line, -h - DRAIN_W, -0.25, WALK_Y, COLORS.kerb, -1);
      // cover slabs every 7 m
      const L = polyLength(line);
      for (let s = 3; s < L - 2; s += 7) {
        const seg = cutPolyline(line, s, s + 1.6);
        if (seg.length >= 2) { ribbon(B, seg, h - 0.05, h + DRAIN_W + 0.05, WALK_Y, 'concrete-plain', COLORS.drainCover, 2); ribbon(B, seg, -h - DRAIN_W - 0.05, -h + 0.05, WALK_Y, 'concrete-plain', COLORS.drainCover, 2); }
      }
    } else {
      kerbFaces(B, line, h, ASPHALT_Y, WALK_Y, COLORS.kerb, 1);
      kerbFaces(B, line, -h, ASPHALT_Y, WALK_Y, COLORS.kerb, -1);
    }
    // sidewalks
    if (sw > 0) {
      ribbon(B, line, kerbOut, kerbOut + sw, WALK_Y, wTile, wCol, 4);
      ribbon(B, line, -kerbOut - sw, -kerbOut, WALK_Y, wTile, wCol, 4);
      if (!e.bridge) {
        // back edge down to grade (hides the step to the terrain)
        kerbFaces(B, line, kerbOut + sw, -0.3, WALK_Y, wCol, 1);
        kerbFaces(B, line, -kerbOut - sw, -0.3, WALK_Y, wCol, -1);
      }
    }
    // dead-end: close the sidewalk and carriageway ends
    for (const [n, atStart] of [[a, true], [b, false]] as [RoadNode, boolean][]) {
      if (n.kind !== 'end') continue;
      const pt = atStart ? line[0] : line[line.length - 1];
      const d = atStart ? v2.norm(v2.sub(line[1].p, line[0].p)) : v2.norm(v2.sub(line[line.length - 1].p, line[line.length - 2].p));
      const r = v2.perp(d);
      // turning head: small semicircle of asphalt plus sidewalk
      const cen = pt.p, sgn = atStart ? -1 : 1;
      const ring: Vec2[] = []; const ys: number[] = [];
      for (let i = 0; i <= 12; i++) { const an = (i / 12) * Math.PI; const dir = v2.add(v2.scale(r, Math.cos(an)), v2.scale(d, Math.sin(an) * sgn)); ring.push(v2.add(cen, v2.scale(dir, h))); ys.push(pt.y + ASPHALT_Y); }
      B.fanY(cen, pt.y + ASPHALT_Y, orient(ring), ys, asTile, asCol, 8);
      const ring2: Vec2[] = [], ys2: number[] = [];
      for (let i = 0; i <= 12; i++) { const an = (i / 12) * Math.PI; const dir = v2.add(v2.scale(r, Math.cos(an)), v2.scale(d, Math.sin(an) * sgn)); ring2.push(v2.add(cen, v2.scale(dir, h + sw))); ys2.push(pt.y + WALK_Y); }
      // sidewalk crescent as a strip between the two arcs
      const inner: V3[] = ring.map(p => [p[0], pt.y + WALK_Y, p[1]]), outer: V3[] = ring2.map(p => [p[0], pt.y + WALK_Y, p[1]]);
      B.strip(inner, outer, wTile, wCol, 1, 4);
      const kerbIn: V3[] = ring.map(p => [p[0], pt.y + ASPHALT_Y, p[1]]);
      for (let i = 0; i + 1 < ring.length; i++) B.quad(kerbIn[i], kerbIn[i + 1], inner[i + 1], inner[i], 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb);
    }
    // markings
    buildMarkings(M, line, e, h, prof.lanes, prof.median);
    // bridge structure
    if (e.bridge) buildBridge(B, M, line, e, h + sw, base);
  }

  // ── junctions ──
  for (const n of city.roads.nodes) {
    if (n.kind === 'end' || n.edges.length < 2) continue;
    const jg = junctionGeometry(n, edgeById);
    const N: Vec2 = [n.x, n.z];
    const B = out.atlas.get(n.x, n.z); const M = out.marks.get(n.x, n.z);
    const yN = avgNodeHeight(n, jg.order, ground);
    const districts = jg.order.map(districtOfEdge);
    const district = districts.sort((p, q) => districts.filter(v => v === p).length - districts.filter(v => v === q).length).pop() ?? 'HL';
    let maxCls: RoadClass = jg.order[0].cls; for (const e of jg.order) if (CLASS_RANK[e.cls] > CLASS_RANK[maxCls]) maxCls = e.cls;
    const [asTile, asCol] = asphaltFor(maxCls);
    if (n.kind === 'roundabout') { buildRoundabout(B, M, n, jg, yN, asTile, asCol, walkTile(district, 'secondary'), walkColor(district)); continue; }

    // asphalt polygon: around the node, for each edge in angular order: left kerb point at trim, right kerb point at trim, then the fillet arc to the next edge
    const ring: Vec2[] = []; const ys: number[] = [];
    const k = jg.order.length;
    for (let i = 0; i < k; i++) {
      const e = jg.order[i], d = jg.dirs[i], t = jg.trims[i];
      const h = carriagewayHalfWidth(e.cls);
      const corner = jg.corners[i]; // corner between i and i+1
      const prev = jg.corners[(i + k - 1) % k]; // corner between i-1 and i
      const yT = heightAlong(e, n, t, ground);
      const base0 = v2.add(N, v2.scale(d, t));
      // kerb point on the side of the previous corner (perp pj of prev points into prev's wedge)
      const pPrev = v2.add(base0, v2.scale(prev.pj, h));
      const pNext = v2.add(base0, v2.scale(corner.pi, h));
      ring.push(pPrev); ys.push(yT);
      // full carriageway end is part of the edge ribbon; include points on both kerbs so the fan covers the mouth
      ring.push(pNext); ys.push(yT);
      // fillet arc from Ti to Tj (on kerb of edge i to kerb of edge j)
      const arc = filletArc(corner, 10);
      for (const q of arc) { ring.push(q); ys.push(yN); }
    }
    const orientedRing = orient(ring); const oys = orientedRing === ring ? ys : ys.slice().reverse();
    B.fanY(N, yN + ASPHALT_Y, orientedRing, oys, asTile, asCol, 8);

    // sidewalk corner bands + kerbs
    for (let i = 0; i < k; i++) {
      const corner = jg.corners[i]; const j = corner.j;
      const ei = jg.order[i], ej = jg.order[j];
      const swi = ROAD_PROFILES[ei.cls].sidewalk + (ei.drain && !ei.bridge ? DRAIN_W : 0), swj = ROAD_PROFILES[ej.cls].sidewalk + (ej.drain && !ej.bridge ? DRAIN_W : 0);
      const hi = carriagewayHalfWidth(ei.cls), hj = carriagewayHalfWidth(ej.cls);
      const Pi = v2.add(v2.add(N, v2.scale(jg.dirs[i], jg.trims[i])), v2.scale(corner.pi, hi));
      const Pj = v2.add(v2.add(N, v2.scale(jg.dirs[j], jg.trims[j])), v2.scale(corner.pj, hj));
      const inner: Vec2[] = [Pi, ...filletArc(corner, 10), Pj];
      const outer: Vec2[] = [];
      if (corner.O) {
        const Ro = corner.R + Math.max(swi, swj);
        outer.push(v2.add(Pi, v2.scale(corner.pi, swi)));
        for (const q of inner.slice(1, -1)) { const dir = v2.norm(v2.sub(q, corner.O)); outer.push(v2.add(corner.O, v2.scale(dir, Math.max(Ro, corner.R + 0.5)))); }
        outer.push(v2.add(Pj, v2.scale(corner.pj, swj)));
      } else {
        // straight: offset each point by its own side perp
        outer.push(v2.add(Pi, v2.scale(corner.pi, swi)), v2.add(corner.Ti, v2.scale(corner.pi, swi)), v2.add(corner.Tj, v2.scale(corner.pj, swj)), v2.add(Pj, v2.scale(corner.pj, swj)));
      }
      const yi = heightAlong(ei, n, jg.trims[i], ground), yj = heightAlong(ej, n, jg.trims[j], ground);
      const innerV: V3[] = inner.map((p, idx) => [p[0], (idx === 0 ? yi : idx === inner.length - 1 ? yj : yN) + WALK_Y, p[1]]);
      const outerV: V3[] = outer.map((p, idx) => [p[0], (idx === 0 ? yi : idx === outer.length - 1 ? yj : yN) + WALK_Y, p[1]]);
      if (innerV.length === outerV.length && innerV.length >= 2) {
        const tile = ei.bridge || ej.bridge ? 'concrete-plain' : walkTile(district, maxCls);
        B.strip(innerV, outerV, tile, walkColor(district), 1, 4);
        // kerb faces along the inner line
        for (let q = 0; q + 1 < innerV.length; q++) {
          const p0 = innerV[q], p1 = innerV[q + 1];
          const l0: V3 = [p0[0], p0[1] - (WALK_Y - ASPHALT_Y), p0[2]], l1: V3 = [p1[0], p1[1] - (WALK_Y - ASPHALT_Y), p1[2]];
          // face must point away from the sidewalk (towards the node)
          const mid: Vec2 = [(p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2];
          const toN = v2.sub(N, mid); const seg = v2.sub([p1[0], p1[2]], [p0[0], p0[2]]);
          const nrm = v2.perp(seg); const flip = v2.dot(nrm, toN) < 0;
          if (flip) B.quad(l0, l1, p1, p0, 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb); else B.quad(l1, l0, p0, p1, 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb);
        }
        // outer back face down to grade
        for (let q = 0; q + 1 < outerV.length; q++) {
          const p0 = outerV[q], p1 = outerV[q + 1];
          const l0: V3 = [p0[0], p0[1] - 0.45, p0[2]], l1: V3 = [p1[0], p1[1] - 0.45, p1[2]];
          const mid: Vec2 = [(p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2];
          const toN = v2.sub(N, mid); const seg = v2.sub([p1[0], p1[2]], [p0[0], p0[2]]);
          const nrm = v2.perp(seg); const flip = v2.dot(nrm, toN) > 0;
          if (flip) B.quad(l0, l1, p1, p0, 'concrete-plain', 0, 0, 1, 0.1, walkColor(district)); else B.quad(l1, l0, p0, p1, 'concrete-plain', 0, 0, 1, 0.1, walkColor(district));
        }
      }
    }
    // crossings and stop lines on approaches of signalised / major junctions
    const major = CLASS_RANK[maxCls] >= CLASS_RANK.secondary && k >= 3;
    if (major || n.signals) {
      for (let i = 0; i < k; i++) {
        const e = jg.order[i]; if (e.cls === 'lane' || e.cls === 'access') continue;
        const d = jg.dirs[i], t = jg.trims[i]; const h = carriagewayHalfWidth(e.cls);
        const y = heightAlong(e, n, t + 2, ground) + MARK_Y;
        const r = v2.perp(d);
        // zebra: stripes across the carriageway
        const s0 = t + 0.6, s1 = t + 3.0;
        const stripeW = 0.5;
        for (let w = -h + 0.4; w + stripeW <= h - 0.3; w += stripeW * 2) {
          const q0 = v2.add(v2.add(N, v2.scale(d, s0)), v2.scale(r, w)), q1 = v2.add(v2.add(N, v2.scale(d, s0)), v2.scale(r, w + stripeW));
          const q2 = v2.add(v2.add(N, v2.scale(d, s1)), v2.scale(r, w + stripeW)), q3 = v2.add(v2.add(N, v2.scale(d, s1)), v2.scale(r, w));
          M.quad([q0[0], y, q0[1]], [q3[0], y, q3[1]], [q2[0], y, q2[1]], [q1[0], y, q1[1]], COLORS.white, 0, 0, [0, 1, 0]);
          M.quad([q0[0], y, q0[1]], [q1[0], y, q1[1]], [q2[0], y, q2[1]], [q3[0], y, q3[1]], COLORS.white, 0, 0, [0, 1, 0]);
        }
        // stop line on the approaching half (driver's right when approaching = left of d... approach direction is -d, right of -d)
        const right = v2.perp(v2.scale(d, -1));
        const s = t + 3.6;
        const med = ROAD_PROFILES[e.cls].median / 2;
        const q0 = v2.add(v2.add(N, v2.scale(d, s)), v2.scale(right, med + 0.2)), q1 = v2.add(v2.add(N, v2.scale(d, s)), v2.scale(right, h - 0.2));
        const q2 = v2.add(q1, v2.scale(d, 0.4)), q3 = v2.add(q0, v2.scale(d, 0.4));
        M.quad([q0[0], y, q0[1]], [q1[0], y, q1[1]], [q2[0], y, q2[1]], [q3[0], y, q3[1]], COLORS.white, 0, 0, [0, 1, 0]);
        M.quad([q0[0], y, q0[1]], [q3[0], y, q3[1]], [q2[0], y, q2[1]], [q1[0], y, q1[1]], COLORS.white, 0, 0, [0, 1, 0]);
      }
    }
  }
}

// ───────────────────────── helpers ─────────────────────────

function orient(ring: Vec2[]): Vec2[] {
  let area = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return area < 0 ? ring.slice().reverse() : ring;
}

function filletArc(c: { O: Vec2 | null; R: number; Ti: Vec2; Tj: Vec2 }, steps: number): Vec2[] {
  if (!c.O) return [c.Ti, c.Tj];
  const a0 = Math.atan2(c.Ti[1] - c.O[1], c.Ti[0] - c.O[0]); let a1 = Math.atan2(c.Tj[1] - c.O[1], c.Tj[0] - c.O[0]);
  let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  const out: Vec2[] = [];
  const n = Math.max(2, Math.round(steps * Math.abs(da) / (Math.PI / 2)));
  for (let i = 0; i <= n; i++) { const a = a0 + da * (i / n); out.push([c.O[0] + Math.cos(a) * c.R, c.O[1] + Math.sin(a) * c.R]); }
  return out;
}

function avgNodeHeight(n: RoadNode, edges: RoadEdge[], ground: WorldBase['ground']): number {
  let s = 0, c = 0;
  for (const e of edges) { if (!e.heights) continue; s += e.a === n.id ? e.heights[0] : e.heights[e.heights.length - 1]; c++; }
  return c ? s / c : ground.height(n.x, n.z);
}

function heightAlong(e: RoadEdge, n: RoadNode, s: number, ground: WorldBase['ground']): number {
  if (!e.heights) { const d = edgeDirAt(e, n.id); return ground.height(n.x + d[0] * s, n.z + d[1] * s); }
  return e.a === n.id ? profileHeightAt(e, s) : profileHeightAt(e, e.length - s);
}

export function polyLength(line: PolyPt[]): number { let L = 0; for (let i = 1; i < line.length; i++) L += v2.dist(line[i - 1].p, line[i].p); return L; }

/** sub-polyline between arc lengths s0..s1 */
export function cutPolyline(line: PolyPt[], s0: number, s1: number): PolyPt[] {
  const out: PolyPt[] = [];
  let acc = 0;
  const L = polyLength(line);
  s0 = Math.max(0, Math.min(s0, L)); s1 = Math.max(s0, Math.min(s1, L));
  if (s1 - s0 < 0.05) return [];
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      const l = v2.dist(line[i - 1].p, line[i].p);
      const segStart = acc, segEnd = acc + l;
      // entering
      if (s0 > segStart && s0 < segEnd && out.length === 0) { const t = (s0 - segStart) / l; out.push(lerpPt(line[i - 1], line[i], t)); }
      if (s1 > segStart && s1 < segEnd) { const t = (s1 - segStart) / l; out.push(lerpPt(line[i - 1], line[i], t)); break; }
      acc = segEnd;
    }
    if (acc >= s0 - 1e-9 && acc <= s1 + 1e-9) { if (out.length === 0 || v2.dist(out[out.length - 1].p, line[i].p) > 0.01) out.push(line[i]); }
  }
  return out;
}
function lerpPt(a: PolyPt, b: PolyPt, t: number): PolyPt { return { p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t], y: a.y + (b.y - a.y) * t }; }

/** per-vertex miter offset normals (right-hand side = +) */
function offsets(line: PolyPt[]): Vec2[] {
  const n = line.length; const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const d0 = i > 0 ? v2.norm(v2.sub(line[i].p, line[i - 1].p)) : null;
    const d1 = i < n - 1 ? v2.norm(v2.sub(line[i + 1].p, line[i].p)) : null;
    if (d0 && d1) {
      const r0 = v2.perp(d0), r1 = v2.perp(d1);
      const m = v2.add(r0, r1); const ml = v2.len(m);
      if (ml < 1e-4) { out.push(r0); continue; }
      const mn = v2.scale(m, 1 / ml); const cosHalf = v2.dot(mn, r0);
      out.push(v2.scale(mn, 1 / Math.max(0.5, cosHalf)));
    } else out.push(v2.perp((d0 ?? d1)!));
  }
  return out;
}

/** strip along the line between lateral offsets w0 < w1 at height offset dy */
export function ribbon(B: AtlasBuilder, line: PolyPt[], w0: number, w1: number, dy: number, tile: string, color: THREE.Color, scale: number, id = -1) {
  if (line.length < 2) return;
  const off = offsets(line);
  const L: V3[] = [], R: V3[] = [];
  for (let i = 0; i < line.length; i++) {
    const o = off[i];
    L.push([line[i].p[0] + o[0] * w0, line[i].y + dy, line[i].p[1] + o[1] * w0]);
    R.push([line[i].p[0] + o[0] * w1, line[i].y + dy, line[i].p[1] + o[1] * w1]);
  }
  B.strip(L, R, tile, color, (w1 - w0) / scale, scale, id);
}

/** vertical kerb face along offset w, from y0 to y1; `facing` = +1 faces towards -w side (inwards)… we compute winding from the side flag */
function kerbFaces(B: AtlasBuilder, line: PolyPt[], w: number, y0: number, y1: number, color: THREE.Color, side: 1 | -1) {
  if (line.length < 2) return;
  const off = offsets(line);
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const pa: Vec2 = v2.add(a.p, v2.scale(off[i], w)), pb: Vec2 = v2.add(b.p, v2.scale(off[i + 1], w));
    const q0: V3 = [pa[0], a.y + y0, pa[1]], q1: V3 = [pb[0], b.y + y0, pb[1]], q2: V3 = [pb[0], b.y + y1, pb[1]], q3: V3 = [pa[0], a.y + y1, pa[1]];
    const len = v2.dist(pa, pb);
    // face normal should point toward the carriageway (−side × perp) for positive side
    const d = v2.norm(v2.sub(pb, pa)); const nrm = v2.scale(v2.perp(d), -side);
    const n3: V3 = [nrm[0], 0, nrm[1]];
    const test = faceNormalSign(q0, q1, q2, n3);
    if (test >= 0) B.quad(q0, q1, q2, q3, 'concrete-plain', 0, 0, len / 2, 0.12, color, 0, -1, n3);
    else B.quad(q1, q0, q3, q2, 'concrete-plain', 0, 0, len / 2, 0.12, color, 0, -1, n3);
  }
}
function faceNormalSign(a: V3, b: V3, c: V3, n: V3): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return nx * n[0] + ny * n[1] + nz * n[2];
}

function endCap(B: AtlasBuilder, line: PolyPt[], w0: number, w1: number, y0: number, y1: number, color: THREE.Color) {
  const off = offsets(line);
  for (const [i, sgn] of [[0, -1], [line.length - 1, 1]] as [number, number][]) {
    const p = line[i]; const a = v2.add(p.p, v2.scale(off[i], w0)), b = v2.add(p.p, v2.scale(off[i], w1));
    const d = i === 0 ? v2.norm(v2.sub(line[0].p, line[1].p)) : v2.norm(v2.sub(line[i].p, line[i - 1].p));
    const n3: V3 = [d[0], 0, d[1]];
    const q0: V3 = [a[0], p.y + y0, a[1]], q1: V3 = [b[0], p.y + y0, b[1]], q2: V3 = [b[0], p.y + y1, b[1]], q3: V3 = [a[0], p.y + y1, a[1]];
    if (faceNormalSign(q0, q1, q2, n3) >= 0) B.quad(q0, q1, q2, q3, 'concrete-plain', 0, 0, 1, 0.1, color, 0, -1, n3); else B.quad(q1, q0, q3, q2, 'concrete-plain', 0, 0, 1, 0.1, color, 0, -1, n3);
    void sgn;
  }
}

function buildMarkings(M: ColorBuilder, line: PolyPt[], e: RoadEdge, h: number, lanes: number, median: number) {
  if (e.cls === 'lane' || e.cls === 'access') return;
  const L = polyLength(line); if (L < 6) return;
  const off = offsets(line);
  const dash = (w: number, len: number, gap: number, col: THREE.Color, width = 0.12) => {
    for (let s = 2; s < L - 2; s += len + gap) {
      const seg = cutPolyline(line, s, Math.min(L - 2, s + len));
      if (seg.length < 2) continue;
      lineQuad(M, seg, w, width, col);
    }
  };
  const solid = (w: number, col: THREE.Color, width = 0.12) => { const seg = cutPolyline(line, 1.5, L - 1.5); if (seg.length >= 2) lineQuad(M, seg, w, width, col); };
  void off;
  if (median > 0) {
    // dual carriageway: lane lines within each side, edge lines
    const m = median / 2; const laneW = (h - m) / (lanes / 2);
    for (let i = 1; i < lanes / 2; i++) { dash(m + laneW * i, 3, 6, COLORS.white); dash(-m - laneW * i, 3, 6, COLORS.white); }
    solid(h - 0.25, COLORS.white); solid(-h + 0.25, COLORS.white);
    solid(m + 0.2, COLORS.yellow); solid(-m - 0.2, COLORS.yellow);
  } else if (lanes >= 2) {
    if (e.oneWay) { dash(0, 3, 6, COLORS.white); }
    else if (e.cls === 'local' || e.cls === 'service') dash(0, 2.5, 5, COLORS.white, 0.1);
    else dash(0, 3, 4.5, COLORS.white);
    if (e.cls !== 'local' && e.cls !== 'service') { solid(h - 0.25, COLORS.white, 0.1); solid(-h + 0.25, COLORS.white, 0.1); }
    // kerbside parking bays on roads with parking
    if (ROAD_PROFILES[e.cls].parking && L > 40) {
      for (let s = 10; s < L - 12; s += 6) {
        const seg = cutPolyline(line, s, s + 0.15); if (seg.length < 2) continue;
        for (const side of [1, -1]) { lineQuad(M, seg, side * (h - 1.1), 2.2, COLORS.white, true); }
      }
      const segA = cutPolyline(line, 10, L - 12); if (segA.length >= 2) { lineQuad(M, segA, h - 2.2, 0.1, COLORS.white); lineQuad(M, segA, -h + 2.2, 0.1, COLORS.white); }
    }
  }
}

/** thin quad along the line at lateral offset w */
function lineQuad(M: ColorBuilder, seg: PolyPt[], w: number, width: number, col: THREE.Color, across = false) {
  const off = offsets(seg);
  const L: V3[] = [], R: V3[] = [];
  for (let i = 0; i < seg.length; i++) {
    const o = off[i]; const p = seg[i];
    L.push([p.p[0] + o[0] * (w - width / 2), p.y + MARK_Y, p.p[1] + o[1] * (w - width / 2)]);
    R.push([p.p[0] + o[0] * (w + width / 2), p.y + MARK_Y, p.p[1] + o[1] * (w + width / 2)]);
  }
  for (let i = 0; i + 1 < seg.length; i++) {
    M.quad(L[i], L[i + 1], R[i + 1], R[i], col, 0, 0, [0, 1, 0]);
    M.quad(L[i], R[i], R[i + 1], L[i + 1], col, 0, 0, [0, 1, 0]);
  }
  void across;
}

function buildRoundabout(B: AtlasBuilder, M: ColorBuilder, n: RoadNode, jg: ReturnType<typeof junctionGeometry>, yN: number, asTile: string, asCol: THREE.Color, wTile: string, wCol: THREE.Color) {
  const r = n.radius ?? 15; const N: Vec2 = [n.x, n.z];
  const rIn = r - ROUNDABOUT_RING / 2, rOut = r + ROUNDABOUT_RING / 2, rWalk = rOut + ROUNDABOUT_WALK;
  const seg = 48;
  const circ = (rad: number, y: number): V3[] => { const out: V3[] = []; for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; out.push([n.x + Math.cos(a) * rad, y, n.z + Math.sin(a) * rad]); } return out; };
  // ring carriageway
  B.strip(circ(rIn, yN + ASPHALT_Y), circ(rOut, yN + ASPHALT_Y), asTile, asCol, ROUNDABOUT_RING / 8, 8);
  // island: kerb + grass top with paved edge ring
  B.strip(circ(rIn - 1.2, yN + WALK_Y), circ(rIn, yN + WALK_Y), wTile, wCol, 0.3, 4);
  const island: Vec2[] = []; const ys: number[] = [];
  for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; island.push([n.x + Math.cos(a) * (rIn - 1.2), n.z + Math.sin(a) * (rIn - 1.2)]); ys.push(yN + WALK_Y + 0.02); }
  B.fanY(N, yN + WALK_Y + 0.02, island, ys, 'grass', COLORS.median, 6);
  const kerbRing = (rad: number, y0: number, y1: number, outward: boolean) => { const lo = circ(rad, y0), hi = circ(rad, y1); for (let i = 0; i < seg; i++) { if (outward) B.quad(lo[i], lo[i + 1], hi[i + 1], hi[i], 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb); else B.quad(lo[i + 1], lo[i], hi[i], hi[i + 1], 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb); } };
  kerbRing(rIn, yN + ASPHALT_Y, yN + WALK_Y, true);
  // outer sidewalk ring, with gaps where the roads enter
  const mouths = jg.dirs.map((d, i) => ({ a: Math.atan2(d[1], d[0]), h: carriagewayHalfWidth(jg.order[i].cls) }));
  const inMouth = (a: number) => mouths.some(m => { let da = a - m.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; return Math.abs(da) < Math.asin(Math.min(0.99, (m.h + 2.5) / rOut)); });
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; const am = (a0 + a1) / 2;
    if (inMouth(am)) continue;
    const p = (rad: number, a: number, y: number): V3 => [n.x + Math.cos(a) * rad, y, n.z + Math.sin(a) * rad];
    B.quadUp(p(rOut, a0, yN + WALK_Y), p(rOut, a1, yN + WALK_Y), p(rWalk, a1, yN + WALK_Y), p(rWalk, a0, yN + WALK_Y), wTile, wCol, 4);
    B.quad(p(rOut, a1, yN + ASPHALT_Y), p(rOut, a0, yN + ASPHALT_Y), p(rOut, a0, yN + WALK_Y), p(rOut, a1, yN + WALK_Y), 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb);
    B.quad(p(rWalk, a0, yN - 0.4), p(rWalk, a1, yN - 0.4), p(rWalk, a1, yN + WALK_Y), p(rWalk, a0, yN + WALK_Y), 'concrete-plain', 0, 0, 1, 0.1, wCol);
  }
  // mouths: asphalt wedge from the ring to each trimmed approach, with flared kerbs
  for (let i = 0; i < jg.order.length; i++) {
    const e = jg.order[i], d = jg.dirs[i], t = jg.trims[i]; const h = carriagewayHalfWidth(e.cls);
    const rgt = v2.perp(d);
    const sw = ROAD_PROFILES[e.cls].sidewalk;
    const pts: Vec2[] = [];
    const base0 = v2.add(N, v2.scale(d, t));
    const pl = v2.add(base0, v2.scale(rgt, -h)), pr = v2.add(base0, v2.scale(rgt, h));
    // flare onto the ring: points on the ring circle at ±(h+2.5)
    const flare = (side: number) => { const ang = Math.atan2(d[1], d[0]) + side * Math.asin(Math.min(0.99, (h + 2.4) / rOut)); return [n.x + Math.cos(ang) * (rOut - 0.3), n.z + Math.sin(ang) * (rOut - 0.3)] as Vec2; };
    pts.push(pl, pr, flare(1), flare(-1));
    const cen: Vec2 = [(pl[0] + pr[0] + pts[2][0] + pts[3][0]) / 4, (pl[1] + pr[1] + pts[2][1] + pts[3][1]) / 4];
    const or = orient(pts); B.fanY(cen, yN + ASPHALT_Y, or, or.map(() => yN + ASPHALT_Y), asTile, asCol, 8);
    // sidewalk flares: quad from approach sidewalk end to the ring sidewalk
    for (const side of [1, -1]) {
      const a0 = v2.add(base0, v2.scale(rgt, side * h)), a1 = v2.add(base0, v2.scale(rgt, side * (h + sw)));
      const ang = Math.atan2(d[1], d[0]) + side * Math.asin(Math.min(0.99, (h + 2.4) / rOut));
      const b0: Vec2 = [n.x + Math.cos(ang) * rOut, n.z + Math.sin(ang) * rOut], b1: Vec2 = [n.x + Math.cos(ang) * rWalk, n.z + Math.sin(ang) * rWalk];
      B.quadUp([a0[0], yN + WALK_Y, a0[1]], [a1[0], yN + WALK_Y, a1[1]], [b1[0], yN + WALK_Y, b1[1]], [b0[0], yN + WALK_Y, b0[1]], wTile, wCol, 4);
      const k0: V3 = [a0[0], yN + ASPHALT_Y, a0[1]], k1: V3 = [b0[0], yN + ASPHALT_Y, b0[1]], k2: V3 = [b0[0], yN + WALK_Y, b0[1]], k3: V3 = [a0[0], yN + WALK_Y, a0[1]];
      const nrm: V3 = [-side * rgt[0], 0, -side * rgt[1]];
      if (faceNormalSign(k0, k1, k2, nrm) >= 0) B.quad(k0, k1, k2, k3, 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb, 0, -1, nrm); else B.quad(k1, k0, k3, k2, 'concrete-plain', 0, 0, 1, 0.1, COLORS.kerb, 0, -1, nrm);
    }
    // give-way triangles at the mouth
    const y = yN + MARK_Y;
    for (let w = -h + 0.6; w < h - 0.6; w += 1.2) {
      const q0 = v2.add(v2.add(N, v2.scale(d, t + 0.2)), v2.scale(rgt, w)), q1 = v2.add(v2.add(N, v2.scale(d, t + 0.2)), v2.scale(rgt, w + 0.7)), q2 = v2.add(v2.add(N, v2.scale(d, t + 1.0)), v2.scale(rgt, w + 0.35));
      M.tri([q0[0], y, q0[1]], [q1[0], y, q1[1]], [q2[0], y, q2[1]], COLORS.white, 0, 0, [0, 1, 0]);
      M.tri([q0[0], y, q0[1]], [q2[0], y, q2[1]], [q1[0], y, q1[1]], COLORS.white, 0, 0, [0, 1, 0]);
    }
  }
  // ring lane markings: dashed circle at the middle of the ring
  for (let i = 0; i < seg; i += 2) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (rad: number, a: number): V3 => [n.x + Math.cos(a) * rad, yN + MARK_Y, n.z + Math.sin(a) * rad];
    M.quad(p(r - 0.06, a0), p(r - 0.06, a1), p(r + 0.06, a1), p(r + 0.06, a0), COLORS.white, 0, 0, [0, 1, 0]);
    M.quad(p(r - 0.06, a0), p(r + 0.06, a0), p(r + 0.06, a1), p(r - 0.06, a1), COLORS.white, 0, 0, [0, 1, 0]);
  }
}

function buildBridge(B: AtlasBuilder, M: ColorBuilder, line: PolyPt[], e: RoadEdge, halfTotal: number, base: WorldBase) {
  const off = offsets(line);
  const deckT = 1.6;
  // deck sides and underside
  for (const side of [1, -1]) {
    const top: V3[] = [], bot: V3[] = [];
    for (let i = 0; i < line.length; i++) { const o = off[i]; const p = line[i]; top.push([p.p[0] + o[0] * halfTotal * side, p.y + WALK_Y, p.p[1] + o[1] * halfTotal * side]); bot.push([p.p[0] + o[0] * halfTotal * side, p.y - deckT, p.p[1] + o[1] * halfTotal * side]); }
    for (let i = 0; i + 1 < line.length; i++) {
      const len = Math.hypot(top[i + 1][0] - top[i][0], top[i + 1][2] - top[i][2]);
      const nrm: V3 = [off[i][0] * side, 0, off[i][1] * side];
      if (faceNormalSign(bot[i], bot[i + 1], top[i + 1], nrm) >= 0) B.quad(bot[i], bot[i + 1], top[i + 1], top[i], 'concrete-strip', 0, 0, len / 6, 1, COLORS.concrete, 0, -1, nrm);
      else B.quad(bot[i + 1], bot[i], top[i], top[i + 1], 'concrete-strip', 0, 0, len / 6, 1, COLORS.concrete, 0, -1, nrm);
    }
    // parapet / railing: low concrete upstand + posts
    const upT: V3[] = top.map(p => [p[0], p[1] + 0.45, p[2]]), inner: V3[] = top.map((p, i) => [p[0] - off[i][0] * 0.3 * side, p[1] + 0.45, p[2] - off[i][1] * 0.3 * side]);
    B.strip(top.map((p, i) => [p[0] - off[i][0] * 0.3 * side, p[1] + 0.45, p[2] - off[i][1] * 0.3 * side] as V3), upT, 'concrete-plain', COLORS.railing, 0.1, 2);
    for (let i = 0; i + 1 < line.length; i++) {
      const len = Math.hypot(top[i + 1][0] - top[i][0], top[i + 1][2] - top[i][2]);
      B.quad(top[i], top[i + 1], upT[i + 1], upT[i], 'concrete-plain', 0, 0, len / 2, 0.2, COLORS.railing);
      B.quad(top[i + 1], top[i], upT[i], upT[i + 1], 'concrete-plain', 0, 0, len / 2, 0.2, COLORS.railing);
      const ii: V3 = [inner[i][0], top[i][1], inner[i][2]], jj: V3 = [inner[i + 1][0], top[i + 1][1], inner[i + 1][2]];
      B.quad(jj, ii, inner[i], inner[i + 1], 'concrete-plain', 0, 0, len / 2, 0.2, COLORS.railing);
      B.quad(ii, jj, inner[i + 1], inner[i], 'concrete-plain', 0, 0, len / 2, 0.2, COLORS.railing);
    }
    // railing posts + rail
    const L = polyLength(line);
    for (let s = 1; s < L; s += 2.5) {
      const seg = cutPolyline(line, s, s + 0.01); if (!seg.length) continue;
      const o = offsets([seg[0], line[line.length - 1]])[0]; const p = seg[0];
      const x = p.p[0] + o[0] * (halfTotal - 0.15) * side, z = p.p[1] + o[1] * (halfTotal - 0.15) * side;
      M.box(x, p.y + WALK_Y + 0.45 + 0.4, z, 0.08, 0.8, 0.08, COLORS.railing);
    }
    const rail: V3[] = top.map((p, i) => [p[0] - off[i][0] * 0.15 * side, p[1] + 1.25, p[2] - off[i][1] * 0.15 * side]);
    for (let i = 0; i + 1 < rail.length; i++) { M.box((rail[i][0] + rail[i + 1][0]) / 2, rail[i][1], (rail[i][2] + rail[i + 1][2]) / 2, Math.hypot(rail[i + 1][0] - rail[i][0], rail[i + 1][2] - rail[i][2]) + 0.05, 0.08, 0.08, COLORS.railing, 0, 0, -Math.atan2(rail[i + 1][2] - rail[i][2], rail[i + 1][0] - rail[i][0])); }
  }
  // underside
  const uL: V3[] = [], uR: V3[] = [];
  for (let i = 0; i < line.length; i++) { const o = off[i]; const p = line[i]; uL.push([p.p[0] - o[0] * halfTotal, p.y - deckT, p.p[1] - o[1] * halfTotal]); uR.push([p.p[0] + o[0] * halfTotal, p.y - deckT, p.p[1] + o[1] * halfTotal]); }
  B.strip(uR, uL, 'concrete-plain', COLORS.concrete, halfTotal * 2 / 4, 4);
  // piers (beam) or pylons + cables (cable-stayed)
  const L = polyLength(line);
  const kind = e.bridge!.kind;
  const spacing = kind === 'beam' ? 28 : L / 3;
  const at = (s: number): PolyPt => cutPolyline(line, s, s + 0.01)[0] ?? line[0];
  if (kind === 'beam') {
    for (let s = spacing; s < L - 10; s += spacing) {
      const p = at(s); const o = offsets([p, line[line.length - 1]])[0];
      const gY = Math.min(base.terrain.height(p.p[0], p.p[1]), -1) - 2;
      for (const w of [-halfTotal * 0.5, halfTotal * 0.5]) {
        const x = p.p[0] + o[0] * w, z = p.p[1] + o[1] * w;
        M.cylinder(x, gY, z, 1.1, 1.0, p.y - deckT - gY + 0.2, 10, COLORS.concrete);
      }
      // pier cap
      const d = v2.norm(v2.sub(line[line.length - 1].p, line[0].p));
      M.box(p.p[0], p.y - deckT - 0.6, p.p[1], 1.6, 1.2, halfTotal * 2 - 0.4, COLORS.concrete, 0, 0, -Math.atan2(d[1], d[0]));
    }
  } else {
    const pylonH = 42;
    const d = v2.norm(v2.sub(line[line.length - 1].p, line[0].p));
    const rot = -Math.atan2(d[1], d[0]);
    const pylons = [L * 0.33, L * 0.67];
    for (const s of pylons) {
      const p = at(s); const o = offsets([p, line[line.length - 1]])[0];
      const gY = Math.min(base.terrain.height(p.p[0], p.p[1]), -1) - 3;
      for (const w of [-(halfTotal + 1.2), halfTotal + 1.2]) {
        const x = p.p[0] + o[0] * w, z = p.p[1] + o[1] * w;
        M.box(x, (gY + p.y + pylonH) / 2, z, 2.2, p.y + pylonH - gY, 2.6, COLORS.pylon, 0, 0, rot);
      }
      // cross beams
      M.box(p.p[0], p.y + pylonH - 2, p.p[1], 2.0, 3.0, halfTotal * 2 + 4.6, COLORS.pylon, 0, 0, rot);
      M.box(p.p[0], p.y - deckT - 0.8, p.p[1], 2.4, 1.6, halfTotal * 2 + 4.6, COLORS.pylon, 0, 0, rot);
      // stay cables fanning to the deck edges
      for (let k = 1; k <= 7; k++) {
        const ds = k * Math.min(14, (L / 2 - 6) / 7);
        for (const sgn of [-1, 1]) {
          const ss = s + sgn * ds; if (ss < 3 || ss > L - 3) continue;
          const q = at(ss); const oq = offsets([q, line[line.length - 1]])[0];
          for (const w of [-(halfTotal - 0.4), halfTotal - 0.4]) {
            const ax = p.p[0] + o[0] * (w > 0 ? halfTotal + 1.2 : -(halfTotal + 1.2)), az = p.p[1] + o[1] * (w > 0 ? halfTotal + 1.2 : -(halfTotal + 1.2)), ay = p.y + pylonH - 4 - k * 1.4;
            const bx = q.p[0] + oq[0] * w, bz = q.p[1] + oq[1] * w, by = q.y + WALK_Y + 0.9;
            cable(M, [ax, ay, az], [bx, by, bz], 0.09, COLORS.cable);
          }
        }
      }
    }
  }
}

function cable(M: ColorBuilder, a: V3, b: V3, r: number, col: THREE.Color) {
  // thin triangular prism between a and b (3 quads)
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / l, dy / l, dz / l];
  const up: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s: V3 = norm3(cross3(d, up)), t: V3 = norm3(cross3(d, s));
  const ring = (p: V3, k: number): V3 => { const an = (k / 3) * Math.PI * 2; return [p[0] + (s[0] * Math.cos(an) + t[0] * Math.sin(an)) * r, p[1] + (s[1] * Math.cos(an) + t[1] * Math.sin(an)) * r, p[2] + (s[2] * Math.cos(an) + t[2] * Math.sin(an)) * r]; };
  for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; M.quad(ring(a, k), ring(b, k), ring(b, k2), ring(a, k2), col); M.quad(ring(a, k2), ring(b, k2), ring(b, k), ring(a, k), col); }
}
function cross3(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a: V3): V3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
