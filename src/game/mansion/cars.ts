/**
 * Procedural vehicles (static in APK 1, reused by traffic later): body = two extruded side profiles
 * (lower shell + cabin) with glazing, wheels, lights and trim. Local frame: +z = front, x = width.
 */
import { MeshKit, rgb, type RGB } from './kit';
import type { Place } from './furniture';

export type CarKind = 'gclass' | 'range' | 'saloon' | 'coupe' | 'pickup' | 'danfo' | 'okada';
interface CarSpec {
  width: number;
  lower: [number, number][];   // (z, y) counter-clockwise
  upper: [number, number][];   // cabin (z, y) counter-clockwise, starts at rear-bottom
  wheelZ: [number, number]; wheelR: number; wheelW: number;
  sideWindows: [number, number, number, number][]; // z0, z1, y0, y1 (per side)
  front?: [number, number, number, number]; // windshield: z0,y0 → z1,y1 along the slanted plane
  rear?: [number, number, number, number];
  roofBox?: [number, number, number]; // z0, z1, height extra (roof rails)
  bed?: [number, number]; spare?: boolean; stripe?: boolean; rack?: boolean;
}
const SPECS: Record<Exclude<CarKind, 'okada'>, CarSpec> = {
  gclass: { width: 1.92, lower: [[-2.4, 0.42], [2.4, 0.42], [2.45, 0.75], [2.4, 1.08], [-2.4, 1.1]], upper: [[-2.35, 1.1], [1.05, 1.08], [0.85, 1.98], [-2.3, 1.98]], wheelZ: [-1.55, 1.5], wheelR: 0.42, wheelW: 0.3, sideWindows: [[-2.2, -1.1, 1.22, 1.85], [-1.0, 0.0, 1.22, 1.85], [0.1, 0.8, 1.22, 1.82]], front: [1.05, 1.08, 0.85, 1.98], rear: [-2.35, 1.1, -2.3, 1.98], roofBox: [-2.0, 0.6, 0.08], spare: true },
  range: { width: 1.98, lower: [[-2.5, 0.42], [2.5, 0.42], [2.55, 0.8], [2.3, 1.0], [1.9, 1.12], [-2.5, 1.18]], upper: [[-2.4, 1.18], [1.7, 1.1], [1.0, 1.78], [-2.1, 1.84]], wheelZ: [-1.6, 1.6], wheelR: 0.4, wheelW: 0.3, sideWindows: [[-2.25, -1.15, 1.28, 1.72], [-1.05, -0.05, 1.28, 1.7], [0.05, 0.9, 1.26, 1.66]], front: [1.7, 1.1, 1.0, 1.78], rear: [-2.4, 1.18, -2.1, 1.84], roofBox: [-1.9, 0.7, 0.06] },
  saloon: { width: 1.88, lower: [[-2.55, 0.36], [2.55, 0.36], [2.6, 0.62], [2.4, 0.78], [1.3, 0.88], [-2.5, 0.92]], upper: [[-2.0, 0.92], [1.5, 0.88], [0.7, 1.42], [-1.1, 1.44]], wheelZ: [-1.65, 1.6], wheelR: 0.36, wheelW: 0.26, sideWindows: [[-1.8, -0.85, 1.0, 1.36], [-0.75, 0.3, 1.0, 1.36]], front: [1.5, 0.88, 0.7, 1.42], rear: [-2.0, 0.92, -1.1, 1.44] },
  coupe: { width: 1.92, lower: [[-2.35, 0.3], [2.35, 0.3], [2.4, 0.55], [2.1, 0.66], [1.1, 0.74], [-2.3, 0.86]], upper: [[-1.9, 0.86], [1.3, 0.74], [0.35, 1.22], [-0.9, 1.24]], wheelZ: [-1.5, 1.5], wheelR: 0.36, wheelW: 0.3, sideWindows: [[-1.6, 0.0, 0.92, 1.16]], front: [1.3, 0.74, 0.35, 1.22], rear: [-1.9, 0.86, -0.9, 1.24] },
  pickup: { width: 1.95, lower: [[-2.75, 0.45], [2.75, 0.45], [2.8, 0.82], [2.6, 1.0], [0.95, 1.06], [-2.75, 1.08]], upper: [[-0.25, 1.08], [1.05, 1.06], [0.75, 1.92], [-0.25, 1.92]], wheelZ: [-1.7, 1.75], wheelR: 0.42, wheelW: 0.32, sideWindows: [[-0.15, 0.6, 1.2, 1.8]], front: [1.05, 1.06, 0.75, 1.92], rear: [-0.25, 1.08, -0.25, 1.92], bed: [-2.7, -0.35], rack: true },
  danfo: { width: 1.9, lower: [[-2.6, 0.4], [2.6, 0.4], [2.65, 0.8], [2.6, 1.1], [-2.6, 1.1]], upper: [[-2.6, 1.1], [2.55, 1.1], [2.35, 2.25], [-2.6, 2.25]], wheelZ: [-1.6, 1.7], wheelR: 0.38, wheelW: 0.28, sideWindows: [[-2.45, -1.6, 1.3, 2.0], [-1.5, -0.6, 1.3, 2.0], [-0.5, 0.4, 1.3, 2.0], [0.6, 1.5, 1.3, 2.0]], front: [2.55, 1.1, 2.35, 2.25], rear: [-2.6, 1.1, -2.6, 2.25], stripe: true },
};
export const CAR_COLORS: Record<CarKind, string> = { gclass: '#101214', range: '#e8e6e1', saloon: '#141618', coupe: '#b3121a', pickup: '#2d3a4a', danfo: '#f2c230', okada: '#1b3a8a' };
export const CAR_LENGTH: Record<CarKind, number> = { gclass: 4.9, range: 5.1, saloon: 5.2, coupe: 4.8, pickup: 5.6, danfo: 5.3, okada: 2.0 };

