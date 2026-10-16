/**
 * Mesh decimation for LODs: quadric-error half-edge collapses on indexed triangle Parts.  A
 * collapse removes one vertex into a neighbour, so the survivor's attributes (uv, skinning,
 * colour) stay valid; boundary / seam vertices are protected unless the edge itself is boundary.
 */
import type { Part } from './mesh';

type Q = Float64Array; // 10 unique coefficients of a symmetric 4x4 quadric

function qAdd(a: Q, b: Q): void { for (let i = 0; i < 10; i++) a[i] += b[i]; }
function qPlane(q: Q, a: number, b: number, c: number, d: number, w = 1): void {
  q[0] += a * a * w; q[1] += a * b * w; q[2] += a * c * w; q[3] += a * d * w; q[4] += b * b * w; q[5] += b * c * w; q[6] += b * d * w; q[7] += c * c * w; q[8] += c * d * w; q[9] += d * d * w;
}
function qEval(q: Q, x: number, y: number, z: number): number {
  return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
}

class Heap { // min-heap of [cost, edgeKey, version]
  a: { c: number; u: number; v: number; ver: number }[] = [];
  push(e: { c: number; u: number; v: number; ver: number }) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].c <= a[i].c) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l].c < a[m].c) m = l; if (r < a.length && a[r].c < a[m].c) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** Decimate `p` to roughly `ratio` of its triangles (never below `minTris`). Returns a new Part. */
