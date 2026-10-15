/**
 * Furniture & garden pieces built from kit primitives. Every function takes a position (x, y = floor, z)
 * and a yaw (rotation about y, THREE convention; 0 = piece faces +z). Pieces add their own collision.
 */
import { MeshKit, rgb, type RGB } from './kit';

export interface Place { x: number; y: number; z: number; rot?: number }
type K = MeshKit;
/** local → world helper for a placed piece: local x right, local z forward (towards the viewer) */
function frame(p: Place) {
  const r = p.rot ?? 0, c = Math.cos(r), s = Math.sin(r);
  return {
    r,
    box: (k: K, mat: Parameters<K['box']>[0], lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: RGB, collide = false, rotExtra = 0) =>
      k.box(mat, p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c, sx, sy, sz, color, r + rotExtra, { collide }),
    cyl: (k: K, mat: Parameters<K['box']>[0], lx: number, ly: number, lz: number, rad: number, h: number, color: RGB, seg = 12, collide = false, rTop?: number) =>
      k.cylinder(mat, p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c, rad, h, color, seg, { collide, rTop }),
    sph: (k: K, mat: Parameters<K['box']>[0], lx: number, ly: number, lz: number, rad: number, color: RGB, seg = 7, squash = 1) =>
      k.sphere(mat, p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c, rad, color, seg, squash),
    pt: (lx: number, ly: number, lz: number): [number, number, number] => [p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c],
  };
}
const WOOD = rgb('#8a5a32'), DARKWOOD = rgb('#4a2e18'), WHITE = rgb('#f4f1ea'), BLACK = rgb('#141414'), STEEL = rgb('#b9bec4'), GOLD = rgb('#c9a24a');

