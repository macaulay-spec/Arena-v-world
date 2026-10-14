/**
 * Terrain of Vora City. A pure function of (x, z) so the generator, tests and renderer agree exactly.
 * Geography: a gentle coastal plain rising towards North Heights, the Ose River running north→south on the
 * east side into the Vora Lagoon which forms the southern edge of the city.
 */
import { Noise2D, smoothstep, clamp } from './noise';
import { distPointSeg, v2 } from './geom';
import type { TerrainParams, Vec2, WaterData } from './types';

export const WATER_LEVEL = 0;

export const DEFAULT_WATER: WaterData = {
  level: WATER_LEVEL,
  river: {
    points: [[415, -950], [432, -720], [452, -520], [470, -360], [458, -180], [462, -20], [478, 150], [505, 300], [540, 430], [585, 560], [640, 720], [700, 950]],
    widths: [58, 60, 62, 66, 70, 74, 78, 84, 92, 110, 150, 220],
  },
  lagoon: { a: 34, b: 1 / 265, c: 210, d: 13, e: 1 / 93, base: 492 },
};

export function makeTerrainParams(seed: number): TerrainParams {
  return {
    seed,
    bounds: { minX: -1200, maxX: 1200, minZ: -950, maxZ: 950 },
    cityBounds: { minX: -820, maxX: 820, minZ: -620, maxZ: 500 },
    resolution: 8,
    water: DEFAULT_WATER,
    plateaus: [],
  };
}

/** z coordinate of the lagoon shoreline at x (water lies at greater z) */
export function shorelineZ(x: number, w: WaterData = DEFAULT_WATER): number {
  const l = w.lagoon;
  return l.base + l.a * Math.sin((x + l.c) * l.b) + l.d * Math.sin(x * l.e);
}

/** signed distance to the river centreline and the local half width */
export function riverInfo(x: number, z: number, w: WaterData = DEFAULT_WATER): { dist: number; halfWidth: number; t: number } {
  const pts = w.river.points;
  let best = Infinity, bestI = 0, bestT = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ab = v2.sub(b, a); const l2 = v2.dot(ab, ab);
    let t = l2 > 0 ? v2.dot(v2.sub([x, z], a), ab) / l2 : 0; t = clamp(t, 0, 1);
    const d = v2.dist([x, z], v2.add(a, v2.scale(ab, t)));
    if (d < best) { best = d; bestI = i; bestT = t; }
  }
  const hw = w.river.widths[bestI - 1] * (1 - bestT) + w.river.widths[bestI] * bestT;
  return { dist: best, halfWidth: hw / 2, t: (bestI - 1 + bestT) / (pts.length - 1) };
}

/** river centreline x at a given z (approximate, for layout) */
export function riverCenterX(z: number, w: WaterData = DEFAULT_WATER): number {
  const pts = w.river.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (z >= a[1] && z <= b[1]) { const t = (z - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; }
  }
  return z < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
}
export function riverHalfWidthAt(z: number, w: WaterData = DEFAULT_WATER): number {
  const pts = w.river.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (z >= a[1] && z <= b[1]) { const t = (z - a[1]) / (b[1] - a[1]); return (w.river.widths[i - 1] * (1 - t) + w.river.widths[i] * t) / 2; }
  }
  return w.river.widths[0] / 2;
}

export class Terrain {
  private n1: Noise2D; private n2: Noise2D; private n3: Noise2D;
  constructor(public params: TerrainParams) {
    this.n1 = new Noise2D(params.seed + 11); this.n2 = new Noise2D(params.seed + 29); this.n3 = new Noise2D(params.seed + 47);
  }

  /** land height without water carving */
  private landHeight(x: number, z: number): number {
    // the coastal plain rises to the north; Old Town sits on a low rise above the harbour
    const northRise = smoothstep(350, -700, z) * 24;
    const oldTownRise = Math.exp(-(((x + 560) / 260) ** 2 + ((z - 150) / 200) ** 2)) * 5;
    const broad = this.n1.fbm(x / 520, z / 520, 3) * 5.5;
    const medium = this.n2.fbm(x / 140, z / 140, 3) * 1.6;
    const fine = this.n3.get(x / 38, z / 38) * 0.25;
    return 5.5 + northRise + oldTownRise + broad + medium + fine;
  }

  height(x: number, z: number): number {
    let h = this.landHeight(x, z);
    const w = this.params.water;
    // lagoon: smooth beach to a shallow bed
    const ds = z - shorelineZ(x, w); // >0 water side
    if (ds > -110) {
      const t = smoothstep(-110, 25, ds);
      const bed = -4.5 - smoothstep(0, 220, ds) * 4;
      h = h * (1 - t) + bed * t;
      if (ds > 0) h = Math.min(h, -1.2 - smoothstep(0, 40, ds) * 3);
    }
    // river: banks slope into a channel
    const r = riverInfo(x, z, w);
    const bankWidth = 55;
    if (r.dist < r.halfWidth + bankWidth) {
      const t = smoothstep(r.halfWidth + bankWidth, r.halfWidth - 6, r.dist);
      const bed = -5.5;
      h = h * (1 - t) + bed * t;
      if (r.dist < r.halfWidth) h = Math.min(h, -1.4);
    }
    // plateaus for large flat facilities
    for (const p of this.params.plateaus) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 60) { const t = smoothstep(p.r + 60, p.r, d); h = h * (1 - t) + p.h * t; }
    }
    return h;
  }

  isWater(x: number, z: number): boolean { return this.height(x, z) < this.params.water.level - 0.05; }

  /** base land height ignoring plateaus: used to define plateau heights deterministically */
  rawHeight(x: number, z: number): number {
    const saved = this.params.plateaus; this.params.plateaus = [];
    const h = this.height(x, z); this.params.plateaus = saved; return h;
  }

  normal(x: number, z: number, e = 2): [number, number, number] {
    const hl = this.height(x - e, z), hr = this.height(x + e, z), hd = this.height(x, z - e), hu = this.height(x, z + e);
    const nx = hl - hr, nz = hd - hu, ny = 2 * e;
    const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  }

  slope(x: number, z: number): number { const n = this.normal(x, z); return 1 - n[1]; }
}

export function distToRiver(x: number, z: number, w: WaterData = DEFAULT_WATER): number {
  const r = riverInfo(x, z, w); return r.dist - r.halfWidth;
}

export function nearestOnRiver(p: Vec2, w: WaterData = DEFAULT_WATER): number {
  const pts = w.river.points; let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distPointSeg(p, pts[i - 1], pts[i]));
  return d;
}
