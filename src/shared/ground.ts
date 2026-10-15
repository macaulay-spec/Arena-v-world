/**
 * Ground model = terrain graded to the road network. Roads are level across their width and follow smoothed
 * centre-line heights; terrain blends to the road grade across a short embankment band.
 * Shared by generator (building bases, props), tests and renderer (terrain mesh).
 */
import type { RoadEdge, RoadClass } from './types';
import { corridorHalfWidth, carriagewayHalfWidth, ROAD_PROFILES } from './types';
import { Terrain } from './terrain';
import { SpatialHash, v2, bbox, pointInPolygon, distToPolygonEdge } from './geom';
import type { Vec2 } from './types';

export interface GradedEdge { id: string; cls: RoadClass; points: Vec2[]; heights: number[]; half: number; bridge: boolean; drain: boolean; }

/** heights of the road build-up above the graded road surface (must match src/app/world/roads.ts) */
export const ROAD_SURFACE = { asphalt: 0.02, walk: 0.15, median: 0.2, drainWidth: 0.6, gradeDrop: 0.02 } as const;
export interface Plateau { polygon: Vec2[]; y: number }

export class Ground {
  private hash = new SpatialHash<{ e: GradedEdge; i: number }>(40);
  edges: GradedEdge[] = [];
  readonly bandWidth = 9;
  /** flattened terraces (landmark sites) blended into the terrain over `plateauBand` metres */
  readonly plateauBand = 7;
  private plateaus: (Plateau & { box: { minX: number; maxX: number; minZ: number; maxZ: number } })[] = [];
  /** flattened terraces (read-only) */
  get terraces(): readonly Plateau[] { return this.plateaus; }

  constructor(public terrain: Terrain, edges: (RoadEdge & { heights?: number[] })[], plateaus: Plateau[] = []) {
    for (const p of plateaus) this.plateaus.push({ ...p, box: bbox(p.polygon) });
    for (const e of edges) {
      const g: GradedEdge = { id: e.id, cls: e.cls, points: e.points, heights: e.heights ?? e.points.map(p => terrain.height(p[0], p[1])), half: corridorHalfWidth(e.cls), bridge: !!e.bridge, drain: !!e.drain };
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

  /**
   * Terrace (plateau) influence at (x, z): the terrace height and a blend factor `s` — 0 inside the
   * polygon, easing to 1 at the outer edge of the `plateauBand` — or null when no terrace is near.
   */
  plateauAt(x: number, z: number): { y: number; s: number } | null {
    for (const p of this.plateaus) {
      const B = this.plateauBand, b = p.box;
      if (x < b.minX - B || x > b.maxX + B || z < b.minZ - B || z > b.maxZ + B) continue;
      if (pointInPolygon([x, z], p.polygon)) return { y: p.y, s: 0 };
      const d = distToPolygonEdge([x, z], p.polygon);
      if (d >= B) continue;
      const k = d / B;
      return { y: p.y, s: k * k * (3 - 2 * k) };
    }
    return null;
  }

  /** road-graded ground ignoring terraces; `road` = true inside a road's level corridor */
  private graded(x: number, z: number): { h: number; road: boolean } {
    const t = this.terrain.height(x, z);
    const r = this.nearestRoad(x, z);
    if (!r) return { h: t, road: false };
    if (r.edge.bridge) {
      // bridges do not grade the terrain, except at their abutments (first/last 12 m handled by the terrain itself)
      return { h: t, road: false };
    }
    const inner = r.half + 0.6;
    if (r.dist <= inner) return { h: r.y - 0.02, road: true };
    const outer = inner + this.bandWidth;
    if (r.dist >= outer) return { h: t, road: false };
    const k = (r.dist - inner) / (outer - inner);
    const s = k * k * (3 - 2 * k);
    return { h: r.y * (1 - s) + t * s - 0.02 * (1 - s), road: false };
  }

  /**
   * Ground height. A terrace is dead flat inside its polygon — roads never cross a reserved site, so
   * nothing may grade into it (before this rule the road embankment band reached up to 17 m into the
   * JAG House terrace and tilted it by ±2.9 m). Outside the polygon the terrace eases into the graded
   * ground over `plateauBand` metres, except that a road surface always keeps its own grade: where a
   * road runs right along the terrace the step between the two is a retaining wall, not a slope.
   */
  height(x: number, z: number): number {
    const pl = this.plateauAt(x, z);
    if (pl && pl.s === 0) return pl.y;
    const g = this.graded(x, z);
    if (!pl || g.road) return g.h;
    return pl.y * (1 - pl.s) + g.h * pl.s;
  }

  /**
   * Height of the surface a pedestrian actually stands on. `height()` is the graded earth; the road
   * build-up sits on top of it: asphalt 2 cm above the road grade, sidewalks 15 cm, median islands
   * 20 cm, open drains at grade. Bridge decks carry their own grade above the terrain. Feet placed with
   * `height()` sink ankle-deep into every pavement; the player's collision ground uses this instead.
   */
  walkHeight(x: number, z: number): number {
    const pl = this.plateauAt(x, z);
    if (pl && pl.s === 0) return pl.y; // terraces carry their own slabs (collision surfaces)
    const r = this.nearestRoad(x, z);
    if (r) {
      const prof = ROAD_PROFILES[r.cls], cw = carriagewayHalfWidth(r.cls), drain = r.edge.drain && !r.edge.bridge ? ROAD_SURFACE.drainWidth : 0;
      const d = r.dist, S = ROAD_SURFACE;
      let lift: number | null = null;
      if (prof.median > 0 && d <= prof.median / 2 && this.alongEdge(r.edge, x, z) > 8) lift = S.median;
      else if (d <= cw) lift = S.asphalt;
      else if (d <= cw + drain) lift = -S.gradeDrop;
      else if (d <= cw + drain + prof.sidewalk) lift = S.walk;
      if (lift !== null) {
        const deck = r.y + lift;
        // bridges: the deck is the floor while it is above the ground; approaching a bridge from the
        // embankment the terrain itself rises to meet it (abutment grading in the terrain model)
        return r.edge.bridge ? Math.max(this.height(x, z), deck) : deck;
      }
    }
    return this.height(x, z);
  }

  /** distance from the nearer end of the edge's polyline to the foot of (x, z) on it */
  private alongEdge(e: GradedEdge, x: number, z: number): number {
    let acc = 0, best = Infinity, at = 0, total = 0;
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i], b = e.points[i + 1]; const ab = v2.sub(b, a); const l2 = v2.dot(ab, ab); const len = Math.sqrt(l2);
      const t = l2 > 0 ? Math.max(0, Math.min(1, v2.dot([x - a[0], z - a[1]], ab) / l2)) : 0;
      const d = Math.hypot(x - (a[0] + ab[0] * t), z - (a[1] + ab[1] * t));
      if (d < best) { best = d; at = acc + t * len; }
      acc += len;
    }
    total = acc;
    return Math.min(at, total - at);
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
