/**
 * Procedural, tileable fabric textures for the wardrobe.  Every fabric is one 256² PNG with the
 * colours baked in (prints) or a neutral weave meant to be tinted through baseColorFactor (plains).
 * Patterns are evaluated in periodic tile coordinates so they repeat seamlessly; `tile` is the
 * metric size of one repeat, which the garment UV mapper uses (planar mapping in metres).
 */
import { Canvas, fbm, hash2, hex as hexSRGB, mix, vnoise, type RGB } from './raster';

/** hex sRGB → linear RGB (textures are painted in linear light and sRGB-encoded on save) */
export function linear(hexCol: string): RGB { const c = hexSRGB(hexCol); return c.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))) as RGB; }
const hex = linear;

export interface Fabric { name: string; tile: number; tintable?: boolean; roughness?: number; paint: (size: number) => Canvas }

const fract = (x: number) => x - Math.floor(x);
const tri = (x: number) => Math.abs(fract(x) * 2 - 1);            // 0..1 triangle wave
const step = (e: number, x: number) => (x >= e ? 1 : 0);
const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const dist2 = (u: number, v: number, cu: number, cv: number) => { const du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu)), dv = Math.min(Math.abs(v - cv), 1 - Math.abs(v - cv)); return Math.hypot(du, dv); };

/** weave micro-structure multiplier (1 ± amp) */
function weave(u: number, v: number, n: number, amp: number): number {
  const a = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * n), b = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * n);
  return 1 - amp + amp * 2 * (0.5 * (a + b)) + (fbm(u * 24, v * 24, 2) - 0.5) * amp;
}
function paintFn(size: number, fn: (u: number, v: number) => RGB): Canvas {
  const c = new Canvas(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const col = fn((x + 0.5) / size, (y + 0.5) / size); c.set(x, y, [col[0], col[1], col[2], 1]); }
  c.encodeSRGB(); return c;
}

// ---- wax-print (ankara) designs ------------------------------------------------------------------
const PALETTES: RGB[][] = [
  ['#1F3A93', '#F2B705', '#E0431B'], ['#0B6E4F', '#F6E27F', '#2B1B12'], ['#8E2C8E', '#FFB400', '#FFFFFF'], ['#D7263D', '#02182B', '#F7F7F2'],
  ['#F28C28', '#1B1B1B', '#2E86AB'], ['#1D7874', '#F4D35E', '#EE964B'], ['#0C2340', '#F2E8CF', '#BC4749'], ['#6B3E26', '#F2B705', '#0B6E4F'],
].map(p => p.map(hex));

type Motif = (u: number, v: number, seed: number) => number; // returns 0..1 "ink" coverage selecting accent colour
const MOTIFS: Motif[] = [
  // concentric rings on an offset grid
  (u, v, s) => { const n = 2; const cu = fract(u * n), cv = fract(v * n + (Math.floor(u * n) % 2) * 0.5); const d = Math.hypot(cu - 0.5, cv - 0.5) * 2; const r = fract(d * (3 + (s % 2)) + 0.25); return step(0.5, r) * step(d, 1.0) + step(0.97, d) * 0; },
  // big petals / fan shapes
  (u, v, s) => { const n = 2; const cu = fract(u * n) - 0.5, cv = fract(v * n) - 0.5; const a = Math.atan2(cv, cu), d = Math.hypot(cu, cv) * 2; const k = 6 + (s % 3) * 2; return step(0.55 + 0.35 * Math.cos(a * k), d) * 0 + step(d, 0.55 + 0.3 * Math.cos(a * k)) * step(0.15, d); },
  // zigzag chevron bands
  (u, v, s) => { const n = 3 + (s % 2); const w = fract(v * n + tri(u * 4) * 0.45); return step(0.5, w); },
  // diamond lattice
  (u, v) => { const a = fract(u * 4 + v * 4), b = fract(u * 4 - v * 4); return Math.max(step(0.42, tri(a)) , step(0.42, tri(b))); },
  // dotted rows with diagonal stripes
  (u, v, s) => { const n = 6; const cu = fract(u * n) - 0.5, cv = fract(v * n) - 0.5; const d = Math.hypot(cu, cv) * 2; const stripe = step(0.75, fract((u + v) * 6 + s * 0.1)); return Math.max(step(d, 0.45), stripe * step(0.6, d)); },
  // ovals / cowrie
  (u, v) => { const n = 3; const cu = fract(u * n) - 0.5, cv = fract(v * n + (Math.floor(u * n) % 2) * 0.5) - 0.5; const d = Math.hypot(cu * 1.6, cv) * 2; return step(d, 0.6) * (1 - step(d, 0.25) * step(0.5, fract(cu * 10))); },
];

