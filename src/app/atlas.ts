/**
 * Procedural material atlas. Every tile in TILES is painted at runtime into one colour canvas and one
 * mask canvas (R = tintable by vertex colour, G = emissive glass at night). No external textures.
 */
import * as THREE from 'three';
import { TILES, TILE_INDEX, ATLAS_COLS, ATLAS_ROWS, type TileDef } from '../shared/tiles';

export interface Atlas {
  color: THREE.Texture;
  mask: THREE.Texture;
  /** uv origin of a tile (bottom-left in texture space, v up as three.js expects with flipY=false handled below) */
  tileOrigin: (name: string) => [number, number];
  tileSize: [number, number];
  tileDef: (name: string) => TileDef;
  px: number;
}

type Ctx = CanvasRenderingContext2D;
interface P { g: Ctx; m: Ctx; x: number; y: number; s: number; rnd: () => number; p: Record<string, number | string>; }

const TINT = 'rgb(255,0,0)', GLASS = 'rgb(0,255,0)', GLASS_B = 'rgb(0,255,255)', FIXED = 'rgb(0,0,0)', GLASS_SOFT = 'rgb(0,140,0)', GLASS_SOFT_B = 'rgb(0,140,255)';

function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** value noise on the pixel grid, tileable within the tile */
function noiseTile(s: number, rnd: () => number, cells: number, octaves = 3): Float32Array {
  const out = new Float32Array(s * s);
  let amp = 1, total = 0, c = cells;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(c * c);
    for (let i = 0; i < c * c; i++) grid[i] = rnd();
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const fx = (x / s) * c, fy = (y / s) * c;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % c, y1 = (y0 + 1) % c;
      const v = (grid[y0 * c + x0] * (1 - sx) + grid[y0 * c + x1] * sx) * (1 - sy) + (grid[y1 * c + x0] * (1 - sx) + grid[y1 * c + x1] * sx) * sy;
      out[y * s + x] += v * amp;
    }
    total += amp; amp *= 0.5; c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** fill the tile with a grayscale (tintable) textured base */
