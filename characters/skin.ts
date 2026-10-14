/**
 * Skin painter: produces *multiplier* textures in MakeHuman UV space (final colour = skin tone ×
 * texture), so a handful of shared textures serve every skin tone.  Features are derived from
 * morph-target supports (lips, brows, eye bags, lid folds, nipples, navel, laugh lines) and from
 * geometry (eyelid margins = eye-hole rims, palms/soles/nails from normals, knuckles/elbows from joints).
 */
import { Canvas, fbm, mix, type RGB } from './raster';
import { base, targetMask } from './body';
import { BONE_INDEX, type Rig } from './rig';
import type { MhFace } from './mh/load';

export interface SkinVariant { name: string; sex: 'f' | 'm'; age: 'child' | 'young' | 'old'; beard?: 'none' | 'stubble' | 'full' | 'goatee'; browWeight?: number }

export const SKIN_VARIANTS: SkinVariant[] = [
  { name: 'skin_f_young', sex: 'f', age: 'young' },
  { name: 'skin_f_old', sex: 'f', age: 'old' },
  { name: 'skin_m_young', sex: 'm', age: 'young', beard: 'none' },
  { name: 'skin_m_stubble', sex: 'm', age: 'young', beard: 'stubble' },
  { name: 'skin_m_beard', sex: 'm', age: 'young', beard: 'full' },
  { name: 'skin_m_goatee', sex: 'm', age: 'young', beard: 'goatee' },
  { name: 'skin_m_old', sex: 'm', age: 'old', beard: 'stubble' },
  { name: 'skin_child', sex: 'f', age: 'child', browWeight: 0.7 },
];

interface Masks { lipU: Float32Array; lipL: Float32Array; brow: Float32Array; bag: Float32Array; fold: Float32Array; laugh: Float32Array; areola: Float32Array; navel: Float32Array; palm: Float32Array; sole: Float32Array; nail: Float32Array; joint: Float32Array; beard: Float32Array; mouthIn: Float32Array; cheek: Float32Array; mouthY: number }

