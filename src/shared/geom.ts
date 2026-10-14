/** 2D geometry helpers for the city generator and verification tests. All polygons are arrays of [x, z]. */
import type { Vec2, Polygon } from './types';

export const EPS = 1e-9;

export const v2 = {
  add: (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]],
  sub: (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]],
  scale: (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s],
  dot: (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1],
  cross: (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0],
  len: (a: Vec2): number => Math.hypot(a[0], a[1]),
  dist: (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: (a: Vec2): Vec2 => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  /** left-hand perpendicular (rotate +90deg in math coords) */
  perp: (a: Vec2): Vec2 => [-a[1], a[0]],
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  rot: (a: Vec2, ang: number): Vec2 => { const c = Math.cos(ang), s = Math.sin(ang); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; },
  angle: (a: Vec2): number => Math.atan2(a[1], a[0]),
  eq: (a: Vec2, b: Vec2, tol = 1e-6): boolean => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol,
};

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function area(poly: Polygon): number { return Math.abs(signedArea(poly)); }

export function centroid(poly: Polygon): Vec2 {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f; a += f;
  }
  if (Math.abs(a) < EPS) { // degenerate: average
    let sx = 0, sz = 0; for (const p of poly) { sx += p[0]; sz += p[1]; }
    return [sx / poly.length, sz / poly.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

/** make polygon counter-clockwise in math coords (positive signed area) */
export function ensureCCW(poly: Polygon): Polygon { return signedArea(poly) < 0 ? poly.slice().reverse() : poly; }

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    const intersect = ((zi > p[1]) !== (zj > p[1])) && (p[0] < (xj - xi) * (p[1] - zi) / ((zj - zi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function bbox(poly: Polygon): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
  return { minX, maxX, minZ, maxZ };
}

export function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const ab: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  let t = l2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t));
}
export function projectOnSeg(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; dist: number } {
  const ab: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  let t = l2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const point: Vec2 = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { t, point, dist: v2.dist(p, point) };
}

/** distance from point to polygon boundary */
export function distToPolygonEdge(p: Vec2, poly: Polygon): number {
  let d = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) d = Math.min(d, distPointSeg(p, poly[i], poly[(i + 1) % n]));
  return d;
}

/** segment intersection; returns parameters along both segments if they properly intersect (inclusive endpoints) */
export function segIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { t: number; u: number; point: Vec2 } | null {
  const d1x = p2[0] - p1[0], d1z = p2[1] - p1[1], d2x = p4[0] - p3[0], d2z = p4[1] - p3[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const dx = p3[0] - p1[0], dz = p3[1] - p1[1];
  const t = (dx * d2z - dz * d2x) / den;
  const u = (dx * d1z - dz * d1x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u, point: [p1[0] + d1x * t, p1[1] + d1z * t] };
}

export function lineIntersect(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const dx = p2[0] - p1[0], dz = p2[1] - p1[1];
  const t = (dx * d2[1] - dz * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0; for (let i = 1; i < pts.length; i++) l += v2.dist(pts[i - 1], pts[i]); return l;
}

/** point and tangent at arc-length distance s along polyline */
export function polylineAt(pts: Vec2[], s: number): { point: Vec2; dir: Vec2 } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = v2.dist(pts[i - 1], pts[i]);
    if (s <= acc + l || i === pts.length - 1) {
      const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      return { point: v2.lerp(pts[i - 1], pts[i], t), dir: v2.norm(v2.sub(pts[i], pts[i - 1])) };
    }
    acc += l;
  }
  return { point: pts[0], dir: [1, 0] };
}

/** resample a polyline with roughly uniform spacing (keeps endpoints) */
export function resample(pts: Vec2[], spacing: number): Vec2[] {
  const L = polylineLength(pts);
  const n = Math.max(1, Math.round(L / spacing));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(polylineAt(pts, (L * i) / n).point);
  return out;
}

/** keeps every original vertex and subdivides segments longer than maxSpacing (shape-preserving, unlike resample) */
export function densify(pts: Vec2[], maxSpacing: number): Vec2[] {
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = v2.dist(a, b); const n = Math.max(1, Math.ceil(d / maxSpacing));
    for (let k = 1; k <= n; k++) out.push(k === n ? b : v2.lerp(a, b, k / n));
  }
  return out;
}

