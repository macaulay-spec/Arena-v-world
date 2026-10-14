/** Junction geometry helpers shared by the generator (prop placement) and the renderer (intersection meshes). */
import type { RoadNode, RoadEdge, Vec2, RoadClass } from './types';
import { carriagewayHalfWidth, CLASS_RANK, ROAD_PROFILES } from './types';
import { v2, lineIntersect } from './geom';

export const ROUNDABOUT_RING = 10;       // carriageway width of a roundabout ring (centred on node.radius)
export const ROUNDABOUT_WALK = 2.0;      // sidewalk ring width outside the ring

export function cornerRadius(cls: RoadClass): number {
  switch (cls) { case 'arterial': return 9; case 'waterfront': return 7; case 'secondary': return 6.5; case 'service': return 7; case 'local': return 4; case 'access': return 3; default: return 2.5; }
}

/** unit direction of edge e leaving node n */
export function edgeDirAt(e: RoadEdge, nodeId: string): Vec2 {
  const pts = e.a === nodeId ? e.points : e.points.slice().reverse();
  for (let i = 1; i < pts.length; i++) { const d = v2.sub(pts[i], pts[0]); if (v2.len(d) > 1e-6) return v2.norm(d); }
  return [1, 0];
}

/** right-hand side vector for a driver heading along d (x east, z south) */
export function rightOf(d: Vec2): Vec2 { return [-d[1], d[0]]; }

export interface Corner {
  /** indices into JunctionGeom.order */
  i: number; j: number;
  /** kerb side perpendiculars pointing into the wedge */
  pi: Vec2; pj: Vec2;
  /** fillet centre and radius (null when the kerbs run straight through) */
  O: Vec2 | null; R: number;
  /** tangent points on the kerb lines of i and j */
  Ti: Vec2; Tj: Vec2;
}
export interface JunctionGeom {
  node: RoadNode;
  order: RoadEdge[];
  dirs: Vec2[];
  trims: number[];
  corners: Corner[];
}

const cache = new WeakMap<RoadNode, JunctionGeom>();

export function junctionGeometry(node: RoadNode, edgeById: Map<string, RoadEdge>): JunctionGeom {
  const hit = cache.get(node); if (hit) return hit;
  const inc = node.edges.map(id => edgeById.get(id)!).filter(Boolean);
  const withDir = inc.map(e => ({ e, d: edgeDirAt(e, node.id) }));
  withDir.sort((a, b) => Math.atan2(a.d[1], a.d[0]) - Math.atan2(b.d[1], b.d[0]));
  const order = withDir.map(w => w.e), dirs = withDir.map(w => w.d);
  const k = order.length;
  const trims = new Array(k).fill(0);
  const corners: Corner[] = [];
  const N: Vec2 = [node.x, node.z];
  const res: JunctionGeom = { node, order, dirs, trims, corners };
  if (node.kind === 'roundabout') { trims.fill((node.radius ?? 15) + ROUNDABOUT_RING / 2 + 0.5); cache.set(node, res); return res; }
  if (k <= 1) { trims.fill(0.3); cache.set(node, res); return res; }
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    const di = dirs[i], dj = dirs[j];
    const hi = carriagewayHalfWidth(order[i].cls), hj = carriagewayHalfWidth(order[j].cls);
    let pi = v2.perp(di); if (v2.dot(pi, dj) < 0 && k > 2) pi = [-pi[0], -pi[1]];
    let pj = v2.perp(dj); if (v2.dot(pj, di) < 0 && k > 2) pj = [-pj[0], -pj[1]];
    if (k === 2) { // bend: wedge i→j in sort order; choose perps pointing into that wedge consistently
      const ai = Math.atan2(di[1], di[0]); let aj = Math.atan2(dj[1], dj[0]); if (aj < ai) aj += Math.PI * 2;
      const mid: Vec2 = [Math.cos((ai + aj) / 2), Math.sin((ai + aj) / 2)];
      if (v2.dot(pi, mid) < 0) pi = [-pi[0], -pi[1]];
      if (v2.dot(pj, mid) < 0) pj = [-pj[0], -pj[1]];
    }
    const oi = v2.add(N, v2.scale(pi, hi)), oj = v2.add(N, v2.scale(pj, hj));
    // wedge angle from i to j in sort order
    const ai = Math.atan2(di[1], di[0]); let aj = Math.atan2(dj[1], dj[0]); if (aj <= ai) aj += Math.PI * 2;
    const phi = aj - ai;
    const maxCls = CLASS_RANK[order[i].cls] >= CLASS_RANK[order[j].cls] ? order[i].cls : order[j].cls;
    if (phi >= Math.PI - 0.02) { corners.push({ i, j, pi, pj, O: null, R: 0, Ti: oi, Tj: oj }); continue; }
    let R = cornerRadius(maxCls);
    if (phi < 1.0) R *= Math.max(0.3, phi / 1.0);
    if (k === 2) R = Math.min(R, 1.5);
    const O = lineIntersect(v2.add(oi, v2.scale(pi, R)), di, v2.add(oj, v2.scale(pj, R)), dj);
    if (!O) { corners.push({ i, j, pi, pj, O: null, R: 0, Ti: oi, Tj: oj }); continue; }
    const ti = v2.dot(v2.sub(O, oi), di), tj = v2.dot(v2.sub(O, oj), dj);
    const Ti = v2.add(oi, v2.scale(di, ti)), Tj = v2.add(oj, v2.scale(dj, tj));
    trims[i] = Math.max(trims[i], ti); trims[j] = Math.max(trims[j], tj);
    corners.push({ i, j, pi, pj, O, R, Ti, Tj });
  }
  // keep trims sane
  for (let i = 0; i < k; i++) { const e = order[i]; trims[i] = Math.max(0, Math.min(trims[i], e.length * 0.45)); }
  cache.set(node, res);
  return res;
}

/** distance from the node centre at which edge `e` starts (carriageway trimmed back for the junction) */
export function trimDistance(node: RoadNode, e: RoadEdge, edgeById: Map<string, RoadEdge>): number {
  const jg = junctionGeometry(node, edgeById);
  const i = jg.order.indexOf(e);
  return i >= 0 ? jg.trims[i] : 0;
}

export function profileHeightAt(e: RoadEdge & { heights?: number[] }, s: number): number {
  if (!e.heights) return 0;
  let acc = 0;
  for (let i = 1; i < e.points.length; i++) {
    const l = v2.dist(e.points[i - 1], e.points[i]);
    if (s <= acc + l || i === e.points.length - 1) { const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0; return e.heights[i - 1] * (1 - t) + e.heights[i] * t; }
    acc += l;
  }
  return e.heights[e.heights.length - 1];
}

export { ROAD_PROFILES };