/** Per-vertex feature masks for a rig (bind pose positions). */
export function skinMasks(rig: Rig): Masks {
  const b = base(); const n = b.nVerts; const P = rig.pos;
  const nrm = bodyNormals(rig);
  const lipU = targetMask(['mouth/mouth-upperlip-volume-incr'], 1.2), lipL = targetMask(['mouth/mouth-lowerlip-volume-incr'], 1.2);
  const brow = targetMask(['eyebrows/eyebrows-trans-up'], 0.8);
  const bag = targetMask(['eyes/l-eye-bag-incr', 'eyes/r-eye-bag-incr'], 0.8);
  const fold = targetMask(['eyes/l-eye-eyefold-up', 'eyes/r-eye-eyefold-up'], 0.8);
  const laugh = targetMask(['mouth/mouth-laugh-lines-out'], 1.0);
  const areola = targetMask(['breast/breast-point-incr'], 1.5);
  const navel = targetMask(['stomach/stomach-navel-in'], 1.5);
  const cheek = targetMask(['cheek/l-cheek-bones-incr', 'cheek/r-cheek-bones-incr'], 0.7);
  const palm = new Float32Array(n), sole = new Float32Array(n), nail = new Float32Array(n), joint = new Float32Array(n), beard = new Float32Array(n), mouthIn = new Float32Array(n);
  const H = (name: string) => { const i = BONE_INDEX.get(name)!; return [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]] as const; };
  const handBones = new Set<number>();
  for (const s of ['Left', 'Right']) { handBones.add(BONE_INDEX.get(`${s}Hand`)!); for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) handBones.add(BONE_INDEX.get(`${s}Hand${f}${k}`)!); }
  const tips: (readonly [number, number, number])[] = []; for (const s of ['Left', 'Right']) for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) tips.push(H(`${s}Hand${f}4`));
  const jointsDark: { p: readonly [number, number, number]; r: number }[] = [];
  for (const s of ['Left', 'Right']) { jointsDark.push({ p: H(`${s}ForeArm`), r: 0.055 }, { p: H(`${s}Leg`), r: 0.07 }); for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) jointsDark.push({ p: H(`${s}Hand${f}1`), r: 0.012 }, { p: H(`${s}Hand${f}2`), r: 0.008 }); }
  // mouth centre from lip masks
  let my = 0, mz = 0, mw = 0; for (let i = 0; i < n; i++) { const w = lipU[i] + lipL[i]; if (w > 0.3) { my += P[i * 3 + 1] * w; mz += P[i * 3 + 2] * w; mw += w; } }
  my /= mw || 1; mz /= mw || 1;
  const neck = H('Neck'), head = H('Head'), jaw = H('Jaw');
  const bodyVerts = new Set<number>(); for (const f of b.byGroup.get('body')!) for (const v of f.v) bodyVerts.add(v);
  for (const i of bodyVerts) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const j0 = rig.joints[i * 4]; const isHand = handBones.has(j0);
    if (isHand) { palm[i] = Math.max(0, Math.min(1, (-ny - 0.15) * 2.2)); for (const t of tips) { const d = Math.hypot(x - t[0], y - t[1], z - t[2]); if (d < 0.013 && ny > 0.35) nail[i] = Math.max(nail[i], 1 - d / 0.013); } }
    if (y < 0.035 && ny < -0.5) sole[i] = Math.min(1, (-ny - 0.5) * 2.5);
    for (const jd of jointsDark) { const d = Math.hypot(x - jd.p[0], y - jd.p[1], z - jd.p[2]); if (d < jd.r) joint[i] = Math.max(joint[i], 1 - d / jd.r); }
    // beard zone, defined relative to the mouth: chin/jaw/cheeks down to 8.5 cm below the lips,
    // moustache strip under the nose, nothing on the ears, neck or lips
    const dy = y - my;
    if (dy > -0.085 && dy < 0.03 && z > head[2] - 0.02 && nz > -0.15) {
      let w = 1;
      if (dy > 0.004) w = (Math.abs(x) < 0.032 && z > mz - 0.025) ? Math.min(1, (0.03 - dy) / 0.012) : 0; // moustache
      if (Math.abs(x) > 0.035 && dy > 0.018) w = 0;                                                  // cheek line
      w *= 1 - Math.max(lipU[i], lipL[i]);
      w *= Math.min(1, (dy + 0.085) / 0.02);                                                         // fade at the throat
      w *= Math.min(1, (z - (head[2] - 0.02)) / 0.03);                                               // fade towards the ears
      beard[i] = Math.max(0, w);
    }
    // inner mouth: close to the mouth centre, well behind the lip surface or facing inwards
    // inner mouth: inside an ellipsoid behind the lips (never the outer cheeks)
    const ex2 = (x / 0.032) ** 2 + ((y - my + 0.002) / 0.016) ** 2 + ((z - (mz - 0.03)) / 0.034) ** 2;
    if (ex2 < 1 && z < mz - 0.006) mouthIn[i] = 1;
  }
  return { lipU, lipL, brow, bag, fold, laugh, areola, navel, palm, sole, nail, joint, beard, mouthIn, cheek, mouthY: my };
}

function bodyNormals(rig: Rig): Float32Array {
  const b = base(); const n = new Float32Array(b.nVerts * 3); const P = rig.pos;
  for (const f of b.byGroup.get('body')!) {
    const v = f.v; let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) { const a = v[i] * 3, c = v[(i + 1) % v.length] * 3; nx += (P[a + 1] - P[c + 1]) * (P[a + 2] + P[c + 2]); ny += (P[a + 2] - P[c + 2]) * (P[a] + P[c]); nz += (P[a] - P[c]) * (P[a + 1] + P[c + 1]); }
    for (const vi of v) { n[vi * 3] += nx; n[vi * 3 + 1] += ny; n[vi * 3 + 2] += nz; }
  }
  for (let i = 0; i < b.nVerts; i++) { const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1; n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l; }
  return n;
}