export function convexHull(points: Vec2[]): Polygon {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

export interface OBB { center: Vec2; u: Vec2; v: Vec2; hu: number; hv: number; }

/** minimum-area oriented bounding box (rotating calipers over hull edges) */
export function obb(poly: Polygon): OBB {
  const hull = convexHull(poly);
  let best: OBB | null = null, bestArea = Infinity;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const u = v2.norm(v2.sub(b, a)); if (v2.len(u) === 0) continue;
    const v = v2.perp(u);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) { const du = v2.dot(p, u), dv = v2.dot(p, v); if (du < minU) minU = du; if (du > maxU) maxU = du; if (dv < minV) minV = dv; if (dv > maxV) maxV = dv; }
    const ar = (maxU - minU) * (maxV - minV);
    if (ar < bestArea) {
      bestArea = ar;
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best = { center: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv], u, v, hu: (maxU - minU) / 2, hv: (maxV - minV) / 2 };
    }
  }
  if (!best) { const c = centroid(poly); return { center: c, u: [1, 0], v: [0, 1], hu: 1, hv: 1 }; }
  return best;
}

/** OBB aligned to a given direction */
export function alignedBox(poly: Polygon, u: Vec2): OBB {
  u = v2.norm(u); const v = v2.perp(u);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of poly) { const du = v2.dot(p, u), dv = v2.dot(p, v); if (du < minU) minU = du; if (du > maxU) maxU = du; if (dv < minV) minV = dv; if (dv > maxV) maxV = dv; }
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
  return { center: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv], u, v, hu: (maxU - minU) / 2, hv: (maxV - minV) / 2 };
}

/** corners of an oriented rectangle (CCW in math coords) */
export function rectCorners(cx: number, cz: number, hw: number, hd: number, rot: number): Polygon {
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts: Polygon = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c] as Vec2);
  return ensureCCW(pts);
}

/** Sutherland-Hodgman clip of polygon against half-plane: keep points where dot(p - o, n) >= 0 */
export function clipHalfPlane(poly: Polygon, o: Vec2, n: Vec2): Polygon {
  const out: Polygon = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const cur = poly[i], prev = poly[(i + len - 1) % len];
    const dc = (cur[0] - o[0]) * n[0] + (cur[1] - o[1]) * n[1];
    const dp = (prev[0] - o[0]) * n[0] + (prev[1] - o[1]) * n[1];
    if (dc >= 0) {
      if (dp < 0) { const t = dp / (dp - dc); out.push(v2.lerp(prev, cur, t)); }
      out.push(cur);
    } else if (dp >= 0) { const t = dp / (dp - dc); out.push(v2.lerp(prev, cur, t)); }
  }
  return dedupe(out);
}

/** split polygon by a line (point o, direction d) → [left side, right side] */
export function splitPolygon(poly: Polygon, o: Vec2, d: Vec2): [Polygon, Polygon] {
  const n = v2.perp(v2.norm(d));
  return [clipHalfPlane(poly, o, n), clipHalfPlane(poly, o, [-n[0], -n[1]])];
}

/** clip polygon by a convex polygon */
export function clipByConvex(poly: Polygon, convex: Polygon): Polygon {
  let out = poly;
  const c = ensureCCW(convex);
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const dir = v2.sub(b, a);
    out = clipHalfPlane(out, a, v2.perp(dir)); // interior on the left for CCW
  }
  return out;
}

export function dedupe(poly: Polygon, tol = 1e-6): Polygon {
  const out: Polygon = [];
  for (const p of poly) if (!out.length || !v2.eq(out[out.length - 1], p, tol)) out.push(p);
  if (out.length > 1 && v2.eq(out[0], out[out.length - 1], tol)) out.pop();
  return out;
}

/** remove nearly collinear vertices */
export function simplifyPolygon(poly: Polygon, tol = 0.05): Polygon {
  if (poly.length <= 3) return poly;
  const out: Polygon = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
    const d = distPointSeg(b, a, c);
    if (d > tol) out.push(b);
  }
  return out.length >= 3 ? out : poly;
}

/**
 * Inset a CCW polygon by a per-edge distance (edge i = poly[i] → poly[i+1]).
 * Returns null when the inset collapses or becomes invalid.
 */