function base(P: P, kind: 'plaster' | 'concrete' | 'brick' | 'block' | 'stone' | 'mud' | 'metal' | 'gravel' | 'asphalt' | 'earth' | 'sand' | 'grass' | 'dry' | 'paving' | 'dark' | 'wet' | 'field', opts: { lum?: number; contrast?: number; grime?: number } = {}) {
  const { g, m, x, y, s, rnd } = P;
  const img = g.createImageData(s, s);
  const d = img.data;
  const lum = opts.lum ?? 0.82, con = opts.contrast ?? 0.08, grime = opts.grime ?? 0.3;
  const n = noiseTile(s, rnd, kind === 'grass' || kind === 'dry' ? 16 : 6, 4);
  const n2 = noiseTile(s, rnd, 3, 2);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const k = j * s + i;
    let v = lum + (n[k] - 0.5) * con * 2;
    let r = v, gg = v, b = v;
    const u = i / s, w = j / s;
    switch (kind) {
      case 'brick': { const row = Math.floor(w * 12); const off = row % 2 ? 0.5 : 0; const col = Math.floor((u + off) * 4); const my = (w * 12) % 1, mx = ((u + off) * 4) % 1; const mortar = my < 0.1 || mx < 0.06; v = mortar ? 0.72 : lum + (((row * 7 + col * 13) % 5) / 5 - 0.5) * 0.12 + (n[k] - 0.5) * 0.08; r = gg = b = v; break; }
      case 'block': { const row = Math.floor(w * 6); const off = row % 2 ? 0.5 : 0; const my = (w * 6) % 1, mx = ((u + off) * 3) % 1; const mortar = my < 0.06 || mx < 0.04; v = mortar ? 0.68 : lum + (n[k] - 0.5) * 0.12; r = gg = b = v; break; }
      case 'stone': { const row = Math.floor(w * 5); const off = (row % 3) * 0.33; const my = (w * 5) % 1, mx = ((u + off) * 2) % 1; const joint = my < 0.05 || mx < 0.03; v = joint ? 0.66 : lum + (((row * 5 + Math.floor((u + off) * 2)) % 4) / 4 - 0.5) * 0.08 + (n[k] - 0.5) * 0.14; r = gg = b = v; break; }
      case 'mud': { v = lum + (n[k] - 0.5) * 0.2 + (n2[k] - 0.5) * 0.1; const band = Math.abs(((w * 4) % 1) - 0.5) < 0.03 ? 0.9 : 1; v *= band; r = gg = b = v; break; }
      case 'metal': { const ridge = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 16); v = lum + (ridge - 0.5) * 0.22 + (n[k] - 0.5) * 0.04; r = gg = b = v; break; }
      case 'gravel': { v = lum + (n[k] - 0.5) * 0.5 + (rnd() - 0.5) * 0.2; r = gg = b = v; break; }
      case 'asphalt': { v = lum + (n[k] - 0.5) * 0.12 + (rnd() - 0.5) * 0.14; r = gg = b = v; break; }
      case 'paving': { const sx = (u * 4) % 1, sy = (w * 4) % 1; const joint = sx < 0.035 || sy < 0.035; v = joint ? lum - 0.2 : lum + (n[k] - 0.5) * 0.08 + (((Math.floor(u * 4) + Math.floor(w * 4)) % 2) ? 0.02 : -0.02); r = gg = b = v; break; }
      case 'earth': { v = lum + (n[k] - 0.5) * 0.3 + (rnd() - 0.5) * 0.08; r = v * 1.04; gg = v * 0.98; b = v * 0.9; break; }
      case 'sand': { v = lum + (n[k] - 0.5) * 0.12 + (rnd() - 0.5) * 0.05; r = v * 1.03; gg = v; b = v * 0.94; break; }
      case 'wet': { v = lum + (n[k] - 0.5) * 0.2; r = v * 0.95; gg = v; b = v * 1.02; break; }
      case 'grass': case 'dry': { const blade = (rnd() - 0.5) * 0.18; v = lum + (n[k] - 0.5) * 0.3 + blade + (n2[k] - 0.5) * 0.15; r = v * 0.97; gg = v * 1.03; b = v * 0.9; break; }
      case 'field': { const row = 0.5 + 0.5 * Math.sin(w * Math.PI * 2 * 10); v = lum + (row - 0.5) * 0.3 + (n[k] - 0.5) * 0.15; r = v; gg = v; b = v * 0.92; break; }
      case 'dark': { v = lum + (n[k] - 0.5) * 0.1; r = gg = b = v; break; }
      case 'concrete': { v = lum + (n[k] - 0.5) * 0.1 + (n2[k] - 0.5) * 0.06; r = gg = b = v; break; }
      default: { v = lum + (n[k] - 0.5) * con * 2 + (n2[k] - 0.5) * 0.05; r = gg = b = v; }
    }
    // grime: darker towards the bottom of a facade tile and faint streaks
    if (grime > 0) { const gb = Math.max(0, 0.12 - w) * grime * 2.5; const streak = (n2[(j * s + ((i + 11) % s))] - 0.5) * grime * 0.06; r -= gb + streak; gg -= gb + streak; b -= gb + streak; }
    d[k * 4] = Math.max(0, Math.min(255, r * 255)); d[k * 4 + 1] = Math.max(0, Math.min(255, gg * 255)); d[k * 4 + 2] = Math.max(0, Math.min(255, b * 255)); d[k * 4 + 3] = 255;
  }
  g.putImageData(img, x, y);
  m.fillStyle = TINT; m.fillRect(x, y, s, s);
}

