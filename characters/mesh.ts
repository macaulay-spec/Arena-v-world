/**
 * Mesh containers and utilities shared by all character part generators.
 * A Part is an indexed triangle mesh with skinning data, bound to one material.
 */
import type { MhFace } from './mh/load';

export interface Part {
  name: string;
  material: string;
  pos: number[];      // xyz
  nrm: number[];      // xyz
  uv: number[];       // uv
  col?: number[];     // rgb 0..1 (vertex colour multiplier, optional)
  joints: number[];   // 4 per vertex
  weights: number[];  // 4 per vertex
  idx: number[];
  /** optional: original MakeHuman vertex index per wedge vertex (−1 for synthetic) */
  src?: number[];
}

export function newPart(name: string, material: string): Part {
  return { name, material, pos: [], nrm: [], uv: [], joints: [], weights: [], idx: [], src: [] };
}
export function vertexCount(p: Part): number { return p.pos.length / 3; }
export function triCount(p: Part): number { return p.idx.length / 3; }

/** Area-weighted smooth normals over a face list for a full vertex array (MakeHuman indexing). */
export function faceNormals(pos: Float32Array, faces: MhFace[], nVerts: number): Float32Array {
  const n = new Float32Array(nVerts * 3);
  for (const f of faces) {
    const v = f.v;
    // Newell's method for polygons
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i] * 3, b = v[(i + 1) % v.length] * 3;
      nx += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]);
      ny += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]);
      nz += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
    }
    for (const vi of v) { n[vi * 3] += nx; n[vi * 3 + 1] += ny; n[vi * 3 + 2] += nz; }
  }
  for (let i = 0; i < nVerts; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
    n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l;
  }
  return n;
}

export interface SkinSource { pos: Float32Array; nrm: Float32Array; uv: Float32Array; joints: Uint8Array; weights: Float32Array }

/**
 * Build a Part from MakeHuman faces: wedge-splits by (vertex, uv), triangulates quads along the
 * shorter diagonal, and carries skinning.  `keep` filters faces; `offset` pushes along the normal.
 */
export function partFromFaces(name: string, material: string, src: SkinSource, faces: MhFace[], opts: { keep?: (f: MhFace) => boolean; offset?: number | ((vi: number) => number); uvMap?: (vi: number, u: number, v: number) => [number, number]; color?: (vi: number) => [number, number, number] } = {}): Part {
  const p = newPart(name, material); if (opts.color) p.col = [];
  const wedge = new Map<string, number>();
  const getW = (vi: number, ti: number): number => {
    const key = vi + '/' + ti; let w = wedge.get(key); if (w !== undefined) return w;
    w = p.pos.length / 3; wedge.set(key, w);
    const off = typeof opts.offset === 'function' ? opts.offset(vi) : (opts.offset ?? 0);
    const nx = src.nrm[vi * 3], ny = src.nrm[vi * 3 + 1], nz = src.nrm[vi * 3 + 2];
    p.pos.push(src.pos[vi * 3] + nx * off, src.pos[vi * 3 + 1] + ny * off, src.pos[vi * 3 + 2] + nz * off);
    p.nrm.push(nx, ny, nz);
    let u = ti >= 0 ? src.uv[ti * 2] : 0, v = ti >= 0 ? src.uv[ti * 2 + 1] : 0;
    if (opts.uvMap) [u, v] = opts.uvMap(vi, u, v);
    p.uv.push(u, v);
    for (let k = 0; k < 4; k++) { p.joints.push(src.joints[vi * 4 + k]); p.weights.push(src.weights[vi * 4 + k]); }
    if (opts.color) p.col!.push(...opts.color(vi));
    p.src!.push(vi);
    return w;
  };
  for (const f of faces) {
    if (opts.keep && !opts.keep(f)) continue;
    const w = f.v.map((vi, k) => getW(vi, f.t[k]));
    if (w.length === 3) p.idx.push(w[0], w[1], w[2]);
    else if (w.length === 4) {
      const d = (a: number, b: number) => { const pa = p.pos, i = w[a] * 3, j = w[b] * 3; return (pa[i] - pa[j]) ** 2 + (pa[i + 1] - pa[j + 1]) ** 2 + (pa[i + 2] - pa[j + 2]) ** 2; };
      if (d(0, 2) <= d(1, 3)) p.idx.push(w[0], w[1], w[2], w[0], w[2], w[3]); else p.idx.push(w[0], w[1], w[3], w[1], w[2], w[3]);
    } else for (let k = 1; k + 1 < w.length; k++) p.idx.push(w[0], w[k], w[k + 1]);
  }
  return p;
}