export function insetPolygon(poly: Polygon, dist: number[] | number, debug = false): Polygon | null {
  const p0 = ensureCCW(dedupe(poly, 1e-3));
  if (p0.length < 3) return null;
  // per-edge distances follow the original vertex order; ensureCCW may have reversed it
  const reversed = signedArea(dedupe(poly, 1e-3)) < 0;
  const n0 = p0.length;
  const dArr: number[] = [];
  for (let i = 0; i < n0; i++) {
    if (typeof dist === 'number') dArr.push(dist);
    else dArr.push(reversed ? dist[(n0 - 2 - i + dist.length * 4) % dist.length] : dist[i % dist.length]);
  }
  // merge nearly collinear vertices with equal distances (dense polyline joins)
  const p: Polygon = []; const dd: number[] = [];
  for (let i = 0; i < n0; i++) {
    const a = p0[(i + n0 - 1) % n0], b = p0[i], c = p0[(i + 1) % n0];
    const prevD = dArr[(i + n0 - 1) % n0], curD = dArr[i];
    if (Math.abs(prevD - curD) < 1e-6 && distPointSeg(b, a, c) < 0.02) continue;
    p.push(b); dd.push(curD);
  }
  const n = p.length;
  if (n < 3) return null;
  type Pt = { q: Vec2; e: number }; // e = index of the source edge that STARTS at this point (-1 = bevel)
  const lines = p.map((a, i) => { const b = p[(i + 1) % n]; const dir = v2.norm(v2.sub(b, a)); return { o: v2.add(a, v2.scale(v2.perp(dir), dd[i])), dir, a, b }; });
  const corner = (ia: number, ib: number): Pt[] => {
    const la = lines[ia], lb = lines[ib];
    const vtx = lb.a; // shared original vertex (start of edge ib)
    // where a wide corridor continues as a narrower one (gentle bend, different distances) the corner keeps the wider
    // clearance on both sides so nothing sits in the end of the wider corridor; the narrow side tapers back over its length
    const gentle = v2.dot(la.dir, lb.dir) > 0.5 && Math.abs(dd[ia] - dd[ib]) > 1e-6;
    const da = gentle ? Math.max(dd[ia], dd[ib]) : dd[ia], db = gentle ? Math.max(dd[ia], dd[ib]) : dd[ib];
    const oa = gentle ? v2.add(la.a, v2.scale(v2.perp(la.dir), da)) : la.o, ob = gentle ? v2.add(lb.a, v2.scale(v2.perp(lb.dir), db)) : lb.o;
    const endA = v2.add(vtx, v2.scale(v2.perp(la.dir), da));
    const startB = v2.add(vtx, v2.scale(v2.perp(lb.dir), db));
    const cr = v2.cross(la.dir, lb.dir);
    if (Math.abs(cr) < 0.02) return [{ q: v2.lerp(endA, startB, 0.5), e: ib }];
    const x = lineIntersect(oa, la.dir, ob, lb.dir);
    const limit = 2.5 * Math.max(da, db) + 1;
    if (!x || v2.dist(x, vtx) > limit) return [{ q: endA, e: -1 }, { q: startB, e: ib }];
    return [{ q: x, e: ib }];
  };
  let active: number[] = []; for (let i = 0; i < n; i++) active.push(i);
  let out: Pt[] = [];
  for (let iter = 0; iter < n + 2; iter++) {
    if (active.length < 3) return null;
    out = [];
    for (let k = 0; k < active.length; k++) out.push(...corner(active[(k + active.length - 1) % active.length], active[k]));
    // detect inverted offset edges
    let worst = -1, worstLen = 0;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (a.e < 0) continue;
      const l = v2.dot(v2.sub(b.q, a.q), lines[a.e].dir);
      if (l < worstLen) { worstLen = l; worst = a.e; }
    }
    if (worst < 0) break;
    active = active.filter(i => i !== worst);
  }
  let res: Polygon = dedupe(out.map(o => o.q), 1e-3);
  if (debug) console.log('inset: after collapse', JSON.stringify(res.map(q => q.map(v => +v.toFixed(2)))));
  if (res.length < 3) return null;
  if (!isSimple(res)) { const fixed = largestSimpleLoop(res); if (debug) console.log('inset: not simple → fixed', fixed && JSON.stringify(fixed.map(q => q.map(v => +v.toFixed(2))))); if (!fixed) return null; res = fixed; }
  if (signedArea(res) <= 1) { if (debug) console.log('inset: area', signedArea(res)); return null; }
  for (const q of res) if (!pointInPolygon(q, p) && distToPolygonEdge(q, p) > 0.05) { if (debug) console.log('inset: point outside', q); return null; }
  return res;
}