/** draws a window with glass, frame, sill and shadow; coordinates in tile fractions */
function window(P: P, fx: number, fy: number, fw: number, fh: number, o: { frame: string; arch?: boolean; louvre?: boolean; rail?: boolean; small?: boolean }) {
  const { g, m, x, y, s } = P;
  const wx = x + fx * s, wy = y + fy * s, ww = fw * s, wh = fh * s;
  const frameCol = o.frame === 'dark' ? '#3a3a3c' : o.frame === 'wood' ? '#5b3f2a' : '#e8e4dc';
  const fr = Math.max(2, s * 0.016);
  // shadow / reveal
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(wx - fr, wy - fr * 2, ww + fr * 2, wh + fr * 3);
  const glass = (ctx: Ctx, col: string | CanvasGradient) => { ctx.fillStyle = col; if (o.arch) { ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + ww / 2); ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.closePath(); ctx.fill(); } else ctx.fillRect(wx, wy, ww, wh); };
  glass(g, frameCol);
  const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  gr.addColorStop(0, '#6f8798'); gr.addColorStop(0.45, '#2d3b47'); gr.addColorStop(0.5, '#56707f'); gr.addColorStop(1, '#1f2a33');
  g.save(); g.beginPath(); if (o.arch) { g.moveTo(wx + fr, wy + wh); g.lineTo(wx + fr, wy + ww / 2); g.arc(wx + ww / 2, wy + ww / 2, ww / 2 - fr, Math.PI, 0); g.lineTo(wx + ww - fr, wy + wh); } else g.rect(wx + fr, wy + fr, ww - 2 * fr, wh - 2 * fr); g.clip();
  g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  // mullions
  g.fillStyle = frameCol; g.fillRect(wx + ww / 2 - fr / 2, wy, fr, wh); if (!o.small) g.fillRect(wx, wy + wh * 0.38, ww, fr);
  if (o.louvre) { g.fillStyle = 'rgba(230,226,218,0.85)'; for (let k = 0; k < 7; k++) g.fillRect(wx + fr, wy + fr + (k + 0.2) * ((wh - 2 * fr) / 7), ww - 2 * fr, Math.max(1.5, (wh - 2 * fr) / 7 * 0.35)); }
  g.restore();
  // sill
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(wx - fr * 1.5, wy + wh, ww + fr * 3, fr * 1.5);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(wx - fr * 1.5, wy + wh + fr * 1.5, ww + fr * 3, fr * 2);
  if (o.rail) { g.fillStyle = '#2c2c2e'; g.fillRect(wx - ww * 0.15, wy + wh * 0.62, ww * 1.3, fr); for (let k = 0; k <= 8; k++) g.fillRect(wx - ww * 0.15 + k * (ww * 1.3 / 8), wy + wh * 0.62, fr * 0.8, wh * 0.38); }
  // mask: frame fixed, glass emissive (B = window id within the tile so the shader can light windows individually)
  m.fillStyle = FIXED; m.fillRect(wx - fr * 1.5, wy - fr * 2, ww + fr * 3, wh + fr * 5.5);
  glass(m, fx < 0.45 ? GLASS : GLASS_B);
  m.fillStyle = FIXED; m.fillRect(wx + ww / 2 - fr / 2, wy, fr, wh);
}

function door(P: P, fx: number, fy: number, fw: number, fh: number, col = '#4a3b2f') {
  const { g, m, x, y, s } = P;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + fx * s - 2, y + fy * s - 3, fw * s + 4, fh * s + 3);
  g.fillStyle = col; g.fillRect(x + fx * s, y + fy * s, fw * s, fh * s);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + (fx + 0.1) * s, y + (fy + 0.08) * s, fw * s * 0.8, fh * s * 0.5);
  m.fillStyle = FIXED; m.fillRect(x + fx * s - 2, y + fy * s - 3, fw * s + 4, fh * s + 3);
}

