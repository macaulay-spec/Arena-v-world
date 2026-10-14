/**
 * Planar road graph: takes polylines (authored + procedural), computes intersections, snaps endpoints,
 * removes dangling stubs, merges chains and extracts faces (city blocks).
 */
import type { Vec2, RoadClass } from '../src/shared/types';
import { CLASS_RANK } from '../src/shared/types';
import { v2, segIntersect, projectOnSeg, SpatialHash, signedArea, distPointSeg } from '../src/shared/geom';

export interface InputPolyline { streetId: string; name: string; cls: RoadClass; points: Vec2[]; }

export interface GNode { id: number; p: Vec2; edges: number[]; }
export interface GEdge { id: number; a: number; b: number; points: Vec2[]; cls: RoadClass; streetId: string; name: string; dead?: boolean; }
export interface Face { edges: { edge: number; forward: boolean }[]; polygon: Vec2[]; sideEdge: number[]; area: number; }

interface Seg { a: Vec2; b: Vec2; pl: number; idx: number; cuts: number[]; }

export class RoadGraph {
  nodes: GNode[] = [];
  edges: GEdge[] = [];

  constructor(private mergeDist = 2.2, private protect: (p: Vec2) => boolean = () => false) {}

  /** Build from polylines */
  build(polylines: InputPolyline[], snapDist = 9): void {
    const pls = polylines.map(p => ({ ...p, points: p.points.map(q => [q[0], q[1]] as Vec2) }));

    // 1) snap polyline endpoints onto nearby segments of other streets (creates T junctions)
    const allSegs = (): Seg[] => {
      const segs: Seg[] = [];
      pls.forEach((pl, pi) => { for (let i = 0; i + 1 < pl.points.length; i++) segs.push({ a: pl.points[i], b: pl.points[i + 1], pl: pi, idx: i, cuts: [] }); });
      return segs;
    };
    let segs = allSegs();
    let hash = new SpatialHash<Seg>(60);
    const insert = (s: Seg) => hash.insert(s, Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]));
    segs.forEach(insert);
    pls.forEach((pl, pi) => {
      for (const endIdx of [0, pl.points.length - 1]) {
        const p = pl.points[endIdx];
        const cands = hash.query(p[0] - snapDist, p[1] - snapDist, p[0] + snapDist, p[1] + snapDist);
        let best: { d: number; q: Vec2 } | null = null;
        for (const s of cands) {
          if (s.pl === pi) continue;
          const pr = projectOnSeg(p, s.a, s.b);
          if (pr.dist < snapDist && (!best || pr.dist < best.d)) best = { d: pr.dist, q: pr.point };
        }
        if (best && best.d > 1e-6) { p[0] = best.q[0]; p[1] = best.q[1]; }
      }
    });
    segs = allSegs(); hash = new SpatialHash<Seg>(60); segs.forEach(insert);

    // 2) intersections
    for (const s of segs) {
      const minX = Math.min(s.a[0], s.b[0]), maxX = Math.max(s.a[0], s.b[0]), minZ = Math.min(s.a[1], s.b[1]), maxZ = Math.max(s.a[1], s.b[1]);
      const cands = hash.query(minX - 0.5, minZ - 0.5, maxX + 0.5, maxZ + 0.5);
      for (const o of cands) {
        if (o === s) continue;
        if (o.pl === s.pl && Math.abs(o.idx - s.idx) <= 1) continue;
        if (o.pl < s.pl || (o.pl === s.pl && o.idx < s.idx)) continue; // each pair once
        const hit = segIntersect(s.a, s.b, o.a, o.b);
        if (!hit) continue;
        s.cuts.push(hit.t); o.cuts.push(hit.u);
      }
    }

    // 3) nodes and edges
    const grid = new Map<string, number[]>();
    // nearest existing node within mergeDist (optionally excluding one), else a new node.
    // Excluding the previous node for cut points matters: a crossing that lies within mergeDist of the segment's own
    // start vertex must still produce a junction with the other street rather than being swallowed by the start node.
    const nodeAt = (p: Vec2, exclude = -1): number => {
      const gx = Math.round(p[0] / this.mergeDist), gz = Math.round(p[1] / this.mergeDist);
      let best = -1, bd = this.mergeDist + 1e-9;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const ids = grid.get(`${gx + dx},${gz + dz}`);
        if (!ids) continue;
        for (const id of ids) { if (id === exclude) continue; const d = v2.dist(this.nodes[id].p, p); if (d <= bd) { bd = d; best = id; } }
      }
      if (best >= 0) return best;
      const id = this.nodes.length; this.nodes.push({ id, p: [p[0], p[1]], edges: [] });
      const key = `${gx},${gz}`; const arr = grid.get(key); if (arr) arr.push(id); else grid.set(key, [id]);
      return id;
    };
    for (const s of segs) {
      const ts = [0, 1, ...s.cuts].sort((x, y) => x - y);
      const pl = pls[s.pl];
      let prevT = 0, prevNode = nodeAt(s.a);
      for (const t of ts) {
        if (t <= prevT + 1e-9) continue;
        const isEnd = t >= 1 - 1e-9;
        const q: Vec2 = isEnd ? s.b : v2.lerp(s.a, s.b, t);
        // a cut point (crossing with another street) must not collapse into the node we are coming from
        let n = nodeAt(q, isEnd ? -1 : prevNode);
        if (!isEnd && n !== prevNode && v2.dist(this.nodes[n].p, q) > this.mergeDist) n = nodeAt(q, prevNode);
        if (n !== prevNode) this.addEdge(prevNode, n, [this.nodes[prevNode].p, this.nodes[n].p], pl.cls, pl.streetId, pl.name);
        prevNode = n; prevT = t;
      }
    }
    this.cleanup();
  }

  private addEdge(a: number, b: number, points: Vec2[], cls: RoadClass, streetId: string, name: string): GEdge | null {
    if (a === b) return null;
    // duplicate check
    for (const eid of this.nodes[a].edges) {
      const e = this.edges[eid];
      if (e.dead) continue;
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) {
        if (e.points.length === 2 && points.length === 2) { if (CLASS_RANK[cls] > CLASS_RANK[e.cls]) { e.cls = cls; e.streetId = streetId; e.name = name; } return null; }
      }
    }
    const id = this.edges.length;
    const e: GEdge = { id, a, b, points, cls, streetId, name };
    this.edges.push(e); this.nodes[a].edges.push(id); this.nodes[b].edges.push(id);
    return e;
  }

  private removeEdge(id: number) {
    const e = this.edges[id]; if (e.dead) return; e.dead = true;
    this.nodes[e.a].edges = this.nodes[e.a].edges.filter(x => x !== id);
    this.nodes[e.b].edges = this.nodes[e.b].edges.filter(x => x !== id);
  }

  liveEdges(): GEdge[] { return this.edges.filter(e => !e.dead); }

  /** remove dangling stubs, collapse very short edges, keep only the largest connected component, merge chains */
  private dbg(tag: string): void {
    const at = process.env.VW_DEBUG_AT; if (!at) return;
    const [x, z] = at.split(',').map(Number);
    const near = this.nodes.filter(n => n.edges.length && Math.hypot(n.p[0] - x, n.p[1] - z) < 4);
    console.log(`[graph ${tag}]`, near.map(n => `${n.id}@${n.p.map(v => v.toFixed(2))} deg${n.edges.length}: ${n.edges.map(id => this.edges[id].name + '#' + id).join(', ')}`));
  }

  cleanup(): void {
    this.dbg('before-cleanup');
    this.removeParallelDuplicates();
    this.dbg('after-dedupe');
    this.pruneDangling();
    // collapse short edges
    for (const e of this.liveEdges()) {
      if (e.points.length === 2 && v2.dist(e.points[0], e.points[1]) < 3.5) {
        const keep = e.a, drop = e.b;
        this.removeEdge(e.id);
        const mid: Vec2 = v2.lerp(this.nodes[keep].p, this.nodes[drop].p, 0.5);
        this.nodes[keep].p = mid;
        for (const oid of [...this.nodes[drop].edges]) {
          const o = this.edges[oid];
          if (o.a === drop) o.a = keep; if (o.b === drop) o.b = keep;
          o.points[0] = this.nodes[o.a].p; o.points[o.points.length - 1] = this.nodes[o.b].p;
          if (o.a === o.b) { this.removeEdge(oid); continue; }
          this.nodes[keep].edges.push(oid);
        }
        this.nodes[drop].edges = [];
        for (const oid of this.nodes[keep].edges) { const o = this.edges[oid]; o.points[0] = this.nodes[o.a].p; o.points[o.points.length - 1] = this.nodes[o.b].p; }
      }
    }
    this.rebuildAdjacency();
    this.pruneDangling();
    this.dbg('after-collapse');
    this.keepLargestComponent();
    this.mergeChains();
    // merging can leave a stub where a chain could not be re-added; make the result consistent and stub-free
    this.rebuildAdjacency();
    this.pruneDangling();
    this.keepLargestComponent();
    this.dbg('after-merge');
  }

  /** node→edge lists recomputed from the live edges (guards against stale adjacency after node merges) */
  private rebuildAdjacency(): void {
    for (const n of this.nodes) n.edges = [];
    for (const e of this.edges) { if (e.dead) continue; this.nodes[e.a].edges.push(e.id); this.nodes[e.b].edges.push(e.id); }
  }

  /**
   * A street running inside the corridor of another street (≈ parallel, < 7 m apart) is a duplicate: the generated
   * subdivision occasionally traces an existing road. Lower-ranked / later streets lose. Runs on the fine
   * (one segment per edge) graph before chains are merged, so partial overlaps are handled piecewise.
   */
  private removeParallelDuplicates(): void {
    const live = this.liveEdges();
    const hash = new SpatialHash<GEdge>(40);
    const bb = (e: GEdge) => { const xs = e.points.map(p => p[0]), zs = e.points.map(p => p[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as const; };
    for (const e of live) { const b = bb(e); hash.insert(e, b[0], b[1], b[2], b[3]); }
    const D = 7;
    const order = live.slice().sort((x, y) => CLASS_RANK[x.cls] - CLASS_RANK[y.cls] || y.id - x.id); // weakest / latest first
    // nearest segment of o to p, with its direction (so we can insist the covering street runs parallel)
    const nearest = (p: Vec2, o: GEdge) => { let d = Infinity, dir: Vec2 = [1, 0]; for (let i = 0; i + 1 < o.points.length; i++) { const dd = distPointSeg(p, o.points[i], o.points[i + 1]); if (dd < d) { d = dd; dir = v2.norm(v2.sub(o.points[i + 1], o.points[i])); } } return { d, dir }; };
    for (const e of order) {
      if (e.dead) continue;
      const dirE = v2.norm(v2.sub(e.points[e.points.length - 1], e.points[0]));
      const samples: Vec2[] = [];
      for (let i = 0; i + 1 < e.points.length; i++) { const a = e.points[i], b = e.points[i + 1]; samples.push(a, v2.lerp(a, b, 0.5)); }
      samples.push(e.points[e.points.length - 1]);
      const b = bb(e);
      const cands = hash.query(b[0] - D, b[1] - D, b[2] + D, b[3] + D).filter(o => !o.dead && o !== e && o.streetId !== e.streetId && CLASS_RANK[o.cls] >= CLASS_RANK[e.cls]);
      if (!cands.length) continue;
      // covered = every sample lies within D of a *parallel* run of another street (crossing streets near junctions do not count)
      const covered = samples.every(p => cands.some(o => { const n = nearest(p, o); return n.d < D && Math.abs(v2.dot(n.dir, dirE)) > 0.8; }));
      if (covered) this.removeEdge(e.id);
    }
  }

  private pruneDangling(): void {
    for (let iter = 0; iter < 200; iter++) {
      let changed = false;
      for (const n of this.nodes) if (n.edges.length === 1 && !this.protect(n.p)) { this.removeEdge(n.edges[0]); changed = true; }
      if (!changed) break;
    }
  }

  private keepLargestComponent(): void {
    const seen = new Int32Array(this.nodes.length).fill(-1);
    let best = -1, bestSize = 0, comp = 0;
    for (const n of this.nodes) {
      if (seen[n.id] >= 0 || n.edges.length === 0) continue;
      const stack = [n.id]; seen[n.id] = comp; let size = 0;
      while (stack.length) {
        const id = stack.pop()!; size++;
        for (const eid of this.nodes[id].edges) { const e = this.edges[eid]; const o = e.a === id ? e.b : e.a; if (seen[o] < 0) { seen[o] = comp; stack.push(o); } }
      }
      if (size > bestSize) { bestSize = size; best = comp; }
      comp++;
    }
    for (const n of this.nodes) if (seen[n.id] !== best) for (const eid of [...n.edges]) this.removeEdge(eid);
  }

  /** merge valence-2 nodes where both edges belong to the same street and the turn is gentle */
  private mergeChains(): void {
    for (const n of this.nodes) {
      if (n.edges.length !== 2) continue;
      const e1 = this.edges[n.edges[0]], e2 = this.edges[n.edges[1]];
      if (e1.streetId !== e2.streetId || e1.cls !== e2.cls) continue;
      const d1 = this.dirAt(e1, n.id), d2 = this.dirAt(e2, n.id);
      const ang = Math.acos(Math.max(-1, Math.min(1, v2.dot(d1, d2))));
      if (ang < Math.PI * 0.55) continue; // sharp bend: keep node
      // orient e1 to end at n, e2 to start at n
      const p1 = e1.b === n.id ? e1.points.slice() : e1.points.slice().reverse();
      const p2 = e2.a === n.id ? e2.points.slice() : e2.points.slice().reverse();
      const start = e1.b === n.id ? e1.a : e1.b;
      const end = e2.a === n.id ? e2.b : e2.a;
      if (start === end) continue;
      this.removeEdge(e1.id); this.removeEdge(e2.id);
      this.addEdge(start, end, [...p1, ...p2.slice(1)], e1.cls, e1.streetId, e1.name);
    }
  }

  /** unit direction of edge e leaving node n */
  dirAt(e: GEdge, n: number): Vec2 {
    const pts = e.a === n ? e.points : e.points.slice().reverse();
    for (let i = 1; i < pts.length; i++) { const d = v2.sub(pts[i], pts[0]); if (v2.len(d) > 1e-6) return v2.norm(d); }
    return [1, 0];
  }

  /** extract interior faces (blocks) as polygons with per-side edge ids */
  faces(): Face[] {
    const live = this.liveEdges();
    const out: Face[] = [];
    const visited = new Set<string>();
    // sorted outgoing half-edges per node
    const sorted = new Map<number, { edge: number; ang: number }[]>();
    for (const n of this.nodes) {
      if (!n.edges.length) continue;
      const arr = n.edges.map(eid => ({ edge: eid, ang: v2.angle(this.dirAt(this.edges[eid], n.id)) })).sort((x, y) => x.ang - y.ang);
      sorted.set(n.id, arr);
    }
    for (const e of live) {
      for (const forward of [true, false]) {
        const key = `${e.id}:${forward ? 'f' : 'b'}`;
        if (visited.has(key)) continue;
        const face: Face = { edges: [], polygon: [], sideEdge: [], area: 0 };
        let curE = e, curF = forward; let guard = 0; let ok = true;
        while (guard++ < 5000) {
          const k = `${curE.id}:${curF ? 'f' : 'b'}`;
          if (visited.has(k)) { ok = false; break; }
          visited.add(k);
          face.edges.push({ edge: curE.id, forward: curF });
          const pts = curF ? curE.points : curE.points.slice().reverse();
          for (let i = 0; i + 1 < pts.length; i++) { face.polygon.push(pts[i]); face.sideEdge.push(curE.id); }
          const v = curF ? curE.b : curE.a;
          const list = sorted.get(v)!;
          const idx = list.findIndex(x => x.edge === curE.id);
          const next = list[(idx - 1 + list.length) % list.length];
          const ne = this.edges[next.edge];
          curF = ne.a === v;
          curE = ne;
          if (curE.id === e.id && curF === forward) break;
        }
        if (!ok || face.polygon.length < 3) continue;
        face.area = signedArea(face.polygon);
        if (face.area > 1) out.push(face);
      }
    }
    return out;
  }
}
