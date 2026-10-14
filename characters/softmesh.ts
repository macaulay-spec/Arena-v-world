/**
 * SoftMesh: polygon mesh with skinning used while cutting garments out of MakeHuman's helper
 * shells.  Supports iso-value clipping (clean hems), normal offsets, radial loosening, rims
 * (fabric thickness at hems / collars) and conversion to an exportable Part.
 */
import { base } from './body';
import { BONES, BONE_INDEX, BONE_PARENT, type Rig } from './rig';
import { newPart, type Part } from './mesh';

export interface SoftVert { p: number[]; n: number[]; j: number[]; w: number[]; src: number; uv?: [number, number] }
export interface SoftMesh { v: SoftVert[]; f: number[][] }

export function fromGroup(rig: Rig, group: string, faceFilter?: (vs: number[]) => boolean): SoftMesh {
  const b = base(); const faces = b.byGroup.get(group)!;
  const map = new Map<number, number>(); const v: SoftVert[] = []; const f: number[][] = [];
  const acc = new Map<number, number[]>();
  for (const fc of faces) {
    if (faceFilter && !faceFilter(fc.v)) continue;
    const poly: number[] = [];
    for (const vi of fc.v) {
      let k = map.get(vi);
      if (k === undefined) { k = v.length; map.set(vi, k); v.push({ p: [rig.pos[vi * 3], rig.pos[vi * 3 + 1], rig.pos[vi * 3 + 2]], n: [0, 0, 0], j: [...rig.joints.subarray(vi * 4, vi * 4 + 4)], w: [...rig.weights.subarray(vi * 4, vi * 4 + 4)], src: vi }); }
      poly.push(k);
    }
    f.push(poly);
  }
  recomputeNormals({ v, f });
  return { v, f };
}

export function recomputeNormals(m: SoftMesh): void {
  for (const vv of m.v) vv.n = [0, 0, 0];
  for (const poly of m.f) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < poly.length; i++) { const a = m.v[poly[i]].p, b = m.v[poly[(i + 1) % poly.length]].p; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    for (const i of poly) { const n = m.v[i].n; n[0] += nx; n[1] += ny; n[2] += nz; }
  }
  for (const vv of m.v) { const l = Math.hypot(vv.n[0], vv.n[1], vv.n[2]) || 1; vv.n = [vv.n[0] / l, vv.n[1] / l, vv.n[2] / l]; }
}

function lerpVert(a: SoftVert, b: SoftVert, t: number): SoftVert {
  const p = [0, 1, 2].map(k => a.p[k] + (b.p[k] - a.p[k]) * t);
  const n = [0, 1, 2].map(k => a.n[k] + (b.n[k] - a.n[k]) * t); const l = Math.hypot(n[0], n[1], n[2]) || 1;
  // merge weights
  const wm = new Map<number, number>();
  for (let k = 0; k < 4; k++) { if (a.w[k] > 0) wm.set(a.j[k], (wm.get(a.j[k]) ?? 0) + a.w[k] * (1 - t)); if (b.w[k] > 0) wm.set(b.j[k], (wm.get(b.j[k]) ?? 0) + b.w[k] * t); }
  const arr = [...wm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4); const s = arr.reduce((q, e) => q + e[1], 0) || 1;
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0]; arr.forEach((e, k) => { j[k] = e[0]; w[k] = e[1] / s; });
  const out: SoftVert = { p, n: [n[0] / l, n[1] / l, n[2] / l], j, w, src: -1 };
  if (a.uv && b.uv) out.uv = [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t];
  return out;
}

