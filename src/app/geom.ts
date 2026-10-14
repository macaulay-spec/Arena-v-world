/** Geometry builders producing merged BufferGeometries for the atlas and prop materials. */
import * as THREE from 'three';
import type { Atlas } from './atlas';

type V3 = [number, number, number];

class Chunked {
  pos: number[] = []; nrm: number[] = []; idx: number[] = [];
  get vertexCount() { return this.pos.length / 3; }
}

/** builder for the atlas material (textured, tintable surfaces) */
export class AtlasBuilder extends Chunked {
  uv: number[] = []; tile: number[] = []; col: number[] = []; lit: number[] = []; id: number[] = [];
  private tileCache = new Map<string, [number, number]>();
  constructor(public atlas: Atlas) { super(); }

  private tileOf(name: string): [number, number] { let t = this.tileCache.get(name); if (!t) { t = this.atlas.tileOrigin(name); this.tileCache.set(name, t); } return t; }

  /** add a vertex; uv in tile repeats */
  vertex(p: V3, n: V3, u: number, v: number, tile: [number, number], c: THREE.Color, lit: number, id: number): number {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v); this.tile.push(tile[0], tile[1]); this.col.push(c.r, c.g, c.b); this.lit.push(lit); this.id.push(id);
    return this.vertexCount - 1;
  }

  /**
   * quad p0..p3 (counter-clockwise seen from the front). uv: p0=(u0,v0), p1=(u1,v0), p2=(u1,v1), p3=(u0,v1)
   */
  quad(p0: V3, p1: V3, p2: V3, p3: V3, tileName: string, u0: number, v0: number, u1: number, v1: number, color: THREE.Color, lit = 0, id = -1, normal?: V3) {
    const n = normal ?? faceNormal(p0, p1, p2);
    const t = this.tileOf(tileName);
    const a = this.vertex(p0, n, u0, v0, t, color, lit, id), b = this.vertex(p1, n, u1, v0, t, color, lit, id), c = this.vertex(p2, n, u1, v1, t, color, lit, id), d = this.vertex(p3, n, u0, v1, t, color, lit, id);
    this.idx.push(a, b, c, a, c, d);
  }

  /** quad whose winding is corrected so that its normal points along `facing` (useful for roofs/soffits) */
  quadFacing(p0: V3, p1: V3, p2: V3, p3: V3, tileName: string, u0: number, v0: number, u1: number, v1: number, color: THREE.Color, lit: number, id: number, facing: V3) {
    const n = faceNormal(p0, p1, p2);
    if (n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] >= 0) this.quad(p0, p1, p2, p3, tileName, u0, v0, u1, v1, color, lit, id, n);
    else this.quad(p1, p0, p3, p2, tileName, u0, v0, u1, v1, color, lit, id, [-n[0], -n[1], -n[2]]);
  }
  triFacing(p0: V3, p1: V3, p2: V3, uv0: [number, number], uv1: [number, number], uv2: [number, number], tileName: string, color: THREE.Color, lit: number, id: number, facing: V3) {
    const n = faceNormal(p0, p1, p2);
    if (n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] >= 0) this.tri(p0, p1, p2, uv0, uv1, uv2, tileName, color, lit, id, n);
    else this.tri(p1, p0, p2, uv1, uv0, uv2, tileName, color, lit, id, [-n[0], -n[1], -n[2]]);
  }

  /** triangle with explicit uvs */
  tri(p0: V3, p1: V3, p2: V3, uv0: [number, number], uv1: [number, number], uv2: [number, number], tileName: string, color: THREE.Color, lit = 0, id = -1, normal?: V3) {
    const n = normal ?? faceNormal(p0, p1, p2);
    const t = this.tileOf(tileName);
    const a = this.vertex(p0, n, uv0[0], uv0[1], t, color, lit, id), b = this.vertex(p1, n, uv1[0], uv1[1], t, color, lit, id), c = this.vertex(p2, n, uv2[0], uv2[1], t, color, lit, id);
    this.idx.push(a, b, c);
  }

  /** horizontal polygon (fan, must be star-shaped from its first vertex or convex) at height y with world-space uv (metres / tile size) */
  polygonY(poly: [number, number][], y: number, tileName: string, color: THREE.Color, scale: number, id = -1, ccwUp = true) {
    if (poly.length < 3) return;
    const t = this.tileOf(tileName);
    const n: V3 = [0, 1, 0];
    const ids = poly.map(p => this.vertex([p[0], y, p[1]], n, p[0] / scale, p[1] / scale, t, color, 0, id));
    for (let i = 1; i + 1 < ids.length; i++) { if (ccwUp) this.idx.push(ids[0], ids[i + 1], ids[i]); else this.idx.push(ids[0], ids[i], ids[i + 1]); }
  }

  /** polygon with per-vertex heights, fan triangulated from a centre point */
  fanY(center: [number, number], cy: number, ring: [number, number][], ys: number[], tileName: string, color: THREE.Color, scale: number, id = -1) {
    const t = this.tileOf(tileName); const n: V3 = [0, 1, 0];
    const c = this.vertex([center[0], cy, center[1]], n, center[0] / scale, center[1] / scale, t, color, 0, id);
    const ids = ring.map((p, i) => this.vertex([p[0], ys[i], p[1]], n, p[0] / scale, p[1] / scale, t, color, 0, id));
    for (let i = 0; i < ids.length; i++) { const a = ids[i], b = ids[(i + 1) % ids.length]; this.idx.push(c, b, a); }
  }

  /** horizontal triangle with world-space uvs (a, b, c seen CCW from above: y up, x east, z south ⇒ push reversed) */
  triY(a: V3, b: V3, c: V3, tileName: string, color: THREE.Color, scale: number, id = -1) {
    const t = this.tileOf(tileName); const n: V3 = [0, 1, 0];
    const ia = this.vertex(a, n, a[0] / scale, a[2] / scale, t, color, 0, id);
    const ib = this.vertex(b, n, b[0] / scale, b[2] / scale, t, color, 0, id);
    const ic = this.vertex(c, n, c[0] / scale, c[2] / scale, t, color, 0, id);
    // orient upward: signed area in xz (x right, z down) negative ⇒ CCW seen from +y
    const area = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
    if (area < 0) this.idx.push(ia, ib, ic); else this.idx.push(ia, ic, ib);
  }

  /** triangulated strip between two polylines of equal length (left/right), with heights */
  strip(left: V3[], right: V3[], tileName: string, color: THREE.Color, uScale: number, vScale: number, id = -1, flip = false) {
    const t = this.tileOf(tileName);
    const n: V3 = [0, 1, 0];
    let s = 0;
    const li: number[] = [], ri: number[] = [];
    for (let i = 0; i < left.length; i++) {
      if (i > 0) s += Math.hypot(left[i][0] - left[i - 1][0], left[i][2] - left[i - 1][2]);
      li.push(this.vertex(left[i], n, 0, s / vScale, t, color, 0, id));
      ri.push(this.vertex(right[i], n, uScale, s / vScale, t, color, 0, id));
    }
    if (left.length > 1) { const nn = faceNormal(left[0], right[1], right[0]); if (nn[1] < 0) flip = !flip; }
    for (let i = 0; i + 1 < left.length; i++) {
      if (!flip) this.idx.push(li[i], ri[i + 1], ri[i], li[i], li[i + 1], ri[i + 1]);
      else this.idx.push(li[i], ri[i], ri[i + 1], li[i], ri[i + 1], li[i + 1]);
    }
  }

  /** axis-aligned-in-local-frame box: centre (cx, cz), half sizes, rotation; y0..y1. Walls use wall tile with (bayWidth, floorHeight) uv scale; top uses roof tile */
  box(cx: number, cz: number, hw: number, hd: number, rot: number, y0: number, y1: number, wallTile: string, wallU: number, wallV: number, color: THREE.Color, topTile: string | null, topColor: THREE.Color, topScale: number, lit = 0, id = -1, bottom = false, sideMask = 15) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (x: number, z: number, y: number): V3 => [cx + x * c - z * s, y, cz + x * s + z * c];
    // local corners: front (-hd), right (+hw), back (+hd), left (-hw)
    const sides: [[number, number], [number, number], number][] = [
      [[-hw, -hd], [hw, -hd], 0], // front (local -Z) viewed from outside: from left to right
      [[hw, -hd], [hw, hd], 1],
      [[hw, hd], [-hw, hd], 2],
      [[-hw, hd], [-hw, -hd], 3],
    ];
    for (const [a, b, sideIdx] of sides) {
      if (!(sideMask & (1 << sideIdx))) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const p0 = P(a[0], a[1], y0), p1 = P(b[0], b[1], y0), p2 = P(b[0], b[1], y1), p3 = P(a[0], a[1], y1);
      // outward normal: for CCW-from-above ordering the outside is to the right of a→b when looking from above with y up... compute via cross and flip if pointing inward
      let n = faceNormal(p0, p1, p2);
      const mid: V3 = [(p0[0] + p1[0]) / 2, 0, (p0[2] + p1[2]) / 2];
      if ((mid[0] - cx) * n[0] + (mid[2] - cz) * n[2] < 0) { n = [-n[0], -n[1], -n[2]]; this.quad(p1, p0, p3, p2, wallTile, 0, (y1 - y0) / wallV, len / wallU, 0, color, lit, id, n); }
      else this.quad(p0, p1, p2, p3, wallTile, 0, (y1 - y0) / wallV, len / wallU, 0, color, lit, id, n);
    }
    if (topTile) {
      const t0 = P(-hw, -hd, y1), t1 = P(hw, -hd, y1), t2 = P(hw, hd, y1), t3 = P(-hw, hd, y1);
      this.quadUp(t0, t1, t2, t3, topTile, topColor, topScale, id);
    }
    if (bottom) {
      const t0 = P(-hw, -hd, y0), t1 = P(hw, -hd, y0), t2 = P(hw, hd, y0), t3 = P(-hw, hd, y0);
      this.quadUp(t3, t2, t1, t0, wallTile, color, topScale, id, [0, -1, 0]);
    }
  }

  /** upward facing quad with world-planar uvs */
  quadUp(p0: V3, p1: V3, p2: V3, p3: V3, tileName: string, color: THREE.Color, scale: number, id = -1, normal: V3 = [0, 1, 0]) {
    const t = this.tileOf(tileName);
    const pts = [p0, p1, p2, p3];
    const ids = pts.map(p => this.vertex(p, normal, p[0] / scale, p[2] / scale, t, color, 0, id));
    // ensure upward winding (counter-clockwise when seen from +y)
    const n = faceNormal(p0, p1, p2);
    if (n[1] * normal[1] >= 0) this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    else this.idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.tile, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLit', new THREE.Float32BufferAttribute(this.lit, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(this.id, 1));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

/** builder for the vertex-colour prop material */
export class ColorBuilder extends Chunked {
  col: number[] = []; tint: number[] = []; em: number[] = [];
  vertex(p: V3, n: V3, c: THREE.Color, tint = 0, em = 0): number { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(c.r, c.g, c.b); this.tint.push(tint); this.em.push(em); return this.vertexCount - 1; }
  tri(p0: V3, p1: V3, p2: V3, c: THREE.Color, tint = 0, em = 0, n?: V3) { const nn = n ?? faceNormal(p0, p1, p2); this.idx.push(this.vertex(p0, nn, c, tint, em), this.vertex(p1, nn, c, tint, em), this.vertex(p2, nn, c, tint, em)); }
  quad(p0: V3, p1: V3, p2: V3, p3: V3, c: THREE.Color, tint = 0, em = 0, n?: V3) { const nn = n ?? faceNormal(p0, p1, p2); const a = this.vertex(p0, nn, c, tint, em), b = this.vertex(p1, nn, c, tint, em), cc = this.vertex(p2, nn, c, tint, em), d = this.vertex(p3, nn, c, tint, em); this.idx.push(a, b, cc, a, cc, d); }
  /** box centred at (x, y, z) with full sizes, optional rotation around y */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: THREE.Color, tint = 0, em = 0, rot = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2; const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (lx: number, ly: number, lz: number): V3 => [x + lx * cs - lz * sn, y + ly, z + lx * sn + lz * cs];
    const R = (nx: number, nz: number): V3 => [nx * cs - nz * sn, 0, nx * sn + nz * cs];
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), c, tint, em, R(-1, 0));
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), c, tint, em, R(1, 0));
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), c, tint, em, R(0, 1));
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), c, tint, em, R(0, -1));
    this.quad(P(-hx, hy, -hz), P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), c, tint, em, [0, 1, 0]);
    this.quad(P(-hx, -hy, hz), P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), c, tint, em, [0, -1, 0]);
  }
  /** vertical cylinder / cone (r0 bottom, r1 top) */
  cylinder(x: number, y0: number, z: number, r0: number, r1: number, h: number, seg: number, c: THREE.Color, tint = 0, em = 0, cap = true) {
    const ring0: V3[] = [], ring1: V3[] = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; ring0.push([x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0]); ring1.push([x + Math.cos(a) * r1, y0 + h, z + Math.sin(a) * r1]); }
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; const a = (i + 0.5) / seg * Math.PI * 2; const n: V3 = [Math.cos(a), (r0 - r1) / Math.max(h, 1e-3), Math.sin(a)]; const l = Math.hypot(n[0], n[1], n[2]); this.quad(ring0[i], ring1[i], ring1[j], ring0[j], c, tint, em, [n[0] / l, n[1] / l, n[2] / l]); }
    if (cap && r1 > 0) { for (let i = 1; i + 1 < seg; i++) this.tri(ring1[0], ring1[i + 1], ring1[i], c, tint, em, [0, 1, 0]); }
  }
  /** sphere-ish blob (lat/long), squashed by sy */
  sphere(x: number, y: number, z: number, r: number, sy: number, seg: number, rings: number, c: THREE.Color, tint = 0, em = 0, jitter = 0, rnd?: () => number) {
    const pts: V3[][] = [];
    for (let j = 0; j <= rings; j++) { const row: V3[] = []; const phi = (j / rings) * Math.PI; for (let i = 0; i < seg; i++) { const th = (i / seg) * Math.PI * 2; const jr = jitter && rnd ? 1 + (rnd() - 0.5) * jitter : 1; row.push([x + Math.sin(phi) * Math.cos(th) * r * jr, y + Math.cos(phi) * r * sy * jr, z + Math.sin(phi) * Math.sin(th) * r * jr]); } pts.push(row); }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const k = (i + 1) % seg; const a = pts[j][i], b = pts[j][k], cc = pts[j + 1][k], d = pts[j + 1][i]; const n: V3 = [(a[0] + cc[0]) / 2 - x, ((a[1] + cc[1]) / 2 - y) / sy, (a[2] + cc[2]) / 2 - z]; const l = Math.hypot(n[0], n[1], n[2]) || 1; const nn: V3 = [n[0] / l, n[1] / l, n[2] / l]; if (j === 0) this.tri(a, d, cc, c, tint, em, nn); else if (j === rings - 1) this.tri(a, b, cc, c, tint, em, nn); else this.quad(a, b, cc, d, c, tint, em, nn); }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 1));
    g.setAttribute('aEm', new THREE.Float32BufferAttribute(this.em, 1));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

export function faceNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

export const COL = (hex: string) => new THREE.Color(hex);
export type { V3 };