/** untangle a self-intersecting polygon by splitting at crossings and keeping the largest CCW loop */
export function largestSimpleLoop(poly: Polygon, depth = 0): Polygon | null {
  const n = poly.length;
  if (n < 3 || depth > 12) return null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const x = segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]);
      if (!x) continue;
      const loopA: Polygon = [x.point, ...poly.slice(i + 1, j + 1)];
      const loopB: Polygon = [x.point, ...poly.slice(j + 1), ...poly.slice(0, i + 1)];
      const cands: Polygon[] = [];
      for (const l of [loopA, loopB]) {
        const d = dedupe(l, 1e-3);
        if (d.length < 3) continue;
        const r = isSimple(d) ? d : largestSimpleLoop(d, depth + 1);
        if (r && signedArea(r) > 1) cands.push(r);
      }
      if (!cands.length) return null;
      cands.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
      return ensureCCW(cands[0]);
    }
  }
  return isSimple(poly) ? poly : null;
}

export function isSimple(poly: Polygon): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function polygonsIntersect(a: Polygon, b: Polygon): boolean {
  const ba = bbox(a), bb = bbox(b);
  if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxZ < bb.minZ || bb.maxZ < ba.minZ) return false;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  }
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true;
  return false;
}

/** separating-axis overlap test for convex polygons; returns penetration > tolerance */
export function convexOverlap(a: Polygon, b: Polygon, tolerance = 0.01): boolean {
  const axes: Vec2[] = [];
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) axes.push(v2.norm(v2.perp(v2.sub(poly[(i + 1) % poly.length], poly[i]))));
  for (const ax of axes) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of a) { const d = v2.dot(p, ax); if (d < minA) minA = d; if (d > maxA) maxA = d; }
    for (const p of b) { const d = v2.dot(p, ax); if (d < minB) minB = d; if (d > maxB) maxB = d; }
    if (maxA <= minB + tolerance || maxB <= minA + tolerance) return false;
  }
  return true;
}

/** distance between a point and a polyline */
export function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, distPointSeg(p, pts[i - 1], pts[i])); return d;
}

/** shortest distance between convex polygon and segment (0 if intersecting) */
export function polygonSegDistance(poly: Polygon, a: Vec2, b: Vec2): number {
  for (let i = 0; i < poly.length; i++) if (segIntersect(poly[i], poly[(i + 1) % poly.length], a, b)) return 0;
  if (pointInPolygon(a, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, distPointSeg(poly[i], a, b));
    d = Math.min(d, distPointSeg(a, poly[i], poly[(i + 1) % poly.length]), distPointSeg(b, poly[i], poly[(i + 1) % poly.length]));
  }
  return d;
}

/** uniform grid spatial hash for fast neighbour queries */
export class SpatialHash<T> {
  private cells = new Map<string, T[]>();
  constructor(private cell: number) {}
  private key(x: number, z: number) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number) {
    for (let gx = Math.floor(minX / this.cell); gx <= Math.floor(maxX / this.cell); gx++)
      for (let gz = Math.floor(minZ / this.cell); gz <= Math.floor(maxZ / this.cell); gz++) {
        const k = `${gx},${gz}`; let arr = this.cells.get(k); if (!arr) { arr = []; this.cells.set(k, arr); } arr.push(item);
      }
  }
  query(minX: number, minZ: number, maxX: number, maxZ: number): T[] {
    const out = new Set<T>();
    for (let gx = Math.floor(minX / this.cell); gx <= Math.floor(maxX / this.cell); gx++)
      for (let gz = Math.floor(minZ / this.cell); gz <= Math.floor(maxZ / this.cell); gz++) {
        const arr = this.cells.get(`${gx},${gz}`); if (arr) for (const it of arr) out.add(it);
      }
    return [...out];
  }
}

export function polygonPerimeterEdges(poly: Polygon): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < poly.length; i++) out.push([poly[i], poly[(i + 1) % poly.length]]);
  return out;
}

/** does segment (a,b) lie along polygon boundary (both endpoints within tol of the same boundary edge)? returns the edge index or -1 */
export function edgeOnBoundary(a: Vec2, b: Vec2, poly: Polygon, tol = 0.35): number {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (distPointSeg(a, p, q) < tol && distPointSeg(b, p, q) < tol) return i;
  }
  return -1;
}

/** sample-based inside test for a rectangle against a polygon (corners and edge midpoints) */
export function rectInsidePolygon(rect: Polygon, poly: Polygon, tol = 0.02): boolean {
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i], b = rect[(i + 1) % rect.length];
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const p = v2.lerp(a, b, t);
      if (!pointInPolygon(p, poly) && distToPolygonEdge(p, poly) > tol) return false;
    }
  }
  // the polygon must not poke into the rectangle (concave poly case)
  for (const q of poly) if (pointInPolygon(q, rect) && distToPolygonEdge(q, rect) > tol) return false;
  return true;
}
