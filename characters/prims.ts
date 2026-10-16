/** Primitive meshes (skinned 100 % to one bone) used for props, buns, beads … */
import type { Part } from './mesh';

export function emptyPart(name: string, material: string, colour = true): Part { return { name, material, pos: [], nrm: [], uv: [], joints: [], weights: [], idx: [], src: [], col: colour ? [] : undefined }; }

function push(p: Part, pos: number[], nrm: number[], uv: number[], bone: number, col?: number[]): number {
  const i = p.pos.length / 3; p.pos.push(...pos); p.nrm.push(...nrm); p.uv.push(...uv); p.joints.push(bone, 0, 0, 0); p.weights.push(1, 0, 0, 0); p.src!.push(-1); if (p.col) p.col.push(...(col ?? [1, 1, 1])); return i;
}

export function sphere(p: Part, c: number[], rad: number, bone: number, col?: number[], seg = 12, ring = 8, scale: number[] = [1, 1, 1]): void {
  const base = p.pos.length / 3;
  for (let j = 0; j <= ring; j++) { const ph = (j / ring) * Math.PI; for (let i = 0; i <= seg; i++) { const th = (i / seg) * Math.PI * 2; const n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    const nn = [n[0] / scale[0], n[1] / scale[1], n[2] / scale[2]]; const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    push(p, [c[0] + n[0] * rad * scale[0], c[1] + n[1] * rad * scale[1], c[2] + n[2] * rad * scale[2]], [nn[0] / l, nn[1] / l, nn[2] / l], [i / seg, j / ring], bone, col); } }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + seg + 1; p.idx.push(a, a + 1, b, a + 1, b + 1, b); }
}

/** axis-aligned box centred at c with size s (full extents) */
export function box(p: Part, c: number[], s: number[], bone: number, col?: number[], uvScale = 4): void {
  const h = [s[0] / 2, s[1] / 2, s[2] / 2];
  const faces: [number[], number[], number[]][] = [ // normal, u axis, v axis
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of faces) {
    const base = p.pos.length / 3; const hn = Math.abs(n[0]) * h[0] + Math.abs(n[1]) * h[1] + Math.abs(n[2]) * h[2];
    const hu = Math.abs(u[0]) * h[0] + Math.abs(u[1]) * h[1] + Math.abs(u[2]) * h[2], hv = Math.abs(v[0]) * h[0] + Math.abs(v[1]) * h[1] + Math.abs(v[2]) * h[2];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) push(p, [c[0] + n[0] * hn + u[0] * hu * su + v[0] * hv * sv, c[1] + n[1] * hn + u[1] * hu * su + v[1] * hv * sv, c[2] + n[2] * hn + u[2] * hu * su + v[2] * hv * sv], n, [(su + 1) / 2 * hu * uvScale, (sv + 1) / 2 * hv * uvScale], bone, col);
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** cylinder along `axis` (unit vector) from a to b; rTop lets it taper (bowls, buckets) */
export function cylinder(p: Part, a: number[], b: number[], r: number, bone: number, col?: number[], o: { rTop?: number; seg?: number; capA?: boolean; capB?: boolean } = {}): void {
  const seg = o.seg ?? 16, rTop = o.rTop ?? r; const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(ax[0], ax[1], ax[2]) || 1; const d = ax.map(v => v / L);
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const t = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]; const tl = Math.hypot(t[0], t[1], t[2]) || 1; const e1 = t.map(v => v / tl); const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
  const base = p.pos.length / 3; const slope = (r - rTop) / L;
  for (let i = 0; i <= seg; i++) { const th = (i / seg) * Math.PI * 2; const n = [e1[0] * Math.cos(th) + e2[0] * Math.sin(th), e1[1] * Math.cos(th) + e2[1] * Math.sin(th), e1[2] * Math.cos(th) + e2[2] * Math.sin(th)];
    const nn = [n[0] + d[0] * slope, n[1] + d[1] * slope, n[2] + d[2] * slope]; const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    push(p, [a[0] + n[0] * r, a[1] + n[1] * r, a[2] + n[2] * r], nn.map(v => v / nl), [i / seg * 3, 0], bone, col);
    push(p, [b[0] + n[0] * rTop, b[1] + n[1] * rTop, b[2] + n[2] * rTop], nn.map(v => v / nl), [i / seg * 3, L * 4], bone, col); }
  for (let i = 0; i < seg; i++) { const k = base + i * 2; p.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const cap = (centre: number[], rad: number, normal: number[], flip: boolean) => { const cb = p.pos.length / 3; push(p, centre, normal, [0.5, 0.5], bone, col); for (let i = 0; i <= seg; i++) { const th = (i / seg) * Math.PI * 2; const n = [e1[0] * Math.cos(th) + e2[0] * Math.sin(th), e1[1] * Math.cos(th) + e2[1] * Math.sin(th), e1[2] * Math.cos(th) + e2[2] * Math.sin(th)]; push(p, [centre[0] + n[0] * rad, centre[1] + n[1] * rad, centre[2] + n[2] * rad], normal, [0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5], bone, col); } for (let i = 0; i < seg; i++) { if (flip) p.idx.push(cb, cb + 1 + i, cb + 2 + i); else p.idx.push(cb, cb + 2 + i, cb + 1 + i); } };
  if (o.capA !== false) cap(a, r, d.map(v => -v), true); if (o.capB !== false) cap(b, rTop, d, false);
}

/** thin strip (handle / strap) through a polyline, width w in the given side direction */
export function strip(p: Part, pts: number[][], w: number, side: number[], bone: number, col?: number[]): void {
  const base = p.pos.length / 3;
  for (let i = 0; i < pts.length; i++) { const q = pts[i]; const nx = i < pts.length - 1 ? pts[i + 1] : pts[i - 1]; const d = [nx[0] - q[0], nx[1] - q[1], nx[2] - q[2]]; const n = [d[1] * side[2] - d[2] * side[1], d[2] * side[0] - d[0] * side[2], d[0] * side[1] - d[1] * side[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1;
    push(p, [q[0] - side[0] * w / 2, q[1] - side[1] * w / 2, q[2] - side[2] * w / 2], n.map(v => v / l), [0, i / (pts.length - 1) * 4], bone, col); push(p, [q[0] + side[0] * w / 2, q[1] + side[1] * w / 2, q[2] + side[2] * w / 2], n.map(v => v / l), [1, i / (pts.length - 1) * 4], bone, col); }
  for (let i = 0; i < pts.length - 1; i++) { const k = base + i * 2; p.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k, k + 2, k + 1, k + 1, k + 2, k + 3); }
}
