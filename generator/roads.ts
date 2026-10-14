/**
 * Road network generation.
 * 1) Authored skeleton (arterials, secondaries, framing streets) → planar graph → super-blocks.
 * 2) Each super-block is subdivided by district-specific local streets (regular grids in planned districts,
 *    irregular recursive splits with lanes in the old quarters, crescents in the suburbs).
 * 3) Everything is merged into one planar graph; stubs are pruned so no street ends randomly.
 */
import type { Vec2, RoadClass, RoadNode, RoadEdge, Polygon } from '../src/shared/types';
import { CLASS_RANK, ROAD_PROFILES } from '../src/shared/types';
import { v2, pointInPolygon, distPointSeg, resample, densify, polylineLength, obb, splitPolygon, centroid, area as polyArea } from '../src/shared/geom';
import { Noise2D } from '../src/shared/noise';
import { RNG } from '../src/shared/rng';
import { Terrain, shorelineZ, distToRiver } from '../src/shared/terrain';
import { smoothProfile } from '../src/shared/ground';
import { RoadGraph, type InputPolyline, type Face } from './graph';
import { AUTHORED_ROADS, DISTRICTS, ZONES, ROUNDABOUTS, BRIDGES, STREET_NAMES, STREET_SUFFIX, type DistrictDef } from './config';

export interface RoadBuild {
  graph: RoadGraph;
  nodes: RoadNode[];
  edges: (RoadEdge & { heights: number[] })[];
  faces: Face[];
  streets: { id: string; name: string; cls: RoadClass; edgeIds: string[] }[];
  edgeById: Map<string, RoadEdge & { heights: number[] }>;
  nodeById: Map<string, RoadNode>;
}

export function zoneAt(p: Vec2, pad = 0): typeof ZONES[number] | null {
  for (const z of ZONES) { const [x1, z1, x2, z2] = z.rect; if (p[0] > x1 + pad && p[0] < x2 - pad && p[1] > z1 + pad && p[1] < z2 - pad) return z; }
  return null;
}

function landOk(p: Vec2, terrain: Terrain): boolean {
  if (p[1] > shorelineZ(p[0]) - 44) return false;
  if (distToRiver(p[0], p[1]) < 72) return false;
  if (terrain.height(p[0], p[1]) < 1.5) return false;
  return true;
}

export function districtAt(p: Vec2): DistrictDef | null {
  for (const d of DISTRICTS) if (pointInPolygon(p, d.polygon)) return d;
  return null;
}

class Namer {
  private used = new Set<string>();
  private rng: RNG;
  constructor(rng: RNG) { this.rng = rng; }
  next(code: keyof typeof STREET_NAMES, cls: RoadClass): string {
    for (let i = 0; i < 40; i++) {
      const n = `${this.rng.pick(STREET_NAMES[code])} ${this.rng.pick(STREET_SUFFIX[cls])}`;
      if (!this.used.has(n)) { this.used.add(n); return n; }
    }
    const n = `${this.rng.pick(STREET_NAMES[code])} ${this.rng.pick(STREET_SUFFIX[cls])} ${this.used.size}`; this.used.add(n); return n;
  }
}