const painters: Record<string, (P: P) => void> = {
  window(P) {
    const p = P.p;
    const kind = p.brick ? 'brick' : p.block ? 'block' : p.stone ? 'stone' : p.mud ? 'mud' : 'plaster';
    base(P, kind as any, { lum: p.stone ? 0.86 : 0.84, grime: p.mud ? 0.6 : 0.35 });
    const n = Number(p.win ?? 1);
    const wide = !!p.wide, tall = !!p.tall, small = !!p.small, narrow = !!p.narrow;
    const fw = narrow ? 0.26 : small ? 0.3 : wide ? 0.56 : 0.4;
    const fh = tall ? 0.6 : small ? 0.34 : 0.46;
    const top = tall ? 0.18 : small ? 0.25 : 0.2;
    if (n === 1) window(P, 0.5 - fw / 2, top, fw, fh, { frame: String(p.frame), arch: !!p.arch, louvre: !!p.louvre, rail: !!p.rail, small });
    else { const w1 = Math.min(fw, 0.36); window(P, 0.25 - w1 / 2, top, w1, fh, { frame: String(p.frame), arch: !!p.arch, louvre: !!p.louvre, rail: !!p.rail, small }); window(P, 0.75 - w1 / 2, top, w1, fh, { frame: String(p.frame), arch: !!p.arch, louvre: !!p.louvre, rail: !!p.rail, small }); }
    if (p.stone) { // string course
      P.g.fillStyle = 'rgba(0,0,0,0.12)'; P.g.fillRect(P.x, P.y + P.s * 0.95, P.s, P.s * 0.05);
    }
  },
  plain(P) { base(P, 'plaster', { lum: 0.84, grime: Number(P.p.grime ?? 0.4) }); },
  strip(P) {
    base(P, 'concrete', { lum: 0.82, grime: 0.2 });
    const { g, m, x, y, s } = P;
    // continuous ribbon window across the upper 55 %
    const gy = y + s * 0.12, gh = s * 0.5;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, gy - 4, s, gh + 6);
    const gr = g.createLinearGradient(x, gy, x, gy + gh); gr.addColorStop(0, '#5e7484'); gr.addColorStop(1, '#22303a');
    g.fillStyle = gr; g.fillRect(x, gy, s, gh);
    g.fillStyle = '#2a2a2c'; for (let k = 0; k < 3; k++) g.fillRect(x + (k + 0.5) * (s / 3) - 2, gy, 4, gh);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, gy + gh, s, 4);
    m.fillStyle = GLASS; m.fillRect(x, gy, s, gh); m.fillStyle = FIXED; for (let k = 0; k < 3; k++) m.fillRect(x + (k + 0.5) * (s / 3) - 2, gy, 4, gh); m.fillRect(x, gy - 4, s, 4); m.fillRect(x, gy + gh, s, 6);
  },
  curtain(P) {
    const { g, m, x, y, s, rnd, p } = P;
    const tint = String(p.tint);
    const cols = tint === 'dark' ? ['#1b2228', '#2a3238', '#38444c'] : tint === 'green' ? ['#2f5b55', '#3f7a70', '#6aa39a'] : ['#2e4a63', '#3f6684', '#7fa6c2'];
    g.fillStyle = '#1a1d20'; g.fillRect(x, y, s, s);
    m.fillStyle = FIXED; m.fillRect(x, y, s, s);
    const mull = Math.max(2, s * 0.018);
    for (let i = 0; i < 2; i++) {
      const px = x + i * (s / 2) + mull, pw = s / 2 - 2 * mull;
      // spandrel (lower 30%) darker opaque panel, vision glass above
      const gr = g.createLinearGradient(px, y, px + pw, y + s * 0.7); gr.addColorStop(0, cols[2]); gr.addColorStop(0.5, cols[1]); gr.addColorStop(1, cols[0]);
      g.fillStyle = gr; g.fillRect(px, y + mull, pw, s * 0.68);
      if (rnd() < 0.3) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px, y + mull, pw, s * 0.68); }
      g.fillStyle = tint === 'green' ? '#1f3a36' : '#1f2b35'; g.fillRect(px, y + s * 0.7 + mull, pw, s * 0.3 - 2 * mull);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px, y + s * 0.7 + mull, pw, 3);
      m.fillStyle = rnd() < 0.55 ? (i ? GLASS_B : GLASS) : (i ? GLASS_SOFT_B : GLASS_SOFT); m.fillRect(px, y + mull, pw, s * 0.68);
    }
  },
  corrugated(P) {
    const { g, m, x, y, s, rnd, p } = P;
    base(P, 'metal', { lum: 0.8, grime: p.roof ? 0.1 : 0.4 });
    if (p.rust) { g.fillStyle = 'rgba(120,60,30,0.55)'; for (let k = 0; k < 14; k++) { const rx = x + rnd() * s, ry = y + rnd() * s, rr = 6 + rnd() * 26; g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.5, rnd() * 3, 0, 6.3); g.fill(); } m.fillStyle = 'rgba(0,0,0,0.5)'; m.fillRect(x, y, s, s); }
    if (p.container) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + s * 0.9, s, s * 0.1); g.fillRect(x, y, s, s * 0.06); }
    if (p.roof) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y + s * 0.97, s, s * 0.03); }
  },
  panel(P) {
    const { g, m, x, y, s, p } = P;
    base(P, 'concrete', { lum: 0.86, contrast: 0.03, grime: 0.25 });
    const rows = p.plain ? 2 : 4;
    for (let k = 0; k < rows; k++) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + (k * s) / rows, s, 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y + (k * s) / rows + 2, s, 2); }
    if (p.high) { // strip of translucent panels at the top
      g.fillStyle = '#b8c6cc'; g.fillRect(x + 6, y + 8, s - 12, s * 0.16); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 1; k < 4; k++) g.fillRect(x + (k * s) / 4 - 1, y + 8, 2, s * 0.16);
      m.fillStyle = GLASS_SOFT; m.fillRect(x + 6, y + 8, s - 12, s * 0.16);
    }
  },
  shopfront(P) {
    const { g, m, x, y, s } = P;
    base(P, 'plaster', { lum: 0.84, grime: 0.25 });
    // fascia band
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y, s, s * 0.22);
    // big glazing with door
    const gy = y + s * 0.26, gh = s * 0.72;
    g.fillStyle = '#2b2b2d'; g.fillRect(x + 4, gy - 3, s - 8, gh + 3);
    const gr = g.createLinearGradient(x, gy, x + s, gy + gh); gr.addColorStop(0, '#6b8597'); gr.addColorStop(0.5, '#2a3942'); gr.addColorStop(1, '#4b6472');
    g.fillStyle = gr; g.fillRect(x + 8, gy, s * 0.62, gh);
    // shelves silhouettes
    g.fillStyle = 'rgba(255,230,180,0.25)'; for (let k = 0; k < 3; k++) g.fillRect(x + 14, gy + gh * (0.25 + k * 0.22), s * 0.5, 3);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 8, gy, s * 0.2, gh);
    door(P, 0.74, 0.3, 0.2, 0.68, '#3a4a55');
    g.fillStyle = '#2b2b2d'; g.fillRect(x + s * 0.7, gy, 4, gh);
    m.fillStyle = FIXED; m.fillRect(x + 4, gy - 3, s - 8, gh + 3); m.fillStyle = GLASS; m.fillRect(x + 8, gy, s * 0.62, gh); m.fillRect(x + s * 0.76, gy + s * 0.08, s * 0.16, gh * 0.4);
  },
  shutter(P) {
    const { g, m, x, y, s } = P;
    base(P, 'plaster', { lum: 0.84, grime: 0.4 });
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y, s, s * 0.2);
    const sy = y + s * 0.22, sh = s * 0.78;
    g.fillStyle = '#6f7d81'; g.fillRect(x + 6, sy, s - 12, sh);
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, sy + (k * sh) / 14, s - 12, 2); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, sy + (k * sh) / 14 + 2, s - 12, 2); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, sy - 6, s - 4, 8);
    m.fillStyle = FIXED; m.fillRect(x + 2, sy - 6, s - 4, sh + 6);
  },
  arcade(P) {
    const { g, m, x, y, s } = P;
    base(P, 'plaster', { lum: 0.84, grime: 0.35 });
    const ax = x + s * 0.17, aw = s * 0.66, top = y + s * 0.12;
    g.fillStyle = '#1a1714'; g.beginPath(); g.moveTo(ax, y + s); g.lineTo(ax, top + aw / 2); g.arc(ax + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, y + s); g.closePath(); g.fill();
    // interior hint: lit shop glass further back
    g.fillStyle = '#3b4f5c'; g.fillRect(ax + aw * 0.15, y + s * 0.45, aw * 0.7, s * 0.55);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(ax + aw * 0.15, y + s * 0.45, aw * 0.3, s * 0.55);
    m.fillStyle = FIXED; m.beginPath(); m.moveTo(ax, y + s); m.lineTo(ax, top + aw / 2); m.arc(ax + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); m.lineTo(ax + aw, y + s); m.closePath(); m.fill();
    m.fillStyle = GLASS_SOFT; m.fillRect(ax + aw * 0.15, y + s * 0.45, aw * 0.7, s * 0.55);
  },
  colonnade(P) {
    const { g, m, x, y, s } = P;
    base(P, 'concrete', { lum: 0.85, contrast: 0.04, grime: 0.25 });
    g.fillStyle = '#15171a'; g.fillRect(x + s * 0.2, y + s * 0.08, s * 0.6, s * 0.92);
    g.fillStyle = '#2e3d48'; g.fillRect(x + s * 0.24, y + s * 0.3, s * 0.52, s * 0.7);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + s * 0.24, y + s * 0.3, s * 0.2, s * 0.7);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + s * 0.2 - 4, y, 4, s); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + s * 0.8, y, 4, s);
    m.fillStyle = FIXED; m.fillRect(x + s * 0.2, y + s * 0.08, s * 0.6, s * 0.92); m.fillStyle = GLASS_SOFT; m.fillRect(x + s * 0.24, y + s * 0.3, s * 0.52, s * 0.7);
  },
  lattice(P) {
    const { g, m, x, y, s } = P;
    base(P, 'concrete', { lum: 0.86, contrast: 0.03, grime: 0.2 });
    const n = 6, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = '#1d1f22'; g.beginPath(); g.ellipse(x + (i + 0.5) * c, y + (j + 0.5) * c, c * 0.3, c * 0.3, 0, 0, 6.3); g.fill(); m.fillStyle = FIXED; m.beginPath(); m.ellipse(x + (i + 0.5) * c, y + (j + 0.5) * c, c * 0.3, c * 0.3, 0, 0, 6.3); m.fill(); }
  },
  garage(P) {
    const { g, m, x, y, s } = P;
    base(P, 'concrete', { lum: 0.84, grime: 0.4 });
    g.fillStyle = '#74808a'; g.fillRect(x + s * 0.08, y + s * 0.12, s * 0.84, s * 0.88);
    for (let k = 0; k < 9; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + s * 0.08, y + s * 0.12 + (k * s * 0.88) / 9, s * 0.84, 3); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + s * 0.08, y + s * 0.12 + (k * s * 0.88) / 9 + 3, s * 0.84, 2); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + s * 0.05, y + s * 0.08, s * 0.9, s * 0.05);
    m.fillStyle = FIXED; m.fillRect(x + s * 0.05, y + s * 0.08, s * 0.9, s * 0.92);
  },
  frame(P) {
    const { g, m, x, y, s } = P;
    g.fillStyle = '#2a2b2d'; g.fillRect(x, y, s, s);
    g.fillStyle = '#a9a49c'; g.fillRect(x, y, s * 0.14, s); g.fillRect(x + s * 0.86, y, s * 0.14, s); g.fillRect(x, y, s, s * 0.16);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + s * 0.16, s, 4);
    g.fillStyle = '#6d5a3c'; g.fillRect(x + s * 0.14, y + s * 0.5, s * 0.72, 3); g.fillRect(x + s * 0.3, y + s * 0.5, 3, s * 0.5); // scaffold hint
    m.fillStyle = FIXED; m.fillRect(x, y, s, s);
  },
  none(P) { const { g, m, x, y, s } = P; g.fillStyle = '#9a9a9a'; g.fillRect(x, y, s, s); m.fillStyle = TINT; m.fillRect(x, y, s, s); },
  concrete(P) {
    base(P, P.p.dark ? 'dark' : 'concrete', { lum: P.p.dark ? 0.45 : 0.78, grime: 0.1 });
    if (P.p.stains) {
      const { g, x, y, s, rnd } = P;
      // faint weathering + expansion joints every half tile (3 m on a 6 m tile)
      g.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + rnd() * s, y + rnd() * s, 6 + rnd() * 22, 5 + rnd() * 16, rnd() * 3, 0, 6.3); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + s * 0.5 - 1, s, 2); g.fillRect(x + s * 0.5 - 1, y, 2, s); g.fillRect(x, y, s, 1); g.fillRect(x, y, 1, s);
    }
  },
  gravel(P) { base(P, 'gravel', { lum: 0.72, grime: 0 }); },
  tiles(P) {
    const { g, x, y, s } = P;
    base(P, 'concrete', { lum: 0.8, contrast: 0.04, grime: 0 });
    const rows = 6, cols = 5;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const tx = x + (i + (j % 2 ? 0.5 : 0)) * (s / cols), ty = y + j * (s / rows), tw = s / cols, th = s / rows;
      const gr = g.createLinearGradient(tx, ty, tx + tw, ty); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(tx - tw, ty, tw, th); g.fillRect(tx, ty, tw, th);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(tx - tw, ty + th - 3, tw * 2, 3);
    }
  },
  standing(P) { const { g, x, y, s } = P; base(P, 'concrete', { lum: 0.78, contrast: 0.03, grime: 0 }); for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + (k * s) / 3, y, 3, s); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + (k * s) / 3 + 3, y, 3, s); } },
  asphalt(P) { base(P, 'asphalt', { lum: P.p.old ? 0.5 : 0.42, grime: 0 }); if (P.p.old) { const { g, x, y, s, rnd } = P; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); let px = x + rnd() * s, py = y + rnd() * s; g.moveTo(px, py); for (let q = 0; q < 6; q++) { px += (rnd() - 0.5) * 40; py += (rnd() - 0.5) * 40; g.lineTo(px, py); } g.stroke(); } } },
  paving(P) { base(P, 'paving', { lum: P.p.plaza ? 0.84 : 0.8, grime: 0 }); if (P.p.plaza) { const { g, x, y, s } = P; g.fillStyle = 'rgba(0,0,0,0.1)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(x + (i * s) / 4, y + (j * s) / 4, s / 4, s / 4); } },
  earth(P) { base(P, P.p.sand ? 'sand' : P.p.wet ? 'wet' : 'earth', { lum: P.p.sand ? 0.86 : P.p.wet ? 0.5 : 0.66, grime: 0 }); },
  grass(P) { base(P, P.p.dry ? 'dry' : 'grass', { lum: P.p.pitch ? 0.72 : 0.68, grime: 0 }); if (P.p.pitch) { const { g, x, y, s } = P; g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 4; k += 2) g.fillRect(x, y + (k * s) / 4, s, s / 4); } },
  field(P) { base(P, 'field', { lum: 0.7, grime: 0 }); },
  blockwall(P) { base(P, 'block', { lum: 0.84, grime: 0.5 }); },
  stripes(P) { const { g, m, x, y, s } = P; g.fillStyle = '#f2ece0'; g.fillRect(x, y, s, s); m.fillStyle = TINT; m.fillRect(x, y, s, s); for (let k = 0; k < 4; k += 1) { if (k % 2) continue; g.fillStyle = '#ffffff'; g.fillRect(x + (k * s) / 4, y, s / 4, s); m.fillStyle = FIXED; m.fillRect(x + (k * s) / 4, y, s / 4, s); } },
};