/** Eyelid margins: body edges whose ends both hug the eyeball sphere on its front hemisphere. */
function eyeRims(rig: Rig): { a: number; b: number; upper: boolean; ta: number; tb: number }[] {
  const b = base(); const faces = b.byGroup.get('body')!; const P = rig.pos;
  const eyes = [BONE_INDEX.get('LeftEye')!, BONE_INDEX.get('RightEye')!].map(i => [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]]);
  const near = (v: number): number => { // index of the eye this vertex hugs, or −1
    for (let k = 0; k < 2; k++) { const e = eyes[k]; const d = Math.hypot(P[v * 3] - e[0], P[v * 3 + 1] - e[1], P[v * 3 + 2] - e[2]); if (d < 0.0162 && P[v * 3 + 2] > e[2] + 0.002) return k; }
    return -1;
  };
  const seen = new Set<string>(); const out: { a: number; b: number; upper: boolean; ta: number; tb: number }[] = [];
  for (const f of faces) for (let i = 0; i < f.v.length; i++) {
    const a = f.v[i], c = f.v[(i + 1) % f.v.length]; const key = a < c ? `${a}_${c}` : `${c}_${a}`; if (seen.has(key)) continue; seen.add(key);
    const ka = near(a); if (ka < 0 || near(c) !== ka) continue;
    const my = (P[a * 3 + 1] + P[c * 3 + 1]) / 2;
    out.push({ a, b: c, upper: my > eyes[ka][1] - 0.001, ta: f.t[i], tb: f.t[(i + 1) % f.v.length] });
  }
  return out;
}

export interface SkinPaintResult { canvas: Canvas }