const circle = (r: number, n = 14): [number, number][] => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]; });
const GLASS: RGB = [0.08, 0.1, 0.12], RUB = rgb('#15161a'), RIM = rgb('#c9cdd2'), CHROME = rgb('#dfe3e6');

export function car(k: MeshKit, p: Place, kind: CarKind, colorHex = CAR_COLORS[kind]): void {
  if (kind === 'okada') return okada(k, p, colorHex);
  const s = SPECS[kind]; const col = rgb(colorHex); const r = p.rot ?? 0; const o: [number, number, number] = [p.x, p.y, p.z];
  const hw = s.width / 2;
  k.prism('carPaint', s.lower, -hw, hw, col, o, r);
  k.prism('carPaint', s.upper, -hw + 0.06, hw - 0.06, kind === 'danfo' ? col : col.map(c => c * 0.95) as RGB, o, r);
  // bottom shadow plate & sills
  k.prism('rubber', [[s.lower[0][0] + 0.2, s.lower[0][1] - 0.02], [s.lower[1][0] - 0.2, s.lower[0][1] - 0.02], [s.lower[1][0] - 0.2, s.lower[0][1] + 0.06], [s.lower[0][0] + 0.2, s.lower[0][1] + 0.06]], -hw + 0.02, hw - 0.02, RUB, o, r);
  const c = Math.cos(r), sn = Math.sin(r);
  const W = (x: number, y: number, z: number): [number, number, number] => [p.x + x * c + z * sn, p.y + y, p.z - x * sn + z * c];
  // side windows
  for (const [z0, z1, y0, y1] of s.sideWindows) {
    const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2; const w = hw - 0.06 + 0.012;
    const a = W(0, yc, zc); k.box('glassDark', a[0], a[1], a[2], w * 2, y1 - y0, z1 - z0, GLASS, r);
  }
  // front / rear glass as quads on the slanted planes, slightly proud
  const pane = (q: [number, number, number, number] | undefined, dir: 1 | -1) => {
    if (!q) return; const [za, ya, zb, yb] = q; const dz = zb - za, dy = yb - ya; const len = Math.hypot(dz, dy) || 1; const nz = dy / len * dir, ny = -dz / len * dir; const off = 0.015;
    const iw = hw - 0.06 - 0.08; const ins = 0.07; const t = ins / len;
    const za2 = za + dz * t, ya2 = ya + dy * t, zb2 = zb - dz * t, yb2 = yb - dy * t;
    const p0 = W(-iw, ya2 + ny * off, za2 + nz * off), p1 = W(iw, ya2 + ny * off, za2 + nz * off), p2 = W(iw, yb2 + ny * off, zb2 + nz * off), p3 = W(-iw, yb2 + ny * off, zb2 + nz * off);
    if (dir > 0) k.quad('glassDark', p0, p1, p2, p3, GLASS); else k.quad('glassDark', p1, p0, p3, p2, GLASS);
  };
  pane(s.front, 1); pane(s.rear, -1);
  carWheels(k, p, kind);
  // front/rear lights, grille, plates, mirrors
  const zf = s.lower[1][0], zr = s.lower[0][0]; const yl = (s.lower[2][1] + s.lower[1][1]) / 2;
  for (const side of [-1, 1]) {
    const hl = W(side * (hw - 0.3), yl + 0.12, zf + 0.01); k.box('white', hl[0], hl[1], hl[2], 0.34, 0.14, 0.04, [1, 1, 0.9], r);
    const tl = W(side * (hw - 0.28), yl + 0.2, zr - 0.01); k.box('black', tl[0], tl[1], tl[2], 0.3, 0.16, 0.04, rgb('#c01818'), r);
    const mr = W(side * (hw + 0.1), s.upper[0][1] + 0.18, s.upper[1][0] - 0.1); k.box('carPaint', mr[0], mr[1], mr[2], 0.2, 0.1, 0.14, col, r);
    const dh = W(side * (hw + 0.005), s.upper[0][1] - 0.12, 0.2); k.box('chrome', dh[0], dh[1], dh[2], 0.015, 0.03, 0.18, CHROME, r);
  }
  const gr = W(0, yl - 0.02, zf + 0.012); k.box('black', gr[0], gr[1], gr[2], hw * 1.0, 0.22, 0.03, rgb('#202020'), r);
  for (let i = 0; i < 3; i++) { const g2 = W(0, yl - 0.1 + i * 0.08, zf + 0.03); k.box('chrome', g2[0], g2[1], g2[2], hw * 0.95, 0.015, 0.02, CHROME, r); }
  const pf = W(0, s.lower[1][1] + 0.18, zf + 0.012); k.box('white', pf[0], pf[1], pf[2], 0.5, 0.12, 0.02, [0.95, 0.95, 0.9], r);
  const pr = W(0, s.lower[0][1] + 0.3, zr - 0.012); k.box('white', pr[0], pr[1], pr[2], 0.5, 0.12, 0.02, [0.95, 0.95, 0.9], r);
  // bumpers
  const bf = W(0, s.lower[1][1] + 0.1, zf + 0.03); k.box('rubber', bf[0], bf[1], bf[2], s.width - 0.1, 0.2, 0.08, RUB, r);
  const br = W(0, s.lower[0][1] + 0.1, zr - 0.03); k.box('rubber', br[0], br[1], br[2], s.width - 0.1, 0.2, 0.08, RUB, r);
  if (s.roofBox) { for (const side of [-1, 1]) { const rb = W(side * (hw - 0.3), s.upper[2][1] + s.roofBox[2] / 2 + 0.02, (s.roofBox[0] + s.roofBox[1]) / 2); k.box('metalDark', rb[0], rb[1], rb[2], 0.06, s.roofBox[2], s.roofBox[1] - s.roofBox[0], RUB, r); } }
  if (s.spare) { k.prism('rubber', circle(0.38), -0.14, 0.14, RUB, W(0.2, 1.1, zr - 0.15), r + Math.PI / 2); }
  if (s.bed) { const bb = W(0, s.lower[4][1] + 0.01, (s.bed[0] + s.bed[1]) / 2); k.box('rubber', bb[0], bb[1], bb[2], s.width - 0.2, 0.03, s.bed[1] - s.bed[0], rgb('#222'), r); }
  if (s.stripe) { for (const side of [-1, 1]) { const st = W(side * (hw + 0.004), 0.95, 0); k.box('black', st[0], st[1], st[2], 0.01, 0.16, 4.6, rgb('#111'), r); } }
  if (k.collision) { const c4 = [W(-hw, 0, zr), W(hw, 0, zr), W(hw, 0, zf), W(-hw, 0, zf)]; k.collision.addPolygon(c4.map(q => [q[0], q[2]] as [number, number]), p.y, p.y + 1.6); }
}

