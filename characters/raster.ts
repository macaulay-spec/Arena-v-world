/**
 * Tiny software rasteriser for painting textures in UV space + PNG encoder.  Pixel storage is
 * float RGBA; alpha doubles as "painted" coverage so islands can be dilated to avoid mip seams.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export class Canvas {
  data: Float32Array;
  constructor(public w: number, public h: number) { this.data = new Float32Array(w * h * 4); }
  fill(c: RGBA): void { for (let i = 0; i < this.w * this.h; i++) this.data.set(c, i * 4); }
  set(x: number, y: number, c: RGB | RGBA): void { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c.length > 3 ? (c as RGBA)[3] : 1; }
  get(x: number, y: number): RGBA { x = Math.max(0, Math.min(this.w - 1, x)); y = Math.max(0, Math.min(this.h - 1, y)); const i = (y * this.w + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]; }
  /** blend colour c with alpha a over pixel */
  blend(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return; const i = (y * this.w + x) * 4;
    this.data[i] += (c[0] - this.data[i]) * a; this.data[i + 1] += (c[1] - this.data[i + 1]) * a; this.data[i + 2] += (c[2] - this.data[i + 2]) * a; this.data[i + 3] = Math.max(this.data[i + 3], a);
  }
  /** multiply pixel by factor */
  mul(x: number, y: number, f: number | RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4;
    if (typeof f === 'number') { this.data[i] *= f; this.data[i + 1] *= f; this.data[i + 2] *= f; } else { this.data[i] *= f[0]; this.data[i + 1] *= f[1]; this.data[i + 2] *= f[2]; }
  }

  /**
   * Rasterise a UV triangle. `shade(b0,b1,b2,x,y)` returns a colour (+alpha) or null to skip.
   * Coverage is conservative by ~0.6 px so neighbouring islands never leave cracks.
   */
  tri(u0: number, v0: number, u1: number, v1: number, u2: number, v2: number, shade: (b0: number, b1: number, b2: number, x: number, y: number) => RGBA | RGB | null): void {
    const x0 = u0 * this.w, y0 = v0 * this.h, x1 = u1 * this.w, y1 = v1 * this.h, x2 = u2 * this.w, y2 = v2 * this.h;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1), maxX = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1), maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) return;
    const inv = 1 / area;
    // edge lengths for the conservative margin (in barycentric units)
    const l0 = Math.hypot(x2 - x1, y2 - y1), l1 = Math.hypot(x0 - x2, y0 - y2), l2 = Math.hypot(x1 - x0, y1 - y0);
    const m = 0.7; const e0 = -m * l0 * inv, e1 = -m * l1 * inv, e2 = -m * l2 * inv;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        let b0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        let b1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        let b2 = 1 - b0 - b1;
        if (b0 < -Math.abs(e0) || b1 < -Math.abs(e1) || b2 < -Math.abs(e2)) continue;
        // clamp for interpolation
        const c0 = Math.max(0, b0), c1 = Math.max(0, b1), c2 = Math.max(0, b2); const cs = c0 + c1 + c2 || 1;
        const col = shade(c0 / cs, c1 / cs, c2 / cs, x, y); if (!col) continue;
        const inside = b0 >= 0 && b1 >= 0 && b2 >= 0;
        const i = (y * this.w + x) * 4;
        if (inside || this.data[i + 3] <= 0) { this.data[i] = col[0]; this.data[i + 1] = col[1]; this.data[i + 2] = col[2]; this.data[i + 3] = inside ? 1 : Math.max(this.data[i + 3], 0.5); }
      }
    }
  }

  /** Grow painted pixels into unpainted ones (fills gutters so mipmaps don't bleed background). */
  dilate(passes: number): void {
    for (let p = 0; p < passes; p++) {
      const src = Float32Array.from(this.data);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4; if (src[i + 3] > 0) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
          const j = (yy * this.w + xx) * 4; if (src[j + 3] > 0) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; }
        }
        if (n) { this.data[i] = r / n; this.data[i + 1] = g / n; this.data[i + 2] = b / n; this.data[i + 3] = 1; }
      }
    }
  }

  /** Simple box blur (radius in px) on RGB — used for soft masks. */
  blur(radius: number): void {
    if (radius < 1) return;
    const w = this.w, h = this.h; const tmp = new Float32Array(this.data.length);
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < h; y++) { let acc = 0; for (let x = -radius; x <= radius; x++) acc += this.data[(y * w + Math.max(0, Math.min(w - 1, x))) * 4 + c]; for (let x = 0; x < w; x++) { tmp[(y * w + x) * 4 + c] = acc / (2 * radius + 1); acc += this.data[(y * w + Math.min(w - 1, x + radius + 1)) * 4 + c] - this.data[(y * w + Math.max(0, x - radius)) * 4 + c]; } }
      for (let x = 0; x < w; x++) { let acc = 0; for (let y = -radius; y <= radius; y++) acc += tmp[(Math.max(0, Math.min(h - 1, y)) * w + x) * 4 + c]; for (let y = 0; y < h; y++) { this.data[(y * w + x) * 4 + c] = acc / (2 * radius + 1); acc += tmp[(Math.min(h - 1, y + radius + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - radius) * w + x) * 4 + c]; } }
    }
  }

  /** convert linear multipliers to sRGB-encoded values in place (what glTF baseColorTexture expects) */
  encodeSRGB(): void { const d = this.data; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) { const v = Math.max(0, d[i + k]); d[i + k] = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; } }
  /** draw a thick line in uv space */
  line(u0: number, v0: number, u1: number, v1: number, widthPx: number, c: RGB, alpha = 1): void {
    const x0 = u0 * this.w, y0 = v0 * this.h, x1 = u1 * this.w, y1 = v1 * this.h; const len = Math.hypot(x1 - x0, y1 - y0); const steps = Math.ceil(len * 2) + 1; const r = widthPx / 2;
    for (let s = 0; s <= steps; s++) { const t = s / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r + 0.5) this.blend(x, y, c, alpha * Math.min(1, r + 0.5 - d)); } }
  }
  /** filled disc in uv space (radius in px) */
  disc(u: number, v: number, radiusPx: number, c: RGB, alpha = 1, soft = 0.5): void {
    const cx = u * this.w, cy = v * this.h;
    for (let y = Math.floor(cy - radiusPx); y <= Math.ceil(cy + radiusPx); y++) for (let x = Math.floor(cx - radiusPx); x <= Math.ceil(cx + radiusPx); x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radiusPx; if (d <= 1) this.blend(x, y, c, alpha * Math.min(1, (1 - d) / Math.max(1e-3, soft))); }
  }
  toPNG(alpha = false): Buffer {
    const bpp = alpha ? 4 : 3; const row = this.w * bpp + 1; const raw = Buffer.alloc(row * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * row] = 0;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4, o = y * row + 1 + x * bpp;
        raw[o] = clamp8(this.data[i]); raw[o + 1] = clamp8(this.data[i + 1]); raw[o + 2] = clamp8(this.data[i + 2]); if (alpha) raw[o + 3] = clamp8(this.data[i + 3]);
      }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
  save(path: string, alpha = false): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, this.toPNG(alpha)); }
}

function clamp8(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))); }
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
function crc32(buf: Buffer): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0); return Buffer.concat([len, td, crc]);
}

/** value noise helpers for texture detail */
export function hash2(x: number, y: number): number { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x: number, y: number, oct = 4): number { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function hex(h: string): RGB { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
export function scale(c: RGB, f: number): RGB { return [c[0] * f, c[1] * f, c[2] * f]; }
