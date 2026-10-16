/** Street furniture, trees, parking, vendors, utilities, hinterland fields — rule based, deterministic. */
import type { Prop, PropType, RoadEdge, RoadNode, Parcel, Block, Building, Vec2, DistrictCode, Polygon } from '../src/shared/types';
import { ROAD_PROFILES, carriagewayHalfWidth, corridorHalfWidth, CLASS_RANK } from '../src/shared/types';
import { v2, polylineLength, pointInPolygon, centroid, obb, rectCorners, bbox, distToPolyline } from '../src/shared/geom';
import { RNG } from '../src/shared/rng';
import { Terrain, WATER_LEVEL } from '../src/shared/terrain';
import { Ground } from '../src/shared/ground';
import { edgeDirAt, rightOf, trimDistance } from '../src/shared/roadgeom';
import { districtAt } from './roads';
import { GATEWAY } from './config';
import { parkProps } from './landmarks';
import { frameOf } from './archetypes';

type P = Omit<Prop, 'y'> & { y?: number };

interface Walker { pos: Vec2; dir: Vec2; s: number; }
function* walk(points: Vec2[], start: number, step: number, end: number): Generator<Walker> {
  const L = polylineLength(points);
  for (let s = start; s <= Math.min(L - end, L); s += step) {
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const l = v2.dist(points[i - 1], points[i]);
      if (s <= acc + l) { const t = l > 0 ? (s - acc) / l : 0; yield { pos: v2.lerp(points[i - 1], points[i], t), dir: v2.norm(v2.sub(points[i], points[i - 1])), s }; break; }
      acc += l;
    }
  }
}

export interface PropCtx {
  nodes: RoadNode[]; edges: RoadEdge[]; edgeById: Map<string, RoadEdge>; nodeById: Map<string, RoadNode>;
  parcels: Parcel[]; blocks: Block[]; buildings: Building[]; terrain: Terrain; ground: Ground; rng: RNG;
  cityBounds: Polygon;
  worldBounds: [number, number, number, number];
}