export function buildAtlas(px = 256): Atlas {
  const W = ATLAS_COLS * px, H = ATLAS_ROWS * px;
  const cc = document.createElement('canvas'); cc.width = W; cc.height = H;
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const g = cc.getContext('2d')!, m = mc.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); m.fillStyle = TINT; m.fillRect(0, 0, W, H);
  TILES.forEach((t, i) => {
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    const P: P = { g, m, x: col * px, y: row * px, s: px, rnd: mulberry(1234 + i * 77), p: t.p ?? {} };
    const painter = painters[t.painter] ?? painters.plain;
    g.save(); m.save();
    g.beginPath(); g.rect(P.x, P.y, px, px); g.clip(); m.beginPath(); m.rect(P.x, P.y, px, px); m.clip();
    painter(P);
    g.restore(); m.restore();
  });
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace; color.flipY = false; color.wrapS = color.wrapT = THREE.ClampToEdgeWrapping;
  color.minFilter = THREE.LinearMipmapLinearFilter; color.magFilter = THREE.LinearFilter; color.anisotropy = 4; color.generateMipmaps = true;
  const mask = new THREE.CanvasTexture(mc);
  mask.colorSpace = THREE.NoColorSpace; mask.flipY = false; mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  mask.minFilter = THREE.LinearMipmapLinearFilter; mask.magFilter = THREE.LinearFilter; mask.generateMipmaps = true;
  const tileSize: [number, number] = [1 / ATLAS_COLS, 1 / ATLAS_ROWS];
  return {
    color, mask, tileSize, px,
    tileOrigin: (name: string) => { const i = TILE_INDEX[name] ?? TILE_INDEX['plaster-plain']; return [(i % ATLAS_COLS) / ATLAS_COLS, Math.floor(i / ATLAS_COLS) / ATLAS_ROWS]; },
    tileDef: (name: string) => TILES[TILE_INDEX[name] ?? TILE_INDEX['plaster-plain']],
  };
}

/** small repeating detail texture for the terrain */
export function buildDetailTexture(size = 256): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry(99);
  const n = noiseTile(size, rnd, 8, 4);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = 0.78 + (n[i] - 0.5) * 0.5 + (rnd() - 0.5) * 0.12; const b = Math.max(0, Math.min(255, v * 255)); img.data[i * 4] = b; img.data[i * 4 + 1] = b; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
}