/** Keep the region where field ≤ 0; polygons are clipped along the iso-line (shared edge vertices). */
export function clip(m: SoftMesh, field: (v: SoftVert) => number): SoftMesh {
  const val = m.v.map(field);
  const v: SoftVert[] = []; const f: number[][] = [];
  const keepMap = new Map<number, number>(); const edgeMap = new Map<string, number>();
  const keep = (i: number) => { let k = keepMap.get(i); if (k === undefined) { k = v.length; keepMap.set(i, k); v.push(m.v[i]); } return k; };
  const cut = (i: number, j: number) => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`; let k = edgeMap.get(key); if (k !== undefined) return k;
    const t = val[i] / (val[i] - val[j]); k = v.length; edgeMap.set(key, k); v.push(lerpVert(m.v[i], m.v[j], t)); return k;
  };
  for (const poly of m.f) {
    const out: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]; const ia = val[a] <= 0, ib = val[b] <= 0;
      if (ia) out.push(keep(a));
      if (ia !== ib) out.push(cut(a, b));
    }
    if (out.length >= 3) f.push(out);
  }
  return { v, f };
}

export function offset(m: SoftMesh, amount: number | ((v: SoftVert) => number)): void {
  for (const vv of m.v) { const a = typeof amount === 'function' ? amount(vv) : amount; vv.p = [vv.p[0] + vv.n[0] * a, vv.p[1] + vv.n[1] * a, vv.p[2] + vv.n[2] * a]; }
}

/** Move vertices by an arbitrary displacement (e.g. radial loosening around a limb axis). */
export function displace(m: SoftMesh, fn: (v: SoftVert) => number[] | null): void {
  for (const vv of m.v) { const d = fn(vv); if (d) vv.p = [vv.p[0] + d[0], vv.p[1] + d[1], vv.p[2] + d[2]]; }
  recomputeNormals(m);
}

export function boundaryLoops(m: SoftMesh): [number, number][] {
  const count = new Map<string, [number, number, number]>();
  for (const poly of m.f) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const e = count.get(key); if (e) e[2]++; else count.set(key, [a, b, 1]);
  }
  const out: [number, number][] = []; for (const [a, b, c] of count.values()) if (c === 1) out.push([a, b]);
  return out;
}

/**
 * Add a rim strip along boundary loops: each boundary vertex gets a twin displaced by `disp(v)`
 * (default: inward along −normal for fabric thickness); `select` limits which loops get a rim.
 */
export function rims(m: SoftMesh, disp: (v: SoftVert) => number[], select?: (v: SoftVert) => boolean, twoSided = false): void {
  const twins = new Map<number, number>();
  const twin = (i: number) => { let k = twins.get(i); if (k === undefined) { const o = m.v[i]; const d = disp(o); k = m.v.length; twins.set(i, k); m.v.push({ p: [o.p[0] + d[0], o.p[1] + d[1], o.p[2] + d[2]], n: [...o.n], j: [...o.j], w: [...o.w], src: -1, uv: o.uv ? [...o.uv] : undefined }); } return k; };
  for (const [a, b] of boundaryLoops(m)) {
    if (select && !(select(m.v[a]) && select(m.v[b]))) continue;
    const a2 = twin(a), b2 = twin(b);
    m.f.push([b, a, a2, b2]);
    if (twoSided) m.f.push([a, b, b2, a2]);
  }
}

/** Reverse winding (and normals). */
export function flipMesh(m: SoftMesh): void { for (const poly of m.f) poly.reverse(); for (const v of m.v) v.n = [-v.n[0], -v.n[1], -v.n[2]]; }

/** Concavity 0…1 per vertex (used for baked cloth shading). */
export function concavity(m: SoftMesh): Float32Array {
  const nb: Set<number>[] = m.v.map(() => new Set<number>());
  for (const poly of m.f) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; nb[a].add(b); nb[b].add(a); }
  const out = new Float32Array(m.v.length);
  m.v.forEach((v, i) => {
    const set = nb[i]; if (!set.size) return; let mx = 0, my = 0, mz = 0, len = 0;
    for (const u of set) { const q = m.v[u].p; mx += q[0]; my += q[1]; mz += q[2]; len += Math.hypot(q[0] - v.p[0], q[1] - v.p[1], q[2] - v.p[2]); }
    const k = set.size; mx = mx / k - v.p[0]; my = my / k - v.p[1]; mz = mz / k - v.p[2]; len /= k;
    out[i] = Math.max(0, Math.min(1, ((mx * v.n[0] + my * v.n[1] + mz * v.n[2]) / (len || 1)) * 5));
  });
  return out;
}

/** Export to a Part; `uv(v)` supplies texture coordinates, `color(v, i)` an optional multiplier. */
export function toPart(m: SoftMesh, name: string, material: string, uv: (v: SoftVert) => [number, number], color?: (v: SoftVert, i: number) => [number, number, number]): Part {
  const p = newPart(name, material); if (color) p.col = [];
  m.v.forEach((v, i) => {
    const t = v.uv ?? uv(v);
    p.pos.push(v.p[0], v.p[1], v.p[2]); p.nrm.push(v.n[0], v.n[1], v.n[2]); p.uv.push(t[0], t[1]);
    for (let k = 0; k < 4; k++) { p.joints.push(v.j[k]); p.weights.push(v.w[k]); }
    if (color) p.col!.push(...color(v, i)); p.src!.push(v.src);
  });
  for (const poly of m.f) {
    if (poly.length === 3) p.idx.push(poly[0], poly[1], poly[2]);
    else if (poly.length === 4) {
      const d = (a: number, b: number) => { const A = m.v[poly[a]].p, B = m.v[poly[b]].p; return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
      if (d(0, 2) <= d(1, 3)) p.idx.push(poly[0], poly[1], poly[2], poly[0], poly[2], poly[3]); else p.idx.push(poly[0], poly[1], poly[3], poly[1], poly[2], poly[3]);
    } else for (let k = 1; k + 1 < poly.length; k++) p.idx.push(poly[0], poly[k], poly[k + 1]);
  }
  return p;
}

// ---- limb coordinates -------------------------------------------------------------------------
export interface LimbFrame { rig: Rig; heads: (b: string) => number[]; dominant: (v: SoftVert) => string; along: (v: SoftVert, chain: string[]) => number; radial: (v: SoftVert, chain: string[]) => { r: number; dir: number[] } }

/** Chain-length coordinate helpers for cutting sleeves / legs at a metric distance from the root joint. */
export function limbFrame(rig: Rig): LimbFrame {
  const heads = (b: string) => { const i = BONE_INDEX.get(b)!; return [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]]; };
  const dominant = (v: SoftVert) => BONES[v.j[0]].name;
  const childOf = (b: string): string | null => { const bi = BONE_INDEX.get(b)!; const kids = BONES.map((x, i) => i).filter(i => BONE_PARENT[i] === bi && !/End|Eye|Jaw|Thumb|Pinky|Ring|Index/.test(BONES[i].name)); return kids.length ? BONES[kids[0]].name : null; };
  const segLen = new Map<string, number>(); const axis = new Map<string, number[]>();
  const seg = (b: string) => {
    if (!segLen.has(b)) { const c = childOf(b); const h = heads(b); const t = c ? heads(c) : h; const d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]]; const l = Math.hypot(d[0], d[1], d[2]) || 1e-6; segLen.set(b, l); axis.set(b, [d[0] / l, d[1] / l, d[2] / l]); }
    return { len: segLen.get(b)!, axis: axis.get(b)! };
  };
  /** metres along the chain from chain[0]'s head, projected on the nearest chain segment */
  const along = (v: SoftVert, chain: string[]) => {
    let best = Infinity, result = 0, acc = 0;
    for (const b of chain) {
      const { len, axis: ax } = seg(b); const h = heads(b);
      const d = [v.p[0] - h[0], v.p[1] - h[1], v.p[2] - h[2]]; const t = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
      const tc = Math.max(0, Math.min(len, t)); const px = h[0] + ax[0] * tc - v.p[0], py = h[1] + ax[1] * tc - v.p[1], pz = h[2] + ax[2] * tc - v.p[2];
      const dist = px * px + py * py + pz * pz;
      if (dist < best) { best = dist; result = acc + t; }
      acc += len;
    }
    return result;
  };
  const radial = (v: SoftVert, chain: string[]) => {
    let best = Infinity, dir = [0, 0, 1], r = 0;
    for (const b of chain) {
      const { len, axis: ax } = seg(b); const h = heads(b);
      const d = [v.p[0] - h[0], v.p[1] - h[1], v.p[2] - h[2]]; const t = Math.max(0, Math.min(len, d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]));
      const rx = v.p[0] - (h[0] + ax[0] * t), ry = v.p[1] - (h[1] + ax[1] * t), rz = v.p[2] - (h[2] + ax[2] * t); const dist = Math.hypot(rx, ry, rz);
      if (dist < best) { best = dist; r = dist; dir = dist > 1e-6 ? [rx / dist, ry / dist, rz / dist] : [0, 0, 1]; }
    }
    return { r, dir };
  };
  return { rig, heads, dominant, along, radial };
}