/** Paint one skin variant (1024² by default). */
export function paintSkin(rig: Rig, masks: Masks, variant: SkinVariant, size = 1024): Canvas {
  const b = base(); const faces: MhFace[] = b.byGroup.get('body')!; const P = rig.pos;
  const c = new Canvas(size, size);
  const old = variant.age === 'old', child = variant.age === 'child', male = variant.sex === 'm';
  const browCol: RGB = [0.16, 0.12, 0.10]; const lipColF: RGB = [0.80, 0.52, 0.52], lipColM: RGB = [0.86, 0.70, 0.68];
  const palmCol: RGB = [1.30, 1.16, 1.08]; const nailCol: RGB = [1.22, 1.10, 1.06]; const mouthCol: RGB = [0.42, 0.14, 0.14];
  const beardStrength = variant.beard === 'full' ? 0.42 : variant.beard === 'stubble' ? 0.78 : variant.beard === 'goatee' ? 0.45 : 1;
  const browW = variant.browWeight ?? (male ? 1.1 : 0.9);
  const eyeL = BONE_INDEX.get('LeftEye')!, eyeR = BONE_INDEX.get('RightEye')!;
  const eyes = [eyeL, eyeR].map(i => [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]]);
  const eyeDist = Math.abs(eyes[0][0] - eyes[1][0]);
  const attr = (vi: number): number[] => [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2], masks.lipU[vi], masks.lipL[vi], masks.brow[vi], masks.bag[vi], masks.fold[vi], masks.laugh[vi], masks.areola[vi], masks.navel[vi], masks.palm[vi], masks.sole[vi], masks.nail[vi], masks.joint[vi], masks.beard[vi], masks.mouthIn[vi], masks.cheek[vi]];
  for (const f of faces) {
    const A = f.v.map(attr); const uv = f.t.map(t => [b.uv[t * 2], b.uv[t * 2 + 1]]);
    for (let k = 1; k + 1 < f.v.length; k++) {
      const a0 = A[0], a1 = A[k], a2 = A[k + 1];
      c.tri(uv[0][0], uv[0][1], uv[k][0], uv[k][1], uv[k + 1][0], uv[k + 1][1], (b0, b1, b2, px, py) => {
        const g = (i: number) => a0[i] * b0 + a1[i] * b1 + a2[i] * b2;
        const x = g(0), y = g(1), z = g(2);
        // base: subtle mottling + large-scale warmth variation
        const n1 = fbm(px * 0.11, py * 0.11, 3), n2 = fbm(px * 0.023 + 7, py * 0.023 + 3, 2);
        let r = 1 + (n1 - 0.5) * (old ? 0.14 : 0.08) + (n2 - 0.5) * 0.06, gg = r, bb = r;
        gg -= (n2 - 0.5) * 0.03; bb -= (n2 - 0.5) * 0.05;
        let col: RGB = [r, gg, bb];
        // cheeks: a touch of warmth
        const ch = g(17); col = mix(col, [col[0] * 1.03, col[1] * 0.97, col[2] * 0.96], ch * 0.6);
        // lips
        const lu = Math.pow(g(3), 1.3), ll = Math.pow(g(4), 1.3); const lip = Math.min(1, lu + ll);
        const lipCol = male ? lipColM : lipColF;
        col = mix(col, [lipCol[0] * (ll > lu ? 1.0 : 0.92), lipCol[1] * (ll > lu ? 1.0 : 0.9), lipCol[2] * (ll > lu ? 1.0 : 0.9)], lip * (old ? 0.75 : 0.9));
        // brows: drawn geometrically relative to the eye centre (the mask only guards the region)
        if (g(5) > 0.03) {
          const ex = x > 0 ? eyes[0] : eyes[1]; const t = (Math.abs(x) - Math.abs(ex[0])) / (eyeDist * 0.9); // −0.5 inner … +0.95 outer
          const profile = t < -0.38 ? 0 : t > 0.82 ? 0 : (t < -0.15 ? (t + 0.38) / 0.23 : t > 0.55 ? (0.82 - t) / 0.27 : 1);
          const archY = ex[1] + 0.033 + 0.009 * Math.sin(Math.max(0, Math.min(1, (t + 0.38) / 1.2)) * Math.PI);
          const thick = 0.0055 * browW * (1 - 0.45 * Math.max(0, t)) * (child ? 0.8 : 1);
          const band = Math.max(0, 1 - Math.pow(Math.abs(y - archY) / thick, 1.5));
          const hairNoise = 0.7 + 0.6 * fbm(px * 0.9, py * 0.25, 2);
          col = mix(col, browCol, Math.min(1, profile * band * hairNoise * 1.2));
        }
        // eye bags / lid folds / laugh lines
        col = mix(col, [col[0] * 0.84, col[1] * 0.82, col[2] * 0.84], g(6) * (old ? 0.75 : 0.35));
        col = mix(col, [col[0] * 0.9, col[1] * 0.88, col[2] * 0.9], g(7) * 0.5);
        if (old) col = mix(col, [col[0] * 0.86, col[1] * 0.85, col[2] * 0.86], g(8) * 0.7);
        // areola, navel
        col = mix(col, [col[0] * 0.78, col[1] * 0.66, col[2] * 0.64], Math.pow(g(9), 1.5) * 0.9);
        col = mix(col, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], g(10) * 0.8);
        // palms, soles, nails, joints
        const pl = Math.max(g(11), g(12)); col = mix(col, [col[0] * palmCol[0], col[1] * palmCol[1], col[2] * palmCol[2]], pl);
        col = mix(col, [col[0] * nailCol[0], col[1] * nailCol[1], col[2] * nailCol[2]], g(13));
        col = mix(col, [col[0] * 0.9, col[1] * 0.9, col[2] * 0.91], g(14) * 0.8);
        // beard
        if (male && variant.beard && variant.beard !== 'none') {
          let bw = g(15);
          if (variant.beard === 'goatee') bw *= Math.abs(x) < 0.03 ? 1 : 0;
          const bn = 0.7 + 0.6 * fbm(px * 0.7, py * 0.7, 2);
          col = mix(col, [col[0] * beardStrength * 0.95, col[1] * beardStrength * 0.9, col[2] * beardStrength * 0.9], Math.min(1, bw * bn));
        }
        // inner mouth
        if (g(16) > 0.5) col = mouthCol;
        return [col[0], col[1], col[2], 1];
      });
    }
  }
  // eyelid margins: dark lash line along the eye-hole rims (upper thicker, with a soft shadow)
  for (const e of eyeRims(rig)) {
    const u0 = b.uv[e.ta * 2], v0 = b.uv[e.ta * 2 + 1], u1 = b.uv[e.tb * 2], v1 = b.uv[e.tb * 2 + 1];
    if (Math.hypot(u1 - u0, v1 - v0) > 0.05) continue;
    const px = size / 1024;
    c.line(u0, v0, u1, v1, (e.upper ? 3.5 : 2.2) * px, [0.6, 0.55, 0.55], 0.45);
    c.line(u0, v0, u1, v1, (e.upper ? 1.8 : 1.1) * px, [0.12, 0.09, 0.09], e.upper ? 0.95 : 0.6);
  }
  c.dilate(6);
  c.encodeSRGB();
  return c;
}