/** wheels: rubber tyre + rim + hub, drawn as short prisms at each axle */
export function carWheels(k: MeshKit, p: Place, kind: Exclude<CarKind, 'okada'>): void {
  const s = SPECS[kind]; const r = p.rot ?? 0; const c = Math.cos(r), sn = Math.sin(r); const hw = s.width / 2;
  for (const wz of s.wheelZ) for (const side of [-1, 1]) {
    const o: [number, number, number] = [p.x + wz * sn, p.y + s.wheelR, p.z + wz * c];
    const x0 = side > 0 ? hw - s.wheelW : -hw, x1 = side > 0 ? hw : -hw + s.wheelW;
    k.prism('rubber', circle(s.wheelR), x0, x1, RUB, o, r);
    const ox = side > 0 ? hw + 0.006 : -hw - 0.006;
    k.prism('metal', circle(s.wheelR * 0.6, 10), side > 0 ? ox - 0.012 : ox, side > 0 ? ox : ox + 0.012, RIM, o, r);
    k.prism('rubber', circle(s.wheelR * 0.2, 8), side > 0 ? ox - 0.012 : ox + 0.0, side > 0 ? ox + 0.006 : ox + 0.018, RUB, o, r);
  }
}

export function okada(k: MeshKit, p: Place, colorHex: string): void {
  const r = p.rot ?? 0; const c = Math.cos(r), sn = Math.sin(r); const col = rgb(colorHex);
  const W = (x: number, y: number, z: number): [number, number, number] => [p.x + x * c + z * sn, p.y + y, p.z - x * sn + z * c];
  for (const wz of [-0.68, 0.7]) { const o: [number, number, number] = [p.x + wz * sn, p.y + 0.3, p.z + wz * c]; k.prism('rubber', circle(0.3, 12), -0.05, 0.05, RUB, o, r); k.prism('metal', circle(0.2, 8), -0.055, 0.055, RIM, o, r); }
  const fr = W(0, 0.55, 0); k.box('carPaint', fr[0], fr[1], fr[2], 0.22, 0.26, 0.9, col, r);
  const tank = W(0, 0.82, 0.25); k.box('carPaint', tank[0], tank[1], tank[2], 0.3, 0.26, 0.45, col, r);
  const seat = W(0, 0.78, -0.3); k.box('leather', seat[0], seat[1], seat[2], 0.3, 0.12, 0.6, RUB, r);
  const eng = W(0, 0.42, 0.05); k.box('metal', eng[0], eng[1], eng[2], 0.34, 0.3, 0.4, RIM, r);
  k.segmentBox('metalDark', W(0, 0.6, 0.45), W(0, 1.0, 0.72), 0.05, RIM);
  k.segmentBox('metalDark', W(-0.32, 1.02, 0.6), W(0.32, 1.02, 0.6), 0.03, RUB);
  k.segmentBox('metalDark', W(0, 0.3, 0.7), W(0, 0.9, 0.62), 0.04, RIM);
  const hl = W(0, 0.95, 0.72); k.box('white', hl[0], hl[1], hl[2], 0.14, 0.14, 0.06, [1, 1, 0.9], r);
  const ex = W(0.15, 0.4, -0.35); k.box('chrome', ex[0], ex[1], ex[2], 0.08, 0.08, 0.6, CHROME, r);
  const st = W(-0.16, 0.2, 0.0); k.box('metalDark', st[0], st[1], st[2], 0.04, 0.4, 0.04, RUB, r + 0.4);
  if (k.collision) k.collision.addBox(p.x - 0.5, p.z - 1.0, p.x + 0.5, p.z + 1.0, p.y, p.y + 1.1);
}
