/**
 * Ground model = terrain graded to the road network. Roads are level across their width and follow smoothed
 * centre-line heights; terrain blends to the road grade across a short embankment band.
 * Shared by generator (building bases, props), tests and renderer (terrain mesh).
 */
import type { RoadEdge, RoadClass } from './types';
import { corridorHalfWidth } from './types';
import { Terrain } from './terrain';
import { SpatialHash, v2 } from './geom';
import type { Vec2 } from './types';

export interface GradedEdge { id: string; cls: RoadClass; points: Vec2[]; heights: number[]; half: number; bridge: boolean; }

export class Ground {
  private hash = new SpatialHash<{ e: GradedEdge; i: number }>(40);
  edges: GradedEdge[] = [];
  readonly bandWidth = 9;

  constructor(public terrain: Terrain, edges: (RoadEdge & { heights?: number[] })[]) {
    for (const e of edges) {
      const g: GradedEdge = { id: e.id, cls: e.cls, points: e.points, heights: e.heights ?? e.points.map(p => terrain.height(p[0], p[1])), half: corridorHalfWidth(e.cls), bridge: !!e.bridge };
      this.edges.push(g);
      for (let i = 0; i + 1 < g.points.length; i++) {
        const a = g.points[i], b = g.points[i + 1];
        const pad = g.half + this.bandWidth + 1;
        this.hash.insert({ e: g, i }, Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad);
      }
    }
  }

  /** nearest road info: distance to centreline, road surface height there, corridor half width */
  nearestRoad(x: number, z: number): { dist: number; y: number; half: number; cls: RoadClass; edge: GradedEdge; dir: Vec2 } | null {
    const cands = this.hash.query(x, z, x, z);
    let best: { dist: number; y: number; half: number; cls: RoadClass; edge: GradedEdge; dir: Vec2 } | null = null;
    for (const c of cands) {
      const a = c.e.points[c.i], b = c.e.points[c.i + 1];
      const ab = v2.sub(b, a); const l2 = v2.dot(ab, ab);
      let t = l2 > 0 ? v2.dot([x - a[0], z - a[1]], ab) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const px = a[0] + ab[0] * t, pz = a[1] + ab[1] * t;
      const d = Math.hypot(x - px, z - pz);
      // prefer the road whose corridor we are inside; otherwise the nearest surface
      const score = d - c.e.half;
      if (!best || score < best.dist - best.half) {
        const y = c.e.heights[c.i] * (1 - t) + c.e.heights[c.i + 1] * t;
        best = { dist: d, y, half: c.e.half, cls: c.e.cls, edge: c.e, dir: v2.norm(ab) };
      }
    }
    return best;
  }

  /** graded ground height (terrain blended to road grade) */
  height(x: number, z: number): number {
    const t = this.terrain.height(x, z);
    const r = this.nearestRoad(x, z);
    if (!r) return t;
    if (r.edge.bridge) {
      // bridges do not grade the terrain, except at their abutments (first/last 12 m handled by the terrain itself)
      return t;
    }
    const inner = r.half + 0.6;
    if (r.dist <= inner) return r.y - 0.02;
    const outer = inner + this.bandWidth;
    if (r.dist >= outer) return t;
    const k = (r.dist - inner) / (outer - inner);
    const s = k * k * (3 - 2 * k);
    return r.y * (1 - s) + t * s - 0.02 * (1 - s);
  }
}

/** smooth a height profile along a polyline, pinning the end points */
export function smoothProfile(h: number[], passes = 2): number[] {
  let out = h.slice();
  for (let p = 0; p < passes; p++) {
    const next = out.slice();
    for (let i = 1; i + 1 < out.length; i++) next[i] = (out[i - 1] + 2 * out[i] + out[i + 1]) / 4;
    out = next;
  }
  return out;
}