/** Subdivide one super-block polygon into local streets. Returns polylines (world coords). */
function subdivide(poly: Polygon, d: DistrictDef, rng: RNG, terrain: Terrain, warp: Noise2D, namer: Namer, counter: { n: number }): InputPolyline[] {
  const out: InputPolyline[] = [];
  const g = d.grid;

  /** clip a straight cut line to land / zones and emit it as a (possibly curved) street */
  const emit = (o: Vec2, dir: Vec2, halfLen: number, cls: RoadClass, curve: number, idx: number) => {
    const n = Math.max(2, Math.ceil((halfLen * 2) / 10));
    const perp = v2.perp(dir);
    const pts: Vec2[] = [];
    const lambda = halfLen * rng.range(0.9, 1.6), phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i <= n; i++) {
      const s = -halfLen + (2 * halfLen) * (i / n);
      let off = 0;
      if (g.warp > 0) off += warp.get((o[0] + dir[0] * s) / 90 + idx * 0.31, (o[1] + dir[1] * s) / 90) * g.warp;
      if (curve > 0) off += Math.sin((s / lambda) * Math.PI * 2 + phase) * curve;
      pts.push([o[0] + dir[0] * s + perp[0] * off, o[1] + dir[1] * s + perp[1] * off]);
    }
    // keep only the part inside the super-block (+ one overshoot sample each end) and on land
    let run: Vec2[] = []; let prevBad: Vec2 | null = null;
    const flush = (over: Vec2 | null) => {
      if (run.length >= 2) {
        if (over) run.push(over);
        if (polylineLength(run) > 30) out.push({ streetId: `${d.code}-${cls}-${counter.n++}`, name: namer.next(d.code, cls), cls, points: run });
      }
      run = [];
    };
    for (const p of pts) {
      const inside = pointInPolygon(p, poly);
      const water = !landOk(p, terrain);
      const deep = terrain.height(p[0], p[1]) < -0.5;
      if (inside && !water) { if (!run.length && prevBad) run.push(prevBad); run.push(p); prevBad = null; }
      else { flush(deep ? null : p); prevBad = deep ? null : p; }
    }
    flush(null);
  };

  const regular = d.code === 'CD' || d.code === 'ID' || d.code === 'GE' || d.code === 'NH';
  const maxLong = Math.max(g.sx, g.sz) * 1.25, maxShort = Math.min(g.sx, g.sz) * 1.25;

  if (regular) {
    // grid split: continuous streets across the super-block, T-junctions at its boundary
    const box = obb(poly);
    const L = box.hu * 2, S = box.hv * 2;
    const sLong = box.hu >= box.hv ? g.sx : g.sz, sShort = box.hu >= box.hv ? g.sz : g.sx;
    const nL = Math.max(0, Math.ceil(L / (Math.max(sLong, sShort) * 1.25)) - 1);
    const nS = Math.max(0, Math.ceil(S / (Math.min(sLong, sShort) * 1.25)) - 1);
    const jit = g.jitter;
    for (let k = 1; k <= nL; k++) {
      const off = -box.hu + L * (k / (nL + 1)) + rng.range(-jit, jit) * (L / (nL + 1)) * 0.5;
      const o: Vec2 = [box.center[0] + box.u[0] * off, box.center[1] + box.u[1] * off];
      const curve = g.crescent > 0 && rng.chance(g.crescent) ? rng.range(6, 14) : 0;
      emit(o, box.v, box.hv + 18, g.cls, curve, counter.n);
    }
    for (let k = 1; k <= nS; k++) {
      const off = -box.hv + S * (k / (nS + 1)) + rng.range(-jit, jit) * (S / (nS + 1)) * 0.5;
      const o: Vec2 = [box.center[0] + box.v[0] * off, box.center[1] + box.v[1] * off];
      const curve = g.crescent > 0 && rng.chance(g.crescent) ? rng.range(6, 14) : 0;
      emit(o, box.u, box.hu + 18, g.cls, curve, counter.n);
    }
    return out;
  }

  // irregular recursive binary split (Old Town, Market Quarter)
  const rec = (p: Polygon, depth: number, cls: RoadClass) => {
    if (p.length < 3 || polyArea(p) < 900 || depth > 7) return;
    const box = obb(p);
    const L = box.hu * 2, S = box.hv * 2;
    const tooLong = L > maxLong, tooWide = S > maxShort;
    if (!tooLong && !tooWide) {
      // lanes: one more cut through dense blocks
      if (g.laneChance > 0 && cls !== 'lane' && S > 48 && L > 48 && rng.chance(g.laneChance)) {
        const along = L >= S ? box.u : box.v; const across = L >= S ? box.v : box.u;
        const half = L >= S ? box.hv : box.hu;
        const off = rng.range(-0.15, 0.15) * (L >= S ? S : L);
        const o: Vec2 = [box.center[0] + across[0] * off, box.center[1] + across[1] * off];
        emit(o, along, (L >= S ? box.hu : box.hv) + 16, 'lane', 0, counter.n);
        void half;
      }
      return;
    }
    // cut across the longer dimension
    const cutDir = tooLong ? box.v : box.u;        // direction of the new street
    const alongDir = tooLong ? box.u : box.v;      // axis we are cutting across
    const dim = tooLong ? L : S;
    const halfLen = (tooLong ? box.hv : box.hu) + 16;
    const off = rng.range(-0.18, 0.18) * dim;
    const ang = rng.range(-1, 1) * g.angle * 0.8;
    const dirRot = v2.rot(cutDir, ang);
    const o: Vec2 = [box.center[0] + alongDir[0] * off, box.center[1] + alongDir[1] * off];
    emit(o, dirRot, halfLen, cls, 0, counter.n);
    const [a, b] = splitPolygon(p, o, dirRot);
    rec(a, depth + 1, cls); rec(b, depth + 1, cls);
  };
  rec(poly, 0, g.cls);
  return out;
}