function ankara(seed: number): Fabric {
  const pal = PALETTES[seed % PALETTES.length]; const motif = MOTIFS[seed % MOTIFS.length]; const motif2 = MOTIFS[(seed * 7 + 3) % MOTIFS.length];
  return {
    name: `ankara_${seed}`, tile: 0.34 + (seed % 3) * 0.06, roughness: 0.85,
    paint: size => paintFn(size, (u, v) => {
      const m1 = motif(u, v, seed), m2 = motif2(u * 2 + 0.25, v * 2 + 0.1, seed + 1);
      // wax crackle: thin dark veins typical of real wax prints
      const crack = smooth(0.62, 0.66, fbm(u * 18 + seed, v * 18, 4)) * 0.35;
      let col = m1 > 0.5 ? pal[1] : m2 > 0.5 ? pal[2] : pal[0];
      col = mix(col, [0.1, 0.07, 0.05], crack);
      const w = weave(u, v, 128, 0.04); return [col[0] * w, col[1] * w, col[2] * w];
    }),
  };
}

// ---- other fabrics -----------------------------------------------------------------------------
const kente: Fabric = {
  name: 'kente', tile: 0.4, roughness: 0.8,
  paint: size => paintFn(size, (u, v) => {
    const gold = hex('#D9A21B'), green = hex('#1E6B3A'), red = hex('#B5121B'), black = hex('#15110F'), blue = hex('#1B3F8F');
    const strip = Math.floor(u * 4); const along = fract(v * 2 + strip * 0.37); const block = Math.floor(along * 4);
    const seq = [[gold, black, red, green], [green, gold, blue, gold], [red, gold, black, blue], [gold, green, red, gold]][strip % 4];
    let col = seq[block];
    const fine = step(0.5, fract(v * 60)) * step(0.75, fract(u * 24)); if (block % 2 === 0 && fine) col = mix(col, black, 0.6);
    const edge = smooth(0.0, 0.03, Math.min(fract(u * 4), 1 - fract(u * 4))); col = mix(black, col, 0.3 + 0.7 * edge);
    const w = weave(u, v, 160, 0.06); return [col[0] * w, col[1] * w, col[2] * w];
  }),
};
const asoOke: Fabric = {
  name: 'aso_oke', tile: 0.25, roughness: 0.75,
  paint: size => paintFn(size, (u, v) => {
    const base = hex('#5B2A86'), gold = hex('#D7B14A'), cream = hex('#F3EBD3');
    const s = fract(u * 6); let col = base; if (s > 0.42 && s < 0.5) col = gold; if (s > 0.74 && s < 0.78) col = cream;
    const perforation = step(0.5, fract(v * 40)) * step(0.6, fract(u * 40)) * step(0.5, s) * step(s, 0.7); col = mix(col, cream, perforation * 0.7);
    const w = weave(u, v, 120, 0.1); return [col[0] * w, col[1] * w, col[2] * w];
  }),
};
const adire: Fabric = {
  name: 'adire', tile: 0.4, roughness: 0.9,
  paint: size => paintFn(size, (u, v) => {
    const indigo = hex('#1A2B5F'), pale = hex('#D8DDEA');
    const n = 4; const cu = fract(u * n) - 0.5, cv = fract(v * n) - 0.5; const d = Math.hypot(cu, cv) * 2;
    const rings = step(0.5, fract(d * 4 + fbm(u * 10, v * 10, 3) * 0.6)) * step(d, 0.95);
    const dye = 0.55 + 0.45 * fbm(u * 6 + 3, v * 6, 4);
    const col = mix(indigo, pale, rings * 0.8 * dye); const w = weave(u, v, 100, 0.05); return [col[0] * w, col[1] * w, col[2] * w];
  }),
};
const denim: Fabric = {
  name: 'denim', tile: 0.12, tintable: true, roughness: 0.92,
  paint: size => paintFn(size, (u, v) => {
    const twill = 0.5 + 0.5 * Math.sin((u + v) * Math.PI * 2 * 48); const fade = fbm(u * 3, v * 3, 3);
    const l = 0.72 + 0.22 * twill + 0.15 * (fade - 0.5); return [l * 0.9, l * 0.95, l * 1.0];
  }),
};
const cotton: Fabric = { name: 'cotton', tile: 0.08, tintable: true, roughness: 0.9, paint: size => paintFn(size, (u, v) => { const l = 0.95 * weave(u, v, 64, 0.05) + (vnoise(u * 80, v * 80) - 0.5) * 0.05; return [l, l, l]; }) };
const polyester: Fabric = { name: 'polyester', tile: 0.08, tintable: true, roughness: 0.6, paint: size => paintFn(size, (u, v) => { const l = 0.97 * weave(u, v, 200, 0.02); return [l, l, l]; }) };
const stripes: Fabric = { name: 'stripes', tile: 0.1, tintable: true, roughness: 0.85, paint: size => paintFn(size, (u, v) => { const s = step(0.7, fract(u * 8)); const l = (1 - s * 0.55) * weave(u, v, 64, 0.04); return [l, l * (1 - s * 0.1), l * (1 - s * 0.25)]; }) };
const checks: Fabric = { name: 'checks', tile: 0.12, tintable: true, roughness: 0.85, paint: size => paintFn(size, (u, v) => { const a = step(0.5, fract(u * 6)), b = step(0.5, fract(v * 6)); const l = (1 - 0.3 * a - 0.3 * b) * weave(u, v, 64, 0.04); return [l, l, l]; }) };
const lace: Fabric = {
  name: 'lace', tile: 0.12, tintable: true, roughness: 0.8,
  paint: size => paintFn(size, (u, v) => {
    const n = 5; const cu = fract(u * n) - 0.5, cv = fract(v * n + (Math.floor(u * n) % 2) * 0.5) - 0.5; const d = Math.hypot(cu, cv) * 2; const a = Math.atan2(cv, cu);
    const flower = step(d, 0.55 + 0.25 * Math.cos(a * 6)) * (1 - step(d, 0.12)); const net = Math.max(step(0.85, fract(u * 40)), step(0.85, fract(v * 40)));
    const l = 0.6 + 0.4 * Math.max(flower, net * 0.6); return [l, l, l];
  }),
};
const leather: Fabric = { name: 'leather', tile: 0.1, tintable: true, roughness: 0.55, paint: size => paintFn(size, (u, v) => { const g = fbm(u * 40, v * 40, 4); const l = 0.85 + 0.3 * (g - 0.5); return [l, l * 0.98, l * 0.95]; }) };
const rubber: Fabric = { name: 'rubber', tile: 0.1, tintable: true, roughness: 0.75, paint: size => paintFn(size, (u, v) => { const l = 0.95 + 0.1 * (vnoise(u * 50, v * 50) - 0.5); return [l, l, l]; }) };
const hiVis: Fabric = {
  name: 'hivis', tile: 1.0, roughness: 0.7,
  // v axis = world height (1 tile = 1 m, origin at ground); bands at 1.0–1.06 m and 1.18–1.24 m
  paint: size => paintFn(size, (u, v) => {
    // garment UV for hi-vis: v = −y·(1.75/height) with tile 1 m → fract(−v) = height above ground (mod 1 m)
    const yy = 1 - v; const band = (yy < 0.06 ? 1 : 0) + (yy > 0.18 && yy < 0.24 ? 1 : 0);
    const col: RGB = band ? [0.75, 0.75, 0.78] : hex('#D8F000'); const w = weave(u, v, 200, 0.03); return [col[0] * w, col[1] * w, col[2] * w];
  }),
};
const jerseyGreen: Fabric = {
  name: 'jersey_green', tile: 0.2, roughness: 0.6,
  paint: size => paintFn(size, (u, v) => { const g = hex('#0B7A3B'), w = hex('#F2F2F2'); const s = step(0.9, fract(u * 2)) + step(0.9, fract(v * 2)); const col = s ? w : g; const m = weave(u, v, 160, 0.03); return [col[0] * m, col[1] * m, col[2] * m]; }),
};
const camo: Fabric = {
  name: 'camo', tile: 0.5, roughness: 0.9,
  paint: size => paintFn(size, (u, v) => { const a = fbm(u * 6, v * 6, 3), b = fbm(u * 6 + 5, v * 6 + 2, 3); const col = a > 0.58 ? hex('#2F3B1F') : b > 0.55 ? hex('#6B5B3A') : a < 0.42 ? hex('#1B1F14') : hex('#4E6B3A'); const m = weave(u, v, 100, 0.04); return [col[0] * m, col[1] * m, col[2] * m]; }),
};
const raffia: Fabric = { name: 'raffia', tile: 0.15, tintable: true, roughness: 0.95, paint: size => paintFn(size, (u, v) => { const a = step(0.5, fract(u * 20)) ^ step(0.5, fract(v * 20)); const l = (0.8 + 0.2 * a) * weave(u, v, 80, 0.08); return [l, l * 0.93, l * 0.8]; }) };
const plastic: Fabric = { name: 'plastic', tile: 0.1, tintable: true, roughness: 0.35, paint: size => paintFn(size, (u, v) => { const l = 0.98 + 0.04 * (vnoise(u * 30, v * 30) - 0.5); return [l, l, l]; }) };
const metal: Fabric = { name: 'metal', tile: 0.1, tintable: true, roughness: 0.4, paint: size => paintFn(size, (u, v) => { const l = 0.9 + 0.1 * fbm(u * 20, v * 2, 3); return [l, l, l]; }) };