export function buildProps(ctx: PropCtx): P[] {
  const out: P[] = [];
  const { nodes, edges, edgeById, nodeById, parcels, blocks, buildings, terrain, rng } = ctx;
  const gates = parcels.filter(p => p.gate).map(p => [p.gate!.x, p.gate!.z] as Vec2);
  const footprints = buildings.flatMap(b => b.masses.map(m => m.footprint));
  const fpIndex = new Map<string, Polygon[]>();
  const cell = 40;
  for (const fp of footprints) { const bb = bbox(fp); for (let x = Math.floor(bb.minX / cell); x <= Math.floor(bb.maxX / cell); x++) for (let z = Math.floor(bb.minZ / cell); z <= Math.floor(bb.maxZ / cell); z++) { const k = `${x},${z}`; (fpIndex.get(k) ?? fpIndex.set(k, []).get(k)!).push(fp); } }
  const nearBuilding = (p: Vec2, margin: number): boolean => {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    const list = fpIndex.get(k); if (!list) return false;
    for (const fp of list) { if (pointInPolygon(p, fp)) return true; for (let i = 0; i < 4; i++) { if (distSeg(p, fp[i], fp[(i + 1) % 4]) < margin) return true; } }
    return false;
  };
  const nearGate = (p: Vec2, d: number) => gates.some(g => v2.dist(g, p) < d);
  const nodeNear = (p: Vec2, d: number) => nodes.some(n => n.edges.length >= 3 && v2.dist([n.x, n.z], p) < d);
  // nothing but boats/piers/cranes may stand in water (park blocks can span the river corridor)
  const WATER_OK = new Set<string>(['boat', 'pier', 'quaycrane', 'wire']);
  const push = (p: P) => { if (!WATER_OK.has(p.t) && (terrain.isWater(p.x, p.z) || ctx.ground.height(p.x, p.z) < WATER_LEVEL + 0.15)) return; out.push(p); };
  const districtOf = (p: Vec2): DistrictCode => districtAt(p)?.code ?? 'HL';

  // ── per edge furniture ──
  for (const e of edges) {
    const r = rng.fork('props-' + e.id);
    const prof = ROAD_PROFILES[e.cls];
    const half = carriagewayHalfWidth(e.cls);
    const L = polylineLength(e.points);
    const a = nodeById.get(e.a)!, b = nodeById.get(e.b)!;
    const trimA = trimDistance(a, e, edgeById), trimB = trimDistance(b, e, edgeById);
    const mid = e.points[Math.floor(e.points.length / 2)];
    const d = districtOf(mid);
    const isBridge = !!e.bridge;
    const sideOffsets = (w: Walker, off: number, side: 1 | -1): Vec2 => v2.add(w.pos, v2.scale(rightOf(w.dir), off * side));

    // lamps
    const lampStep = e.cls === 'arterial' ? 30 : e.cls === 'waterfront' ? 32 : e.cls === 'secondary' ? 34 : e.cls === 'service' ? 44 : e.cls === 'local' ? 40 : 0;
    if (lampStep && L > lampStep * 0.8) {
      const both = e.cls === 'arterial' || e.cls === 'waterfront' || e.cls === 'secondary';
      let k = 0;
      for (const w of walk(e.points, Math.max(trimA + 6, lampStep / 2), lampStep, Math.max(trimB + 6, 4))) {
        const sides: (1 | -1)[] = both ? [1, -1] : [k % 2 ? 1 : -1];
        for (const s of sides) {
          const p = sideOffsets(w, half + 0.55, s);
          if (nearGate(p, 2.5)) continue;
          push({ t: isBridge ? 'lamp' : e.cls === 'arterial' ? 'lamp-tall' : 'lamp', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) + (s > 0 ? Math.PI : 0), v: d === 'ID' ? 2 : 0 });
        }
        if (e.cls === 'arterial' && prof.median > 0 && !isBridge && k % 2 === 1) push({ t: 'lamp-double', x: w.pos[0], z: w.pos[1], r: Math.atan2(w.dir[0], w.dir[1]) });
        k++;
      }
    }
    if (isBridge) continue;

    // median palms on arterials
    if (e.cls === 'arterial' && prof.median > 0) {
      for (const w of walk(e.points, trimA + 14, 12, trimB + 14)) { if (nearGate(w.pos, 1)) continue; push({ t: 'tree-palm', x: w.pos[0], z: w.pos[1], r: r.range(0, 6.28), s: r.range(0.9, 1.25) }); }
    }
    // street trees
    const treeStep = e.cls === 'arterial' ? 14 : e.cls === 'waterfront' ? 15 : e.cls === 'secondary' ? 16 : e.cls === 'local' ? 18 : 0;
    const treeProb = e.cls === 'arterial' || e.cls === 'waterfront' ? 0.95 : ({ CD: 0.75, NH: 0.8, GE: 0.75, OT: 0.4, MQ: 0.35, ID: 0.2, HL: 0.3 } as Record<string, number>)[d] ?? 0.4;
    if (treeStep && prof.sidewalk >= 1.6) {
      let k = 0;
      for (const w of walk(e.points, trimA + 10, treeStep, trimB + 8)) {
        const sides: (1 | -1)[] = e.cls === 'local' ? [k % 2 ? 1 : -1] : [1, -1];
        for (const s of sides) {
          if (!r.chance(treeProb)) continue;
          const p = sideOffsets(w, half + Math.min(prof.sidewalk - 0.8, 1.7), s);
          if (nearGate(p, 3.2) || nearBuilding(p, 1.6)) continue;
          const kind: PropType = e.cls === 'waterfront' ? 'tree-palm' : d === 'NH' || d === 'CD' ? r.weighted<PropType>([['tree-broad', 3], ['tree-palm', 2], ['tree-neem', 2]]) : r.weighted<PropType>([['tree-neem', 4], ['tree-broad', 3], ['tree-small', 2]]);
          push({ t: kind, x: p[0], z: p[1], r: r.range(0, 6.28), s: r.range(0.8, 1.3) });
        }
        k++;
      }
    }
    // utility poles & wires
    const poleDistricts = d === 'OT' || d === 'MQ' || d === 'GE' || d === 'ID' || d === 'HL' || (d === 'NH' && e.cls !== 'arterial');
    if (poleDistricts && e.cls !== 'arterial' && e.cls !== 'lane' && L > 30) {
      let prev: Vec2 | null = null;
      const side: 1 | -1 = r.chance(0.5) ? 1 : -1;
      for (const w of walk(e.points, 6, 34, 6)) {
        const p = sideOffsets(w, corridorHalfWidth(e.cls) - 0.45, side);
        if (nearGate(p, 2)) { prev = null; continue; }
        push({ t: 'pole', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) });
        if (prev) push({ t: 'wire', x: prev[0], z: prev[1], r: 0, e: p, p: [7.2, 1.2] });
        prev = p;
      }
    }
    // manholes & cabinets & hydrants
    if (e.cls === 'arterial' || e.cls === 'secondary') {
      let k = 0;
      for (const w of walk(e.points, trimA + 20, 45, trimB + 10)) { const p = sideOffsets(w, 1.6, k % 2 ? 1 : -1); push({ t: 'manhole', x: p[0], z: p[1], r: 0 }); k++; }
    }
    if ((d === 'CD' || d === 'MQ' || d === 'GE') && e.cls !== 'lane' && L > 60) {
      for (const w of walk(e.points, trimA + 25, 75, trimB + 10)) { const p = sideOffsets(w, corridorHalfWidth(e.cls) - 0.6, 1); if (!nearGate(p, 2) && !nearBuilding(p, 0.6)) push({ t: 'cabinet', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) }); }
      if (d === 'CD') for (const w of walk(e.points, trimA + 40, 95, trimB + 10)) { const p = sideOffsets(w, half + 0.9, -1); if (!nearGate(p, 2)) push({ t: 'hydrant', x: p[0], z: p[1], r: 0 }); }
    }
    // bus stops
    if ((e.cls === 'arterial' || e.cls === 'secondary' || e.cls === 'waterfront') && L > 110) {
      const stops = L > 240 ? [0.3, 0.72] : [0.45];
      for (const f of stops) for (const s of [1, -1] as const) {
        for (const w of walk(e.points, f * L, 1e9, 0)) {
          const p = sideOffsets(w, half + 2.0, s);
          if (nearGate(p, 5) || nearBuilding(p, 1.0)) continue;
          push({ t: e.cls === 'secondary' && d !== 'CD' ? 'busstop' : 'busshelter', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) + (s > 0 ? 0 : Math.PI) });
          const bn = v2.add(p, v2.scale(w.dir, 4.5)); push({ t: 'bin', x: bn[0], z: bn[1], r: 0 });
        }
      }
    }
    // benches on commercial frontages
    if ((d === 'CD' || d === 'MQ') && (e.cls === 'secondary' || e.cls === 'arterial') ) {
      for (const w of walk(e.points, trimA + 18, 36, trimB + 10)) { const p = sideOffsets(w, half + 2.4, 1); if (!nearGate(p, 2.5) && !nearBuilding(p, 0.9)) { push({ t: 'bench', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) + Math.PI }); const bn = v2.add(p, v2.scale(w.dir, 1.6)); push({ t: 'bin', x: bn[0], z: bn[1], r: 0 }); } }
    }
    // kiosks & vendors on MQ / OT sidewalks (and a few on GE locals)
    const kioskProb = d === 'MQ' ? 0.55 : d === 'OT' ? 0.4 : d === 'GE' ? 0.12 : d === 'ID' ? 0.1 : 0;
    if (kioskProb && e.cls !== 'arterial' && e.cls !== 'lane' && prof.sidewalk >= 1.6) {
      for (const w of walk(e.points, trimA + 9, 26, trimB + 6)) {
        if (!r.chance(kioskProb)) continue;
        const s: 1 | -1 = r.chance(0.5) ? 1 : -1;
        const p = sideOffsets(w, corridorHalfWidth(e.cls) - 1.3, s);
        if (nearGate(p, 3.5) || nearBuilding(p, 0.7)) continue;
        const kind = r.weighted<PropType>([['kiosk', 5], ['stall', 3], ['umbrella', 3]]);
        push({ t: kind, x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) + (s > 0 ? Math.PI : 0) + Math.PI / 2, v: r.int(0, 5), c: kind === 'umbrella' ? r.pick(['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a', '#e0b323']) : undefined });
      }
    }
    // parked cars (parking lanes on secondaries, informal on locals)
    const parkProb = e.cls === 'secondary' ? ({ CD: 0.45, MQ: 0.5, OT: 0.35, NH: 0.2, GE: 0.3, ID: 0.3, HL: 0.05 } as Record<string, number>)[d] : e.cls === 'local' ? ({ CD: 0.25, MQ: 0.3, OT: 0.22, NH: 0.12, GE: 0.18, ID: 0.2, HL: 0.03 } as Record<string, number>)[d] : e.cls === 'service' ? 0.25 : 0;
    if (parkProb && prof.parking) {
      for (const w of walk(e.points, trimA + 12, 6.6, trimB + 8)) {
        for (const s of [1, -1] as const) {
          if (!r.chance(parkProb)) continue;
          const p = sideOffsets(w, half - 1.25, s);
          if (nearGate(p, 3.4)) continue;
          const isTruck = d === 'ID' && r.chance(0.4);
          push({ t: isTruck ? 'truck' : r.chance(0.12) ? 'minibus' : 'car', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]) + (s > 0 ? Math.PI : 0), v: r.int(0, 11) });
        }
      }
    }
    // speed bumps on residential locals
    if (e.cls === 'local' && (d === 'NH' || d === 'GE' || d === 'OT') && L > 120) {
      for (const w of walk(e.points, L * 0.5, 1e9, 0)) push({ t: 'speedbump', x: w.pos[0], z: w.pos[1], r: Math.atan2(w.dir[0], w.dir[1]), p: [half * 2 - 0.4] });
    }
    // open drains flag (rendered with the road)
    if ((e.cls === 'local' || e.cls === 'lane') && (d === 'OT' || d === 'MQ' || (d === 'GE' && r.chance(0.5)) || (d === 'ID' && r.chance(0.3)))) e.drain = true;
  }

  // ── junction furniture: signals, stop signs, street-name signs ──
  for (const n of nodes) {
    if (n.edges.length < 3 || n.kind === 'roundabout') continue;
    const inc = n.edges.map(id => edgeById.get(id)!);
    const maxRank = Math.max(...inc.map(e => CLASS_RANK[e.cls]));
    const r = rng.fork('node-' + n.id);
    inc.forEach((e, i) => {
      const d = edgeDirAt(e, n.id);
      const t = trimDistance(n, e, edgeById);
      const right = rightOf(v2.scale(d, -1)); // approaching driver's right
      const half = carriagewayHalfWidth(e.cls);
      const corner = v2.add(v2.add([n.x, n.z], v2.scale(d, t + 1.2)), v2.scale(right, half + 0.7));
      const rot = Math.atan2(-d[0], -d[1]);
      if (n.signals) push({ t: 'signal', x: corner[0], z: corner[1], r: rot, v: CLASS_RANK[e.cls] >= CLASS_RANK.secondary ? 1 : 0 });
      else if (CLASS_RANK[e.cls] < maxRank) push({ t: 'stopsign', x: corner[0], z: corner[1], r: rot, v: 0 });
      if (i === 0) {
        const names = Array.from(new Set(inc.map(x => x.name))).slice(0, 2);
        const sp = v2.add(corner, v2.scale(right, 1.2));
        push({ t: 'streetsign', x: sp[0], z: sp[1], r: rot, text: names.join(' / ') });
      }
      if (i === 1 && maxRank >= CLASS_RANK.arterial && CLASS_RANK[e.cls] >= CLASS_RANK.secondary && r.chance(0.5)) {
        const sp = v2.add(v2.add([n.x, n.z], v2.scale(d, t + 8)), v2.scale(right, half + 1.1));
        push({ t: 'directional', x: sp[0], z: sp[1], r: rot, text: r.pick(['CITY CENTRE', 'VORA PORT', 'NORTH GATE', 'UNITY BRIDGE', 'OLD TOWN', 'STADIUM', 'HOSPITAL', 'TERMINAL']) });
      }
    });
  }

  // ── roundabout islands ──
  for (const n of nodes) {
    if (n.kind !== 'roundabout') continue;
    const rad = n.radius ?? 15;
    const r = rng.fork('rb-' + n.id);
    if (rad >= 20) push({ t: 'monument', x: n.x, z: n.z, r: 0, p: [rad >= 24 ? 16 : 11] });
    else push({ t: 'flag', x: n.x, z: n.z, r: 0 });
    const k = Math.round(rad / 3);
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; push({ t: rad >= 20 ? 'tree-palm' : 'tree-small', x: n.x + Math.cos(a) * rad * 0.55, z: n.z + Math.sin(a) * rad * 0.55, r: a, s: r.range(0.9, 1.2) }); }
  }

  // ── gateway ──
  push({ t: 'arch', x: GATEWAY.x, z: GATEWAY.z, r: 0, p: [ROAD_PROFILES.arterial.carriageway + 2 * ROAD_PROFILES.arterial.median + 6, 19, 6], text: 'VORA CITY' });

  // ── parcels: gardens, parking, yards, stalls, courtyards, plain parks ──
  const blockById = new Map(blocks.map(b => [b.id, b]));
  for (const p of parcels) {
    const r = rng.fork('parcel-' + p.id);
    const block = blockById.get(p.blockId)!;
    const d = p.districtId as DistrictCode;
    const samplePoint = (tries = 10): Vec2 | null => {
      const bb = bbox(p.polygon);
      for (let i = 0; i < tries; i++) { const q: Vec2 = [r.range(bb.minX + 1, bb.maxX - 1), r.range(bb.minZ + 1, bb.maxZ - 1)]; if (pointInPolygon(q, p.polygon) && !nearBuilding(q, 1.4) && !nearGate(q, 3)) return q; }
      return null;
    };
    if (p.use === 'building') {
      // gardens around houses, bins, water tanks
      const residential = ['house', 'duplex', 'villa', 'mansion', 'terrace', 'semi', 'courtyard-house', 'apartments'].includes(buildings.find(b => b.id === p.buildingId)?.use ?? '');
      const nTrees = residential ? r.int(1, d === 'NH' ? 4 : 2) : (d === 'ID' ? 0 : r.int(0, 1));
      for (let i = 0; i < nTrees; i++) { const q = samplePoint(); if (q) push({ t: r.weighted<PropType>([['tree-small', 4], ['tree-palm', 3], ['tree-broad', 2], ['tree-neem', 2]]), x: q[0], z: q[1], r: r.range(0, 6.28), s: r.range(0.7, 1.15) }); }
      if (residential && r.chance(0.5)) { const q = samplePoint(6); if (q) push({ t: 'tank', x: q[0], z: q[1], r: 0, s: [1.1, 2.6, 1.1], v: 0 }); }
      if (residential && d !== 'NH' && r.chance(0.35)) { const q = samplePoint(6); if (q) push({ t: 'washline', x: q[0], z: q[1], r: r.range(0, 3.14) }); }
      if (residential && r.chance(0.55) && p.gate) { const g = v2.add([p.gate.x, p.gate.z], v2.scale(p.gate.dir, -4)); if (!nearBuilding(g, 0.5) && pointInPolygon(g, p.polygon)) push({ t: 'car', x: g[0], z: g[1], r: Math.atan2(p.gate.dir[0], p.gate.dir[1]), v: r.int(0, 11) }); }
      continue;
    }
    if (p.use === 'plaza' || p.use === 'open' || p.use === 'field') continue;
    const f = frameOf(p);
    if (p.use === 'park') { if (!block.reservedFor && f) for (const q of parkProps(f, r, 'plain')) push(q); continue; }
    if (p.use === 'parking') {
      if (block.reservedFor) continue;
      const o = obb(p.polygon);
      const rows = Math.max(1, Math.floor((o.hv * 2) / 16));
      for (let row = 0; row < rows; row++) {
        const cv = -o.hv + 8 + row * 16;
        for (let cu = -o.hu + 3; cu < o.hu - 3; cu += 2.8) {
          const q = v2.add(o.center, v2.add(v2.scale(o.u, cu), v2.scale(o.v, cv)));
          if (!pointInPolygon(q, p.polygon)) continue;
          push({ t: 'parkingline', x: q[0], z: q[1], r: Math.atan2(o.v[0], o.v[1]), s: [2.6, 0, 5] });
          if (r.chance(0.55)) push({ t: 'car', x: q[0], z: q[1], r: Math.atan2(o.v[0], o.v[1]), v: r.int(0, 11) });
        }
      }
      const c = centroid(p.polygon); push({ t: 'lamp', x: c[0], z: c[1], r: 0 });
      continue;
    }
    if (p.use === 'yard') {
      const n = Math.round(p.area / 220);
      for (let i = 0; i < n; i++) { const q = samplePoint(); if (!q) continue; push({ t: r.weighted<PropType>([['container', 4], ['truck', 2], ['tank', 2], ['pallets', 3]]), x: q[0], z: q[1], r: r.range(0, 3.14), v: r.int(0, 5), s: [2, 2, 2], p: [1] }); }
      continue;
    }
    if (p.use === 'stalls') {
      if (block.reservedFor) continue;
      const o = obb(p.polygon);
      for (let cv = -o.hv + 2.5; cv < o.hv - 2; cv += 3.6) for (let cu = -o.hu + 2; cu < o.hu - 1.5; cu += 3.2) {
        const q = v2.add(o.center, v2.add(v2.scale(o.u, cu), v2.scale(o.v, cv)));
        if (!pointInPolygon(q, p.polygon) || !r.chance(0.8)) continue;
        push({ t: r.chance(0.7) ? 'stall' : 'umbrella', x: q[0], z: q[1], r: Math.atan2(o.u[0], o.u[1]), v: r.int(0, 5), c: r.pick(['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a', '#e0b323']) });
      }
      continue;
    }
    if (p.use === 'garden' || p.use === 'courtyard') {
      const n = Math.max(1, Math.round(p.area / 160));
      for (let i = 0; i < n; i++) { const q = samplePoint(); if (q) push({ t: r.weighted<PropType>([['tree-broad', 3], ['tree-neem', 3], ['tree-palm', 2], ['tree-small', 3]]), x: q[0], z: q[1], r: r.range(0, 6.28), s: r.range(0.8, 1.3) }); }
      if (p.use === 'courtyard') { const c = centroid(p.polygon); if (!nearBuilding(c, 1)) push({ t: 'bench', x: c[0], z: c[1], r: r.range(0, 6.28) }); }
      continue;
    }
  }

  // ── riverbanks & shore: palms and bush ──
  {
    const r = rng.fork('banks');
    for (let i = 0; i < 1400; i++) {
      const x = r.range(-820, 820), z = r.range(-620, 520);
      const h = terrain.rawHeight(x, z);
      if (terrain.isWater(x, z) || h > 3.2) continue;
      const q: Vec2 = [x, z];
      if (nearBuilding(q, 2) || distToNearestRoad(q, edges) < 9) continue;
      push({ t: r.weighted<PropType>([['tree-palm', 5], ['tree-broad', 2], ['bush', 4], ['tree-small', 2]]), x, z, r: r.range(0, 6.28), s: r.range(0.8, 1.4) });
    }
  }

  // ── hinterland: fields, groves ──
  {
    const r = rng.fork('hinterland');
    const [minX, minZ, maxX, maxZ] = ctx.worldBounds;
    for (let i = 0; i < 260; i++) {
      const x = r.range(minX + 60, maxX - 60), z = r.range(minZ + 60, maxZ - 60);
      if (pointInPolygon([x, z], ctx.cityBounds)) continue;
      if (terrain.isWater(x, z)) continue;
      const w = r.range(45, 110), dd = r.range(35, 80), rot = r.range(0, Math.PI);
      const corners = rectCorners(x, z, w / 2, dd / 2, rot);
      if (corners.some(c => terrain.isWater(c[0], c[1]) || pointInPolygon(c, ctx.cityBounds) || terrain.rawHeight(c[0], c[1]) < 2)) continue;
      if (distToNearestRoad([x, z], edges) < Math.max(w, dd) * 0.5 + 10) continue;
      push({ t: 'field', x, z, r: rot, s: [w, 0, dd], v: r.int(0, 3) });
      if (r.chance(0.35)) { const c = corners[r.int(0, 3)]; push({ t: 'tree-broad', x: c[0], z: c[1], r: 0, s: r.range(1.2, 1.8) }); }
    }
    for (let i = 0; i < 1500; i++) {
      const x = r.range(minX + 20, maxX - 20), z = r.range(minZ + 20, maxZ - 20);
      if (pointInPolygon([x, z], ctx.cityBounds) || terrain.isWater(x, z)) continue;
      if (distToNearestRoad([x, z], edges) < 12 || nearBuilding([x, z], 3)) continue;
      push({ t: r.weighted<PropType>([['tree-broad', 4], ['tree-neem', 3], ['tree-palm', 2], ['bush', 3], ['tree-small', 2]]), x, z, r: r.range(0, 6.28), s: r.range(0.8, 1.6) });
    }
  }

  // ── a couple of roadworks sites ──
  {
    const r = rng.fork('roadworks');
    const cands = edges.filter(e => e.cls === 'local' && !e.bridge && polylineLength(e.points) > 90 && ['MQ', 'GE', 'OT'].includes(districtOf(e.points[0]) as string));
    for (const e of r.shuffle(cands).slice(0, 3)) {
      for (const w of walk(e.points, polylineLength(e.points) * 0.5, 1e9, 0)) {
        const half = carriagewayHalfWidth(e.cls);
        const p = v2.add(w.pos, v2.scale(rightOf(w.dir), half - 1.5));
        push({ t: 'roadworks', x: p[0], z: p[1], r: Math.atan2(w.dir[0], w.dir[1]), p: [14] });
      }
    }
  }

  return out;
}

function distSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = v2.sub(b, a), ap = v2.sub(p, a); const l2 = v2.dot(ab, ab) || 1e-9; const t = Math.max(0, Math.min(1, v2.dot(ap, ab) / l2)); return v2.dist(p, v2.add(a, v2.scale(ab, t)));
}

let roadGrid: Map<string, RoadEdge[]> | null = null;
function distToNearestRoad(p: Vec2, edges: RoadEdge[]): number {
  const cell = 80;
  if (!roadGrid) {
    roadGrid = new Map();
    for (const e of edges) { const bb = bbox(e.points); for (let x = Math.floor((bb.minX - 20) / cell); x <= Math.floor((bb.maxX + 20) / cell); x++) for (let z = Math.floor((bb.minZ - 20) / cell); z <= Math.floor((bb.maxZ + 20) / cell); z++) { const k = `${x},${z}`; (roadGrid.get(k) ?? roadGrid.set(k, []).get(k)!).push(e); } }
  }
  let best = Infinity;
  const cx = Math.floor(p[0] / cell), cz = Math.floor(p[1] / cell);
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) { const list = roadGrid.get(`${x},${z}`); if (!list) continue; for (const e of list) best = Math.min(best, distToPolyline(p, e.points) - corridorHalfWidth(e.cls)); }
  return best;
}

export { WATER_LEVEL };