/** Recompute smooth normals of a Part from its own triangles (seams stay split). */
export function recomputeNormals(p: Part): void {
  const n = p.pos.length / 3; const acc = new Float64Array(n * 3);
  // merge by position so UV seams don't produce normal seams
  const key = new Map<string, number[]>();
  for (let i = 0; i < n; i++) { const k = `${p.pos[i * 3].toFixed(5)},${p.pos[i * 3 + 1].toFixed(5)},${p.pos[i * 3 + 2].toFixed(5)}`; let a = key.get(k); if (!a) key.set(k, a = []); a.push(i); }
  for (let t = 0; t < p.idx.length; t += 3) {
    const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3;
    const ux = p.pos[b] - p.pos[a], uy = p.pos[b + 1] - p.pos[a + 1], uz = p.pos[b + 2] - p.pos[a + 2];
    const vx = p.pos[c] - p.pos[a], vy = p.pos[c + 1] - p.pos[a + 1], vz = p.pos[c + 2] - p.pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [p.idx[t], p.idx[t + 1], p.idx[t + 2]]) { acc[i * 3] += nx; acc[i * 3 + 1] += ny; acc[i * 3 + 2] += nz; }
  }
  for (const group of key.values()) {
    let x = 0, y = 0, z = 0; for (const i of group) { x += acc[i * 3]; y += acc[i * 3 + 1]; z += acc[i * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of group) { p.nrm[i * 3] = x / l; p.nrm[i * 3 + 1] = y / l; p.nrm[i * 3 + 2] = z / l; }
  }
}

/** Append part b into part a (same material assumed). */
export function mergeInto(a: Part, b: Part): void {
  const base = a.pos.length / 3;
  a.pos.push(...b.pos); a.nrm.push(...b.nrm); a.uv.push(...b.uv); a.joints.push(...b.joints); a.weights.push(...b.weights);
  if (a.col || b.col) { if (!a.col) a.col = new Array(base * 3).fill(1); a.col.push(...(b.col ?? new Array(b.pos.length).fill(1))); }
  for (const i of b.idx) a.idx.push(i + base);
  if (a.src) a.src.push(...(b.src ?? new Array(b.pos.length / 3).fill(-1)));
}

/** Flip triangle winding. */
export function flip(p: Part): void { for (let t = 0; t < p.idx.length; t += 3) { const tmp = p.idx[t + 1]; p.idx[t + 1] = p.idx[t + 2]; p.idx[t + 2] = tmp; } }

/** Boundary edges (edges used by exactly one triangle), as pairs of vertex indices. */
export function boundaryEdges(p: Part): [number, number][] {
  const count = new Map<string, [number, number, number]>();
  for (let t = 0; t < p.idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = p.idx[t + e], b = p.idx[t + (e + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const c = count.get(k); if (c) c[2]++; else count.set(k, [a, b, 1]);
    }
  }
  const out: [number, number][] = [];
  for (const [a, b, c] of count.values()) if (c === 1) out.push([a, b]);
  return out;
}

/** Translate/scale helpers for synthetic geometry */
export function transformPart(p: Part, fn: (x: number, y: number, z: number) => [number, number, number], nfn?: (x: number, y: number, z: number) => [number, number, number]): void {
  for (let i = 0; i < p.pos.length; i += 3) { const r = fn(p.pos[i], p.pos[i + 1], p.pos[i + 2]); p.pos[i] = r[0]; p.pos[i + 1] = r[1]; p.pos[i + 2] = r[2]; }
  if (nfn) for (let i = 0; i < p.nrm.length; i += 3) { const r = nfn(p.nrm[i], p.nrm[i + 1], p.nrm[i + 2]); const l = Math.hypot(...r) || 1; p.nrm[i] = r[0] / l; p.nrm[i + 1] = r[1] / l; p.nrm[i + 2] = r[2] / l; }
}

export function bounds(p: Part): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]); }
  return { min, max };
}