export function sofa(k: K, p: Place, width = 2.4, color = rgb('#5c6b7a')): void {
  const f = frame(p); const d = 0.95;
  f.box(k, 'fabricDark', 0, 0.22, 0, width, 0.44, d, color, true);                // base
  f.box(k, 'fabricDark', 0, 0.62, -d / 2 + 0.12, width, 0.5, 0.24, color);        // back
  for (const s of [-1, 1]) f.box(k, 'fabricDark', s * (width / 2 - 0.1), 0.42, 0.05, 0.2, 0.36, d - 0.1, color);
  const n = Math.max(2, Math.round(width / 0.8)); const cw = (width - 0.4) / n;
  for (let i = 0; i < n; i++) { const x = -width / 2 + 0.2 + cw * (i + 0.5); f.box(k, 'fabric', x, 0.5, 0.08, cw - 0.04, 0.14, d - 0.36, color.map(c => Math.min(1, c * 1.15)) as RGB); f.box(k, 'fabric', x, 0.72, -d / 2 + 0.3, cw - 0.06, 0.34, 0.14, color.map(c => Math.min(1, c * 1.1)) as RGB); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'woodDark', sx * (width / 2 - 0.08), 0.03, sz * (d / 2 - 0.08), 0.06, 0.06, 0.06, DARKWOOD);
}
export function armchair(k: K, p: Place, color = rgb('#8a5a3a')): void { sofa(k, p, 1.0, color); }
export function coffeeTable(k: K, p: Place, w = 1.3, d = 0.7): void {
  const f = frame(p); f.box(k, 'woodDark', 0, 0.4, 0, w, 0.04, d, DARKWOOD, true); f.box(k, 'glass', 0, 0.425, 0, w - 0.1, 0.01, d - 0.1, [0.8, 0.9, 0.9]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'metalDark', sx * (w / 2 - 0.06), 0.19, sz * (d / 2 - 0.06), 0.04, 0.38, 0.04, BLACK);
  f.box(k, 'white', -0.2, 0.47, 0.05, 0.3, 0.08, 0.22, WHITE); f.cyl(k, 'glass', 0.3, 0.43, -0.1, 0.1, 0.18, [0.8, 0.95, 1], 10);
}
export function rug(k: K, p: Place, w: number, d: number, color = rgb('#7a4a3a')): void { const f = frame(p); f.box(k, 'fabric', 0, 0.006, 0, w, 0.012, d, color); f.box(k, 'fabric', 0, 0.013, 0, w - 0.4, 0.004, d - 0.4, color.map(c => c * 0.8) as RGB); }
/** TV unit with a wall-mounted screen; returns the screen mesh centre & size so the game can animate it */
export function tvWall(k: K, p: Place, screenW = 1.9): { screen: [number, number, number]; rot: number; w: number; h: number } {
  const f = frame(p);
  f.box(k, 'woodDark', 0, 0.25, 0.25, 2.6, 0.5, 0.5, DARKWOOD, true);
  f.box(k, 'black', 0, 0.56, 0.3, 0.5, 0.12, 0.3, BLACK); f.box(k, 'black', -0.9, 0.6, 0.3, 0.18, 0.2, 0.18, BLACK); f.box(k, 'black', 0.9, 0.6, 0.3, 0.18, 0.2, 0.18, BLACK);
  f.box(k, 'black', 0, 1.45, 0.06, screenW + 0.06, screenW * 0.5625 + 0.06, 0.06, BLACK);
  const c = f.pt(0, 1.45, 0.095); return { screen: c, rot: f.r, w: screenW, h: screenW * 0.5625 };
}
export function diningSet(k: K, p: Place, seats = 8): void {
  const f = frame(p); const len = seats / 2 * 0.65 + 0.3, w = 1.1;
  f.box(k, 'woodDark', 0, 0.74, 0, len, 0.05, w, DARKWOOD, true);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'woodDark', sx * (len / 2 - 0.12), 0.36, sz * (w / 2 - 0.12), 0.08, 0.72, 0.08, DARKWOOD);
  for (let i = 0; i < seats / 2; i++) for (const side of [-1, 1]) {
    const x = -len / 2 + 0.35 + i * 0.65, z = side * (w / 2 + 0.3);
    f.box(k, 'leather', x, 0.45, z, 0.46, 0.06, 0.46, rgb('#2a2a2a')); f.box(k, 'leather', x, 0.75, z + side * 0.2, 0.46, 0.55, 0.06, rgb('#2a2a2a'));
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'metalDark', x + ax * 0.2, 0.21, z + az * 0.2, 0.03, 0.42, 0.03, BLACK);
  }
  // table setting
  for (let i = 0; i < seats / 2; i++) for (const side of [-1, 1]) { const x = -len / 2 + 0.35 + i * 0.65; f.cyl(k, 'white', x, 0.77, side * 0.28, 0.13, 0.01, WHITE, 10); f.cyl(k, 'glass', x + 0.2, 0.77, side * 0.18, 0.035, 0.12, [0.85, 0.95, 1], 8); }
  f.cyl(k, 'glass', 0, 0.77, 0, 0.09, 0.3, [0.7, 0.9, 0.8], 10); f.sph(k, 'foliage', 0, 1.12, 0, 0.16, rgb('#d14c7a'), 6);
}
export function sideboard(k: K, p: Place, w = 1.8): void { const f = frame(p); f.box(k, 'woodDark', 0, 0.42, 0, w, 0.84, 0.45, DARKWOOD, true); for (let i = 0; i < 3; i++) f.box(k, 'metal', -w / 2 + w / 6 + i * w / 3, 0.5, 0.23, 0.12, 0.02, 0.02, GOLD); f.box(k, 'white', -0.3, 0.98, 0, 0.3, 0.28, 0.3, WHITE); f.sph(k, 'foliage', 0.45, 1.05, 0, 0.18, rgb('#3f7d3a'), 6); }
/** kitchen run along local x: base cabinets, worktop, upper cabinets, sink / hob at given offsets */
export function kitchenRun(k: K, p: Place, len: number, o: { sink?: number; hob?: number; uppers?: boolean } = {}): void {
  const f = frame(p); const cab = rgb('#2f3b45'), top = rgb('#dcd7cf');
  f.box(k, 'fabricDark', 0, 0.43, 0, len, 0.86, 0.6, cab, true);
  f.box(k, 'marble', 0, 0.88, 0, len + 0.02, 0.04, 0.64, top);
  const doors = Math.round(len / 0.6); for (let i = 0; i < doors; i++) f.box(k, 'metal', -len / 2 + 0.3 + i * (len / doors), 0.78, 0.305, 0.16, 0.015, 0.015, STEEL);
  if (o.uppers !== false) { f.box(k, 'fabricDark', 0, 1.85, -0.12, len, 0.7, 0.36, cab); for (let i = 0; i < doors; i++) f.box(k, 'metal', -len / 2 + 0.3 + i * (len / doors), 1.58, 0.065, 0.16, 0.015, 0.015, STEEL); f.box(k, 'emissive', 0, 1.49, 0.05, len - 0.2, 0.02, 0.05, [1, 0.95, 0.85]); }
  if (o.sink !== undefined) { f.box(k, 'chrome', o.sink, 0.9, 0, 0.8, 0.02, 0.46, STEEL); f.box(k, 'black', o.sink, 0.905, 0, 0.7, 0.01, 0.38, rgb('#555c62')); f.cyl(k, 'chrome', o.sink, 0.9, -0.2, 0.02, 0.3, STEEL, 8); f.box(k, 'chrome', o.sink, 1.2, -0.1, 0.02, 0.02, 0.22, STEEL); }
  if (o.hob !== undefined) { f.box(k, 'black', o.hob, 0.905, 0, 0.6, 0.01, 0.5, BLACK); for (const [a, b] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) f.cyl(k, 'metalDark', o.hob + a, 0.91, b, 0.09, 0.01, rgb('#3a3a3a'), 10); f.box(k, 'chrome', o.hob, 2.05, -0.2, 0.9, 0.08, 0.5, STEEL); f.box(k, 'chrome', o.hob, 2.4, -0.25, 0.3, 0.62, 0.3, STEEL); }
}
export function island(k: K, p: Place, len = 2.4): void { const f = frame(p); f.box(k, 'fabricDark', 0, 0.45, 0, len, 0.9, 1.0, rgb('#2f3b45'), true); f.box(k, 'marble', 0, 0.92, 0, len + 0.3, 0.05, 1.3, rgb('#dcd7cf')); for (let i = 0; i < 3; i++) { const x = -len / 2 + 0.4 + i * (len - 0.8) / 2; f.cyl(k, 'leather', x, 0.62, 0.85, 0.18, 0.06, BLACK, 10); f.cyl(k, 'metalDark', x, 0, 0.85, 0.03, 0.62, BLACK, 8); f.cyl(k, 'metalDark', x, 0, 0.85, 0.18, 0.02, BLACK, 10); } f.box(k, 'white', -0.6, 0.98, -0.2, 0.3, 0.1, 0.3, WHITE); f.sph(k, 'foliage', 0.6, 1.05, -0.15, 0.14, rgb('#e0b53c'), 6); }
export function cooker(k: K, p: Place): void { const f = frame(p); f.box(k, 'metal', 0, 0.44, 0, 0.9, 0.88, 0.6, STEEL, true); f.box(k, 'black', 0, 0.9, 0, 0.88, 0.03, 0.58, BLACK); f.box(k, 'glassDark', 0, 0.45, 0.305, 0.7, 0.4, 0.01, [0.1, 0.1, 0.1]); }
export function appliance(k: K, p: Place, w: number, h: number, d: number, color: RGB): void { const f = frame(p); f.box(k, 'metal', 0, h / 2, 0, w, h, d, color, true); }
export function bed(k: K, p: Place, w = 1.9, l = 2.1, o: { headboard?: RGB; duvet?: RGB } = {}): void {
  const f = frame(p); const hb = o.headboard ?? rgb('#4a3222'), duvet = o.duvet ?? rgb('#d8d2c6');
  f.box(k, 'woodDark', 0, 0.2, 0, w + 0.1, 0.4, l + 0.1, hb, true);
  f.box(k, 'fabric', 0, 0.5, 0, w, 0.22, l, WHITE);
  f.box(k, 'fabric', 0, 0.66, 0.18, w - 0.1, 0.14, l - 0.7, duvet);
  f.box(k, 'woodDark', 0, 0.7, -l / 2 - 0.03, w + 0.1, 1.4, 0.08, hb);
  for (const s of [-1, 1]) f.box(k, 'fabric', s * (w / 4), 0.68, -l / 2 + 0.35, w / 2 - 0.2, 0.14, 0.45, WHITE);
}
export function nightstand(k: K, p: Place, lamp = true): [number, number, number] { const f = frame(p); f.box(k, 'woodDark', 0, 0.28, 0, 0.5, 0.56, 0.45, rgb('#4a3222'), true); f.box(k, 'metal', 0, 0.3, 0.23, 0.1, 0.015, 0.015, GOLD); if (lamp) { f.cyl(k, 'metal', 0, 0.56, 0, 0.06, 0.3, GOLD, 8); f.cyl(k, 'emissive', 0, 0.84, 0, 0.14, 0.2, [1, 0.93, 0.8], 10, false, 0.1); } return f.pt(0, 0.95, 0); }
export function wardrobe(k: K, p: Place, w = 2.4, h = 2.3, d = 0.6): void { const f = frame(p); f.box(k, 'woodDark', 0, h / 2, 0, w, h, d, rgb('#5a3e2a'), true); const n = Math.round(w / 0.6); for (let i = 1; i < n; i++) f.box(k, 'black', -w / 2 + i * (w / n), h / 2, d / 2 + 0.002, 0.012, h - 0.1, 0.006, BLACK); for (let i = 0; i < n; i++) f.box(k, 'metal', -w / 2 + (i + 0.5) * (w / n) + (i % 2 ? -0.2 : 0.2), 1.1, d / 2 + 0.02, 0.02, 0.3, 0.02, GOLD); }
export function dresser(k: K, p: Place): void { const f = frame(p); f.box(k, 'woodDark', 0, 0.4, 0, 1.2, 0.8, 0.5, rgb('#5a3e2a'), true); f.box(k, 'glassDark', 0, 1.35, -0.2, 0.9, 0.9, 0.02, [0.85, 0.9, 0.95]); f.box(k, 'metal', 0, 1.35, -0.21, 0.96, 0.96, 0.01, GOLD); f.cyl(k, 'leather', 0, 0.38, 0.6, 0.2, 0.08, rgb('#8a6a4a'), 10); f.cyl(k, 'metalDark', 0, 0, 0.6, 0.03, 0.38, BLACK, 8); }
export function desk(k: K, p: Place): void { const f = frame(p); f.box(k, 'woodDark', 0, 0.74, 0, 1.8, 0.04, 0.8, rgb('#3a2a1e'), true); for (const s of [-1, 1]) f.box(k, 'woodDark', s * 0.8, 0.36, 0, 0.06, 0.72, 0.7, rgb('#3a2a1e')); f.box(k, 'woodDark', -0.55, 0.36, 0, 0.5, 0.7, 0.7, rgb('#3a2a1e')); f.box(k, 'metalDark', 0.2, 0.775, -0.1, 0.34, 0.015, 0.24, rgb('#9aa0a6')); f.box(k, 'metalDark', 0.2, 0.9, -0.22, 0.34, 0.22, 0.01, rgb('#9aa0a6'), false); f.box(k, 'screen', 0.2, 0.9, -0.212, 0.31, 0.19, 0.004, [0.05, 0.08, 0.1]); f.cyl(k, 'white', -0.5, 0.76, -0.2, 0.05, 0.1, WHITE, 8); f.box(k, 'fabricDark', 0.55, 0.78, 0.1, 0.25, 0.04, 0.3, rgb('#1d3b5e')); }
export function officeChair(k: K, p: Place): void { const f = frame(p); f.box(k, 'leather', 0, 0.48, 0, 0.5, 0.08, 0.5, BLACK, true); f.box(k, 'leather', 0, 0.85, -0.22, 0.48, 0.6, 0.08, BLACK); f.cyl(k, 'metalDark', 0, 0, 0, 0.03, 0.44, BLACK, 8); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; f.box(k, 'metalDark', Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17, 0.3, 0.03, 0.04, BLACK, false, -a); } }
export function bookshelf(k: K, p: Place, w = 2.0, h = 2.3): void { const f = frame(p); f.box(k, 'woodDark', 0, h / 2, 0, w, h, 0.35, rgb('#3a2a1e'), true); const rows = 5; for (let r = 0; r < rows; r++) { const y = 0.1 + r * (h - 0.2) / rows; f.box(k, 'woodDark', 0, y + 0.015, 0.01, w - 0.06, 0.03, 0.33, rgb('#6a4a30')); let x = -w / 2 + 0.08; while (x < w / 2 - 0.12) { const bw = 0.03 + Math.random() * 0.04, bh = 0.2 + Math.random() * 0.12; f.box(k, 'fabric', x + bw / 2, y + 0.03 + bh / 2, 0.02, bw, bh, 0.22, [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.5, 0.2 + Math.random() * 0.6]); x += bw + 0.005; if (Math.random() < 0.08) x += 0.12; } } }
export function bathtub(k: K, p: Place): void { const f = frame(p); f.box(k, 'white', 0, 0.28, 0, 1.75, 0.56, 0.8, WHITE, true); f.box(k, 'water', 0, 0.5, 0, 1.55, 0.04, 0.62, [0.7, 0.9, 1]); f.box(k, 'chrome', -0.75, 0.62, 0, 0.06, 0.12, 0.06, STEEL); f.box(k, 'chrome', -0.75, 0.7, 0, 0.2, 0.03, 0.03, STEEL); }
export function shower(k: K, p: Place, s = 1.0): void { const f = frame(p); f.box(k, 'tile', 0, 0.04, 0, s, 0.08, s, WHITE); f.box(k, 'glass', s / 2, 1.1, 0, 0.01, 2.1, s, [0.8, 0.9, 0.95]); f.box(k, 'glass', 0, 1.1, s / 2, s, 2.1, 0.01, [0.8, 0.9, 0.95]); f.box(k, 'chrome', -s / 2 + 0.05, 2.15, -s / 2 + 0.3, 0.03, 0.03, 0.4, STEEL); f.cyl(k, 'chrome', -s / 2 + 0.05, 2.1, -s / 2 + 0.5, 0.12, 0.02, STEEL, 10); f.box(k, 'chrome', -s / 2 + 0.02, 1.1, 0, 0.03, 0.15, 0.03, STEEL); }
export function toilet(k: K, p: Place): void { const f = frame(p); f.box(k, 'white', 0, 0.2, 0, 0.4, 0.4, 0.55, WHITE, true); f.box(k, 'white', 0, 0.43, 0, 0.42, 0.06, 0.58, WHITE); f.box(k, 'white', 0, 0.6, -0.35, 0.42, 0.4, 0.18, WHITE); f.box(k, 'chrome', 0.1, 0.81, -0.35, 0.06, 0.02, 0.06, STEEL); }
export function basin(k: K, p: Place, w = 0.8, mirror = true): void { const f = frame(p); f.box(k, 'woodDark', 0, 0.4, 0, w, 0.8, 0.5, rgb('#4a3222'), true); f.box(k, 'white', 0, 0.83, 0, w + 0.02, 0.06, 0.52, WHITE); f.box(k, 'white', 0, 0.86, 0, 0.45, 0.02, 0.35, rgb('#e8e8e8')); f.cyl(k, 'chrome', 0, 0.86, -0.18, 0.02, 0.2, STEEL, 8); if (mirror) { f.box(k, 'glassDark', 0, 1.5, -0.24, w - 0.1, 0.8, 0.02, [0.85, 0.9, 0.95]); f.box(k, 'emissive', 0, 1.96, -0.2, w - 0.2, 0.04, 0.06, [1, 0.97, 0.9]); } }
export function plant(k: K, p: Place, size = 1): void { const f = frame(p); f.cyl(k, 'concrete', 0, 0, 0, 0.22 * size, 0.4 * size, rgb('#8a7a6a'), 10, true, 0.26 * size); f.cyl(k, 'trunk', 0, 0.4 * size, 0, 0.03, 0.6 * size, DARKWOOD, 6); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; f.sph(k, 'foliage', Math.cos(a) * 0.22 * size, (0.95 + (i % 2) * 0.15) * size, Math.sin(a) * 0.22 * size, 0.2 * size, rgb(i % 2 ? '#3f7d3a' : '#4f9a45'), 5, 0.7); } f.sph(k, 'foliage', 0, 1.15 * size, 0, 0.24 * size, rgb('#3f7d3a'), 5, 0.8); }
export function painting(k: K, p: Place, w = 1.2, h = 0.9, color: RGB = rgb('#c0603a')): void { const f = frame(p); f.box(k, 'woodDark', 0, 0, 0, w, h, 0.04, rgb('#2a1a10')); f.box(k, 'fabric', 0, 0, 0.012, w - 0.1, h - 0.1, 0.03, color); f.box(k, 'fabric', -w * 0.15, h * 0.1, 0.022, w * 0.3, h * 0.35, 0.015, [Math.min(1, color[0] * 1.5), color[1] * 0.8, color[2] * 0.7]); f.box(k, 'fabric', w * 0.2, -h * 0.15, 0.022, w * 0.25, h * 0.3, 0.015, [color[0] * 0.5, color[1] * 0.6, Math.min(1, color[2] * 1.6)]); }
export function chandelier(k: K, p: Place, r = 0.5): [number, number, number] { const f = frame(p); f.cyl(k, 'metal', 0, -0.5, 0, 0.015, 0.5, GOLD, 6); f.cyl(k, 'metal', 0, -0.52, 0, r, 0.04, GOLD, 16); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; f.cyl(k, 'emissive', Math.cos(a) * r * 0.85, -0.7, Math.sin(a) * r * 0.85, 0.05, 0.16, [1, 0.95, 0.8], 6); f.cyl(k, 'glass', Math.cos(a) * r * 0.85, -0.66, Math.sin(a) * r * 0.85, 0.09, 0.14, [1, 1, 1], 6, false, 0.06); } return f.pt(0, -0.8, 0); }
export function ceilingLamp(k: K, p: Place, r = 0.22): [number, number, number] { const f = frame(p); f.cyl(k, 'emissive', 0, -0.06, 0, r, 0.06, [1, 0.96, 0.88], 12); f.cyl(k, 'metal', 0, -0.01, 0, r + 0.02, 0.01, STEEL, 12); return f.pt(0, -0.2, 0); }
export function floorLamp(k: K, p: Place): [number, number, number] { const f = frame(p); f.cyl(k, 'metalDark', 0, 0, 0, 0.14, 0.02, BLACK, 10); f.cyl(k, 'metalDark', 0, 0, 0, 0.012, 1.5, BLACK, 6); f.cyl(k, 'emissive', 0, 1.45, 0, 0.18, 0.3, [1, 0.93, 0.8], 12, false, 0.14); return f.pt(0, 1.6, 0); }
export function wallLight(k: K, p: Place): [number, number, number] { const f = frame(p); f.box(k, 'metalDark', 0, 0, 0, 0.1, 0.22, 0.06, BLACK); f.box(k, 'emissive', 0, 0, 0.04, 0.08, 0.16, 0.03, [1, 0.95, 0.85]); return f.pt(0, 0, 0.2); }
export function curtain(k: K, p: Place, w: number, h: number, color = rgb('#b8a88a')): void { const f = frame(p); f.box(k, 'metalDark', 0, h + 0.05, 0, w + 0.3, 0.03, 0.03, GOLD); const n = Math.max(2, Math.round(w / 0.35)); for (let i = 0; i < n; i++) f.box(k, 'fabric', -w / 2 + (i + 0.5) * (w / n), h / 2, (i % 2) * 0.04, w / n - 0.02, h, 0.05, i % 2 ? color : color.map(c => c * 0.9) as RGB); }
export function acUnit(k: K, p: Place): void { const f = frame(p); f.box(k, 'white', 0, 0, 0, 0.9, 0.3, 0.22, WHITE); f.box(k, 'black', 0, -0.1, 0.11, 0.8, 0.03, 0.01, rgb('#555')); }
export function acOutdoor(k: K, p: Place): void { const f = frame(p); f.box(k, 'metal', 0, 0, 0, 0.8, 0.6, 0.3, rgb('#c8c8c8'), false); f.cyl(k, 'metalDark', 0, -0.0, 0.16, 0.22, 0.02, rgb('#333'), 12); }
export function sunLounger(k: K, p: Place, color = rgb('#f0ead8')): void { const f = frame(p); f.box(k, 'fabric', 0, 0.35, 0.3, 0.7, 0.08, 1.3, color, true); f.box(k, 'fabric', 0, 0.62, -0.45, 0.7, 0.08, 0.7, color, false, 0); f.box(k, 'metalDark', 0, 0.17, 0.3, 0.6, 0.34, 0.05, STEEL); for (const s of [-1, 1]) { f.box(k, 'metalDark', s * 0.33, 0.17, 0.3, 0.04, 0.34, 1.2, STEEL); } }
export function umbrella(k: K, p: Place, color = rgb('#d8c39a')): void { const f = frame(p); f.cyl(k, 'concrete', 0, 0, 0, 0.25, 0.08, rgb('#777'), 10, true); f.cyl(k, 'metalDark', 0, 0, 0, 0.025, 2.4, STEEL, 6); f.cyl(k, 'fabric', 0, 2.0, 0, 1.6, 0.5, color, 12, false, 0.05); }
export function bench(k: K, p: Place, w = 1.6): void { const f = frame(p); f.box(k, 'wood', 0, 0.45, 0, w, 0.05, 0.45, WOOD, true); f.box(k, 'wood', 0, 0.75, -0.22, w, 0.4, 0.05, WOOD); for (const s of [-1, 1]) f.box(k, 'metalDark', s * (w / 2 - 0.1), 0.22, 0, 0.05, 0.44, 0.4, BLACK); }
export function palm(k: K, p: Place, h = 7, lean = 0.1): void {
  const f = frame(p); const segs = 6; let x = 0, z = 0;
  for (let i = 0; i < segs; i++) { const y0 = (h * i) / segs; x += lean * h / segs * 0.5; f.cyl(k, 'trunk', x, y0, z, 0.22 - i * 0.015, h / segs + 0.05, rgb('#8a7a5a'), 7, i === 0, 0.21 - i * 0.015); }
  const top = f.pt(x, h, z);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; const len = 2.6 + (i % 3) * 0.3; const tip: [number, number, number] = [top[0] + Math.cos(a) * len, top[1] - 0.9 + (i % 2) * 0.2, top[2] + Math.sin(a) * len]; const mid: [number, number, number] = [top[0] + Math.cos(a) * len * 0.5, top[1] + 0.35, top[2] + Math.sin(a) * len * 0.5]; k.segmentBox('foliage', top, mid, 0.42, rgb('#3f8a3a')); k.segmentBox('foliage', mid, tip, 0.32, rgb('#4f9a45')); }
  f.sph(k, 'foliage', x, h + 0.1, z, 0.35, rgb('#5a3a1a'), 5);
  if (k.collision) k.collision.addCylinder(p.x, p.z, 0.3, p.y, p.y + 2);
}
export function tree(k: K, p: Place, h = 6, r = 2.4): void { const f = frame(p); f.cyl(k, 'trunk', 0, 0, 0, 0.25, h * 0.45, rgb('#6a4a30'), 7, true, 0.18); f.sph(k, 'foliage', 0, h * 0.45 + r * 0.7, 0, r, rgb('#3e7a34'), 7, 0.85); f.sph(k, 'foliage', r * 0.5, h * 0.45 + r * 0.9, r * 0.2, r * 0.7, rgb('#4a8a3c'), 6, 0.8); f.sph(k, 'foliage', -r * 0.5, h * 0.45 + r * 0.6, -r * 0.3, r * 0.65, rgb('#356d2e'), 6, 0.8); }
export function hedge(k: K, p: Place, len: number, h = 1.0, d = 0.6): void { const f = frame(p); f.box(k, 'foliage', 0, h / 2, 0, len, h, d, rgb('#2f6b2a'), true); for (let i = 0; i < len / 0.7; i++) f.sph(k, 'foliage', -len / 2 + 0.35 + i * 0.7, h, 0, d * 0.5, rgb('#3a7d33'), 4, 0.6); }
export function shrub(k: K, p: Place, r = 0.5, color = rgb('#3f8a3a')): void { const f = frame(p); f.sph(k, 'foliage', 0, r * 0.8, 0, r, color, 5, 0.85); f.sph(k, 'foliage', r * 0.4, r * 0.9, r * 0.3, r * 0.6, color.map(c => c * 1.1) as RGB, 4, 0.8); }
export function flowerBed(k: K, p: Place, w: number, d: number): void { const f = frame(p); f.box(k, 'soil', 0, 0.05, 0, w, 0.1, d, rgb('#5a3a22')); f.box(k, 'stone', 0, 0.1, d / 2, w, 0.2, 0.12, rgb('#9a9088')); f.box(k, 'stone', 0, 0.1, -d / 2, w, 0.2, 0.12, rgb('#9a9088')); const cols = ['#d1356b', '#e8b63a', '#f5f1e8', '#c94a2a']; for (let i = 0; i < w * 2.5; i++) f.sph(k, 'foliage', -w / 2 + 0.2 + i * 0.4 + ((i * 7) % 3) * 0.05, 0.28, ((i * 5) % 3 - 1) * d * 0.25, 0.14, rgb(cols[i % 4]), 4, 0.7); for (let i = 0; i < w * 2.5; i++) f.sph(k, 'foliage', -w / 2 + 0.1 + i * 0.4, 0.17, ((i * 3) % 3 - 1) * d * 0.3, 0.2, rgb('#3f8a3a'), 4, 0.6); }
export function lampPost(k: K, p: Place, h = 3.2): [number, number, number] { const f = frame(p); f.cyl(k, 'metalDark', 0, 0, 0, 0.08, h, BLACK, 8, true); f.cyl(k, 'metalDark', 0, 0, 0, 0.16, 0.25, BLACK, 8); f.sph(k, 'emissive', 0, h + 0.2, 0, 0.2, [1, 0.95, 0.82], 7); f.cyl(k, 'metalDark', 0, h + 0.36, 0, 0.1, 0.06, BLACK, 8); return f.pt(0, h + 0.2, 0); }
export function generator(k: K, p: Place): void { const f = frame(p); f.box(k, 'metal', 0, 0.75, 0, 2.6, 1.5, 1.1, rgb('#2f6b3a'), true); f.box(k, 'black', 0, 0.75, 0.56, 1.6, 0.9, 0.02, rgb('#1a1a1a')); for (let i = 0; i < 8; i++) f.box(k, 'metalDark', -0.7 + i * 0.2, 0.75, 0.57, 0.02, 0.8, 0.01, rgb('#555')); f.cyl(k, 'metalDark', 0.9, 1.5, -0.3, 0.07, 0.6, rgb('#444'), 8); f.box(k, 'metal', -0.9, 1.2, 0.56, 0.4, 0.3, 0.02, rgb('#e0c020')); f.cyl(k, 'metal', -2.0, 0, -0.2, 0.5, 1.2, rgb('#b8b0a0'), 12, true); }
export function waterTank(k: K, p: Place, h = 3.5): void { const f = frame(p); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'metalDark', sx * 0.9, h / 2, sz * 0.9, 0.08, h, 0.08, rgb('#333'), true); for (const y of [1.2, 2.4, h]) { f.box(k, 'metalDark', 0, y, -0.9, 1.9, 0.06, 0.06, rgb('#333')); f.box(k, 'metalDark', 0, y, 0.9, 1.9, 0.06, 0.06, rgb('#333')); f.box(k, 'metalDark', -0.9, y, 0, 0.06, 0.06, 1.9, rgb('#333')); f.box(k, 'metalDark', 0.9, y, 0, 0.06, 0.06, 1.9, rgb('#333')); } f.box(k, 'metalDark', 0, h + 0.03, 0, 2.0, 0.06, 2.0, rgb('#444')); f.cyl(k, 'rubber', 0, h + 0.06, 0, 0.95, 1.5, rgb('#1a1a1a'), 14, true, 0.85); f.cyl(k, 'rubber', 0, h + 1.56, 0, 0.85, 0.2, rgb('#222'), 14, true, 0.3); }
export function fountain(k: K, p: Place): void { const f = frame(p); f.cyl(k, 'stone', 0, 0, 0, 2.6, 0.55, rgb('#9a9088'), 20, true, 2.5); f.cyl(k, 'water', 0, 0.42, 0, 2.3, 0.05, [0.6, 0.85, 1], 20); f.cyl(k, 'stone', 0, 0.45, 0, 0.3, 1.1, rgb('#9a9088'), 10); f.cyl(k, 'stone', 0, 1.5, 0, 1.0, 0.2, rgb('#9a9088'), 16, true, 0.9); f.cyl(k, 'water', 0, 1.66, 0, 0.9, 0.04, [0.6, 0.85, 1], 16); f.cyl(k, 'stone', 0, 1.7, 0, 0.12, 0.5, rgb('#9a9088'), 8); f.sph(k, 'water', 0, 2.3, 0, 0.14, [0.7, 0.9, 1], 5); }
export function pergola(k: K, p: Place, w: number, d: number, h = 3.0): void { const f = frame(p); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(k, 'woodDark', sx * (w / 2 - 0.15), h / 2, sz * (d / 2 - 0.15), 0.25, h, 0.25, DARKWOOD, true); f.box(k, 'woodDark', 0, h + 0.1, -d / 2 + 0.15, w, 0.2, 0.3, DARKWOOD); f.box(k, 'woodDark', 0, h + 0.1, d / 2 - 0.15, w, 0.2, 0.3, DARKWOOD); const n = Math.round(w / 0.6); for (let i = 0; i <= n; i++) f.box(k, 'woodDark', -w / 2 + i * (w / n), h + 0.3, 0, 0.1, 0.2, d + 0.4, DARKWOOD); }
export function gazebo(k: K, p: Place, r = 3): void { const f = frame(p); f.cyl(k, 'paving', 0, 0, 0, r + 0.3, 0.2, rgb('#9a9088'), 8); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; f.cyl(k, 'woodDark', Math.cos(a) * r * 0.9, 0.2, Math.sin(a) * r * 0.9, 0.1, 2.8, DARKWOOD, 8, true); } f.cyl(k, 'roof', 0, 3.0, 0, r + 0.5, 1.4, rgb('#6a3a2a'), 8, true, 0.2); f.cyl(k, 'woodDark', 0, 2.95, 0, r + 0.4, 0.1, DARKWOOD, 8); for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; if (i === 0) continue; f.box(k, 'woodDark', Math.cos(a) * r * 0.85, 0.65, Math.sin(a) * r * 0.85, 0.08, 0.9, r * 0.9, DARKWOOD, true, -a + Math.PI / 2); } }
export function car_placeholder(): void { /* see cars.ts */ }
