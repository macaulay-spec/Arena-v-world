/** Small shared textures: eyes, hair, mouth. Fabric prints live in fabrics.ts. */
import { Canvas, fbm, mix, hash2, type RGB } from './raster';

/** Polar eyeball texture: u = angle around the gaze axis, v = 0 at the pupil centre … 1 at the back. */
export function paintEye(iris: RGB, size = 256): Canvas {
  const c = new Canvas(size, size);
  const sclera: RGB = [0.93, 0.9, 0.88]; const limbal: RGB = [0.06, 0.04, 0.03];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = (y + 0.5) / size, u = (x + 0.5) / size; // v ~ polar angle / π
    const ang = v * 180;
    let col: RGB;
    if (ang < 9) col = [0.01, 0.01, 0.01];
    else if (ang < 31) {
      const t = (ang - 9) / 22; // 0 pupil edge … 1 limbus
      const fibre = fbm(u * 60, v * 400, 3); const spokes = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 48 + fbm(u * 10, v * 20, 2) * 6);
      let base = mix([iris[0] * 1.25, iris[1] * 1.2, iris[2] * 1.1], iris, t);
      base = mix(base, [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55], (fibre - 0.5) * 0.9 + spokes * 0.25);
      // pupil edge dark ring and the dark limbal ring
      base = mix(base, [0.02, 0.015, 0.01], Math.max(0, 1 - (ang - 9) / 2.5) * 0.7);
      col = mix(base, limbal, Math.max(0, (t - 0.8) / 0.2) * 0.9);
    } else if (ang < 34) col = mix(limbal, sclera, (ang - 31) / 3);
    else {
      const veins = Math.max(0, fbm(u * 24, v * 120, 3) - 0.62) * 3;
      const warm = Math.max(0, (ang - 60) / 120);
      col = mix(sclera, [0.9, 0.7, 0.7], Math.min(1, veins * 0.6 + warm * 0.5));
    }
    c.set(x, y, [col[0], col[1], col[2], 1]);
  }
  c.encodeSRGB(); return c;
}

/** Hair strand texture (tileable): used with a vertex colour / baseColor tint for the hair colour. */
export function paintHair(size = 256): Canvas {
  const c = new Canvas(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    // vertical strands with slight waviness
    const s = fbm(u * 90 + Math.sin(v * 12) * 0.6, v * 6, 3);
    const k = fbm(u * 30, v * 30, 2);
    const l = 0.55 + 0.6 * s + 0.25 * (k - 0.5);
    c.set(x, y, [l, l * 0.97, l * 0.95, 1]);
  }
  c.encodeSRGB(); return c;
}

/** Tight coils (afro / short natural hair): isotropic curly speckle. */
export function paintCoils(size = 256): Canvas {
  const c = new Canvas(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const a = fbm(u * 40, v * 40, 4), b = fbm(u * 120 + 3, v * 120 + 9, 2);
    const l = 0.5 + 0.7 * (a - 0.5) + 0.35 * (b - 0.5) + 0.5;
    c.set(x, y, [l, l * 0.98, l * 0.96, 1]);
  }
  c.encodeSRGB(); return c;
}

/** Plain neutral 'detail' texture for mouth/teeth/props: faint noise so flat colours do not look CG. */
export function paintPlain(size = 64, amp = 0.05): Canvas {
  const c = new Canvas(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const l = 1 + (hash2(x, y) - 0.5) * amp; c.set(x, y, [l, l, l, 1]); }
  c.encodeSRGB(); return c;
}