export function simplify(p: Part, ratio: number, minTris = 60): Part {
  const nv = p.pos.length / 3; const tris: number[][] = []; for (let t = 0; t < p.idx.length; t += 3) tris.push([p.idx[t], p.idx[t + 1], p.idx[t + 2]]);
  const target = Math.max(minTris, Math.floor(tris.length * ratio)); if (tris.length <= target) return clonePart(p);
  const pos = Float64Array.from(p.pos);
  const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  // quadrics + adjacency
  const quad: Q[] = Array.from({ length: nv }, () => new Float64Array(10));
  const vtris: Set<number>[] = Array.from({ length: nv }, () => new Set());
  const triAlive = new Uint8Array(tris.length).fill(1);
  const edgeCount = new Map<number, number>(); const ek = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  tris.forEach((t, ti) => {
    const [a, b, c] = t.map(P); const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const area = Math.hypot(n[0], n[1], n[2]); if (area < 1e-14) { triAlive[ti] = 0; return; }
    const nn = n.map(x => x / area); const d = -(nn[0] * a[0] + nn[1] * a[1] + nn[2] * a[2]);
    for (const i of t) { qPlane(quad[i], nn[0], nn[1], nn[2], d, area); vtris[i].add(ti); }
    for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1); }
  });
  // boundary vertices get a strong constraint plane along each boundary edge (preserves silhouettes / seams)
  const boundaryV = new Uint8Array(nv);
  tris.forEach((t, ti) => { if (!triAlive[ti]) return; for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; if (edgeCount.get(ek(a, b)) !== 1) continue; boundaryV[a] = 1; boundaryV[b] = 1;
    const pa = P(a), pb = P(b), pc = P(t[(k + 2) % 3]); const e = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]; const u = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const fn = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]]; const n = [e[1] * fn[2] - e[2] * fn[1], e[2] * fn[0] - e[0] * fn[2], e[0] * fn[1] - e[1] * fn[0]]; const l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-14) continue;
    const nn = n.map(x => x / l); const d = -(nn[0] * pa[0] + nn[1] * pa[1] + nn[2] * pa[2]); const w = Math.hypot(e[0], e[1], e[2]) * 50; qPlane(quad[a], nn[0], nn[1], nn[2], d, w); qPlane(quad[b], nn[0], nn[1], nn[2], d, w); } });
  const alive = new Uint8Array(nv).fill(1); const version = new Uint32Array(nv);
  const heap = new Heap();
  const cost = (u: number, v: number) => { // collapse u into v (v survives at its own position)
    if (boundaryV[u] && !boundaryV[v]) return Infinity; if (boundaryV[u] && boundaryV[v] && edgeCount.get(ek(u, v)) !== 1) return Infinity;
    const q = new Float64Array(10); qAdd(q, quad[u]); qAdd(q, quad[v]); const pv = P(v); return qEval(q, pv[0], pv[1], pv[2]);
  };
  const pushEdge = (u: number, v: number) => { const c = cost(u, v); if (c < Infinity) heap.push({ c, u, v, ver: version[u] + version[v] }); };
  for (const key of edgeCount.keys()) { const a = Math.floor(key / nv), b = key % nv; pushEdge(a, b); pushEdge(b, a); }
  let triCount = triAlive.reduce((s, x) => s + x, 0);
  const wouldFlip = (u: number, v: number) => {
    const pv = P(v);
    for (const ti of vtris[u]) { if (!triAlive[ti]) continue; const t = tris[ti]; if (t.includes(v)) continue;
      const [a, b, c] = t.map(P); const i = t.indexOf(u); const a2 = [...a], b2 = [...b], c2 = [...c]; ([a2, b2, c2][i]).splice(0, 3, pv[0], pv[1], pv[2]);
      const n1 = cross(sub(b, a), sub(c, a)), n2 = cross(sub(b2, a2), sub(c2, a2)); if (dot(n1, n2) <= 0) return true; }
    return false;
  };
  while (heap.size && triCount > target) {
    const e = heap.pop(); const { u, v } = e; if (!alive[u] || !alive[v] || e.ver !== version[u] + version[v]) continue;
    if (!edgeCount.get(ek(u, v))) continue; if (wouldFlip(u, v)) continue;
    // collapse u → v
    for (const ti of vtris[u]) { if (!triAlive[ti]) continue; const t = tris[ti];
      if (t.includes(v)) { triAlive[ti] = 0; triCount--; for (const w of t) if (w !== u) vtris[w].delete(ti); for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); edgeCount.set(key, (edgeCount.get(key) ?? 1) - 1); } }
      else { const i = t.indexOf(u); for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); edgeCount.set(key, (edgeCount.get(key) ?? 1) - 1); } t[i] = v; vtris[v].add(ti); for (let k = 0; k < 3; k++) { const key = ek(t[k], t[(k + 1) % 3]); edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1); } }
    }
    vtris[u].clear(); alive[u] = 0; qAdd(quad[v], quad[u]); version[v]++;
    if (boundaryV[u]) boundaryV[v] = 1;
    const nbrs = new Set<number>(); for (const ti of vtris[v]) if (triAlive[ti]) for (const w of tris[ti]) if (w !== v) nbrs.add(w);
    for (const w of nbrs) { pushEdge(w, v); pushEdge(v, w); }
  }
  // compact
  const remap = new Int32Array(nv).fill(-1); const out: Part = { name: p.name, material: p.material, pos: [], nrm: [], uv: [], joints: [], weights: [], idx: [], src: p.src ? [] : undefined, col: p.col ? [] : undefined };
  const used = new Uint8Array(nv); tris.forEach((t, ti) => { if (triAlive[ti]) for (const i of t) used[i] = 1; });
  for (let i = 0; i < nv; i++) { if (!used[i]) continue; remap[i] = out.pos.length / 3; out.pos.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]); out.nrm.push(p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]); out.uv.push(p.uv[i * 2], p.uv[i * 2 + 1]); for (let k = 0; k < 4; k++) { out.joints.push(p.joints[i * 4 + k]); out.weights.push(p.weights[i * 4 + k]); } if (out.col) out.col.push(p.col![i * 3], p.col![i * 3 + 1], p.col![i * 3 + 2]); if (out.src) out.src.push(p.src![i]); }
  tris.forEach((t, ti) => { if (triAlive[ti]) out.idx.push(remap[t[0]], remap[t[1]], remap[t[2]]); });
  return out;
}
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function clonePart(p: Part): Part { return { ...p, pos: [...p.pos], nrm: [...p.nrm], uv: [...p.uv], joints: [...p.joints], weights: [...p.weights], idx: [...p.idx], src: p.src ? [...p.src] : undefined, col: p.col ? [...p.col] : undefined }; }

/** Standard LOD chain for a character: LOD1 ≈ 40 %, LOD2 ≈ 15 % (mouth interior dropped at LOD2). */
export function lodChain(parts: Part[]): { level: number; parts: Part[] }[] {
  const isBody = (p: Part) => p.name === 'skin' || p.name === 'eyes' || p.name === 'mouth';
  const lod1 = parts.map(p => simplify(p, p.name === 'skin' ? 0.42 : 0.4, p.name === 'eyes' ? 200 : 40));
  // far LOD: garments are inflated a little so the coarser skin cannot poke through them
  const lod2 = parts.filter(p => p.name !== 'mouth').map(p => { const s = simplify(p, p.name === 'skin' ? 0.16 : 0.15, p.name === 'eyes' ? 100 : 24); if (!isBody(p)) inflate(s, 0.004); return s; });
  return [{ level: 1, parts: lod1 }, { level: 2, parts: lod2 }];
}
function inflate(p: Part, d: number): void { for (let i = 0; i < p.pos.length; i += 3) { p.pos[i] += p.nrm[i] * d; p.pos[i + 1] += p.nrm[i + 1] * d; p.pos[i + 2] += p.nrm[i + 2] * d; } }