export const FABRICS: Record<string, Fabric> = Object.fromEntries([
  ...Array.from({ length: 8 }, (_, i) => ankara(i)), kente, asoOke, adire, denim, cotton, polyester, stripes, checks, lace, leather, rubber, hiVis, jerseyGreen, camo, raffia, plastic, metal,
].map(f => [f.name, f]));

export const FABRIC_PNG = (name: string) => `textures/fabric_${name}.png`;

/** colour palettes (sRGB hex) used for tintable fabrics */
export const PLAIN_COLOURS = {
  shirt: ['#FFFFFF', '#E8EEF5', '#F5E6C8', '#9FC5E8', '#2E4A7D', '#D9D9D9', '#F2C14E', '#C8E6C9', '#F8BBD0', '#2B2B2B'],
  tee: ['#FFFFFF', '#1B1B1B', '#C62828', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A', '#00897B', '#EF6C00', '#607D8B', '#FFEB3B'],
  trousers: ['#1F2933', '#3E2723', '#5D4037', '#263238', '#C8B08A', '#7A7A7A', '#0D1B2A', '#424242'],
  denim: ['#3A5A8C', '#2C4870', '#5C7BA8', '#1F2F4F', '#7A8BA6'],
  skirt: ['#C62828', '#1565C0', '#F9A825', '#6A1B9A', '#2E7D32', '#1B1B1B', '#FF7043'],
  kaftan: ['#F2F2F2', '#9FC5E8', '#D7CCC8', '#B0BEC5', '#E6D5A8', '#A5D6A7', '#5B2A86', '#2E4A7D', '#F8E1A1'],
  agbada: ['#FFFFFF', '#1A237E', '#5B2A86', '#F2B705', '#1E6B3A', '#8E0038', '#80CBC4', '#F5F5DC'],
  abaya: ['#111111', '#1A1A2E', '#2B1B3F', '#3B2F2F'],
  shoe: ['#1B1B1B', '#3E2723', '#5D4037', '#F5F5F5', '#8D6E63'],
  slipper: ['#1B1B1B', '#1565C0', '#C62828', '#F9A825', '#2E7D32', '#F5F5F5'],
  hijab: ['#1B1B1B', '#5B2A86', '#2E4A7D', '#F2F2F2', '#B5121B', '#1E6B3A', '#D8A7B1', '#F2B705'],
  wax: [] as string[],
};

export function pick<T>(arr: T[], r: number): T { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }
export { hash2 };