export function buildRoads(terrain: Terrain, rng: RNG): RoadBuild {
  const warp = new Noise2D(rng.seed + 5);
  const namer = new Namer(rng.fork('street-names'));
  const protect = (p: Vec2) => Math.abs(p[0]) > 1190 || Math.abs(p[1]) > 940;

  const authored: InputPolyline[] = AUTHORED_ROADS.map(r => ({ streetId: r.streetId, name: r.name, cls: r.cls, points: resample(r.points, 24) }));

  // 1) super-blocks from the authored skeleton
  const g0 = new RoadGraph(2.4, protect);
  g0.build(authored, 9);
  const superBlocks = g0.faces();

  // 2) subdivide each super-block with district-specific local streets
  const generated: InputPolyline[] = [];
  const counter = { n: 0 };
  for (const f of superBlocks) {
    const c = centroid(f.polygon);
    const d = districtAt(c);
    if (!d) continue;
    if (zoneAt(c)) continue;
    if (!landOk(c, terrain) && polyArea(f.polygon) < 40000) continue;
    generated.push(...subdivide(f.polygon, d, rng.fork('sub-' + Math.round(c[0]) + '-' + Math.round(c[1])), terrain, warp, namer, counter));
  }

  // 3) full graph
  const graph = new RoadGraph(2.4, protect);
  graph.build([...authored, ...generated], 9);
  const faces = graph.faces();

  // ── convert to output structures ──────────────────────────────────────────
  const live = graph.liveEdges();
  const nodeIdMap = new Map<number, string>();
  const nodes: RoadNode[] = [];
  let ni = 0;
  for (const n of graph.nodes) {
    if (!n.edges.length) continue;
    const id = `n${ni++}`; nodeIdMap.set(n.id, id);
    nodes.push({ id, x: round(n.p[0]), z: round(n.p[1]), edges: [], kind: n.edges.length === 2 ? 'bend' : n.edges.length === 1 ? 'end' : 'junction' });
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const nodeHeight = new Map<string, number>();
  for (const n of nodes) nodeHeight.set(n.id, terrain.height(n.x, n.z));

  for (const r of ROUNDABOUTS) {
    let best: RoadNode | null = null, bd = 12;
    for (const n of nodes) { const d = Math.hypot(n.x - r.x, n.z - r.z); if (d < bd) { bd = d; best = n; } }
    if (best) { best.kind = 'roundabout'; best.radius = r.r; }
  }

  const edges: (RoadEdge & { heights: number[] })[] = [];
  const edgeById = new Map<string, RoadEdge & { heights: number[] }>();
  const streetMap = new Map<string, { id: string; name: string; cls: RoadClass; edgeIds: string[] }>();
  const edgeOutIds = new Map<number, string>();
  let ei = 0;
  for (const e of live) {
    const a = nodeIdMap.get(e.a)!, b = nodeIdMap.get(e.b)!;
    // keep the exact graph geometry (blocks were cut from it); only add points on long straight runs
    const pts = densify(e.points, 22).map(p => [round(p[0]), round(p[1])] as Vec2);
    pts[0] = [nodeById.get(a)!.x, nodeById.get(a)!.z]; pts[pts.length - 1] = [nodeById.get(b)!.x, nodeById.get(b)!.z];
    const id = `e${ei++}`;
    edgeOutIds.set(e.id, id);
    const bridgeDef = BRIDGES.find(bd => bd.streetId === e.streetId);
    let bridge: RoadEdge['bridge'] | undefined;
    if (bridgeDef && pts.some(p => distToRiver(p[0], p[1]) < 0)) bridge = { kind: bridgeDef.kind, deckHeight: bridgeDef.deckHeight };
    let heights = pts.map(p => terrain.height(p[0], p[1]));
    heights[0] = nodeHeight.get(a)!; heights[heights.length - 1] = nodeHeight.get(b)!;
    if (bridge) {
      const h0 = heights[0], h1 = heights[heights.length - 1];
      heights = pts.map((_, i) => { const t = i / (pts.length - 1); return Math.max(h0 * (1 - t) + h1 * t, bridge!.deckHeight); });
    } else {
      heights = smoothProfile(heights, 3);
      heights[0] = nodeHeight.get(a)!; heights[heights.length - 1] = nodeHeight.get(b)!;
    }
    const edge: RoadEdge & { heights: number[] } = { id, a, b, cls: e.cls, points: pts, heights: heights.map(h => round(h, 2)), length: round(polylineLength(pts), 1), streetId: e.streetId, name: bridge ? bridgeDef!.name : e.name, bridge };
    edges.push(edge); edgeById.set(id, edge);
    nodeById.get(a)!.edges.push(id); nodeById.get(b)!.edges.push(id);
    const s = streetMap.get(e.streetId) ?? { id: e.streetId, name: e.name, cls: e.cls, edgeIds: [] };
    s.edgeIds.push(id); streetMap.set(e.streetId, s);
  }
  for (const n of nodes) {
    if (n.kind === 'roundabout' || n.edges.length < 3) continue;
    const ranks = n.edges.map(id => CLASS_RANK[edgeById.get(id)!.cls]).sort((x, y) => y - x);
    n.signals = ranks[0] >= CLASS_RANK.secondary && ranks[1] >= CLASS_RANK.secondary;
  }
  (graph as any).outIds = nodeIdMap;
  (graph as any).edgeOutIds = edgeOutIds;
  return { graph, nodes, edges, faces, streets: [...streetMap.values()], edgeById, nodeById };
}

export function round(v: number, d = 2): number { const m = Math.pow(10, d); return Math.round(v * m) / m; }
export function profileOf(cls: RoadClass) { return ROAD_PROFILES[cls]; }
export { distPointSeg };
export type { Face, Polygon };
