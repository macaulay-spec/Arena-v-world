/**
 * Hair and headwear, cut from MakeHuman's helper-hair cap (and the tights shell for drapes).
 * Hair colour lives in COLOR_0 (linear) so a style can fade into the skin tone; the material's
 * texture is a neutral detail map (coils / braids / twists).
 */
import { BONE_INDEX, type Rig } from './rig';
import type { Part } from './mesh';
import { clip, concavity, displace, fromGroup, offset, recomputeNormals, rims, toPart, type SoftMesh, type SoftVert } from './softmesh';
import { FABRICS, FABRIC_PNG, linear } from './fabrics';
import type { GarmentMaterial, Look } from './garments';

export type HairStyle = 'none' | 'low_cut' | 'coils' | 'coils_fade' | 'afro' | 'afro_big' | 'braids' | 'twists' | 'bun' | 'cornrows' | 'grey_short';
export type HeadwearStyle = 'none' | 'gele' | 'fila' | 'hijab' | 'scarf' | 'cap' | 'hardhat' | 'beret';

export interface HeadFrame { eyeY: number; topY: number; headY: number; headZ: number; neckY: number; neckZ: number; earX: number; chinY: number }
export function headFrame(rig: Rig): HeadFrame {
  const h = (n: string) => { const i = BONE_INDEX.get(n)!; return [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]]; };
  const eye = h('LeftEye'), top = h('HeadTop_End'), head = h('Head'), neck = h('Neck'), jaw = h('Jaw');
  return { eyeY: eye[1], topY: top[1], headY: head[1], headZ: head[2], neckY: neck[1], neckZ: neck[2], earX: 0.074, chinY: jaw[1] - 0.06 };
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** azimuth around the head axis: 0 = front, 1 = back */
function azimuth(hf: HeadFrame, v: SoftVert): number { return Math.abs(Math.atan2(v.p[0], v.p[2] - hf.headZ)) / Math.PI; }

/** hairline height as a function of azimuth (front / side / nape) */
function hairline(hf: HeadFrame, a: number, o: { front: number; side: number; back: number }): number {
  const f = hf.eyeY + o.front, s = hf.eyeY + o.side, b = hf.headY + o.back;
  return a < 0.5 ? f + (s - f) * smooth(0, 1, a / 0.5) : s + (b - s) * smooth(0, 1, (a - 0.5) / 0.5);
}

function scalpField(hf: HeadFrame, o: { front: number; side: number; back: number; ears?: boolean }) {
  return (v: SoftVert) => {
    const a = azimuth(hf, v); let f = hairline(hf, a, o) - v.p[1];
    if (o.ears !== false) { // ear exclusion ellipsoid (both sides)
      const dx = (Math.abs(v.p[0]) - hf.earX) / 0.03, dy = (v.p[1] - (hf.eyeY - 0.008)) / 0.04, dz = (v.p[2] - 0.03) / 0.035;
      f = Math.max(f, 1 - (dx * dx + dy * dy + dz * dz));
    }
    return f;
  };
}

/** Scalp cap taken from the body's own head surface (smooth, exact fit), clipped at the hairline. */
function capMesh(rig: Rig, hf: HeadFrame, o: { front: number; side: number; back: number; ears?: boolean; keepBackTo?: number }): SoftMesh {
  const lo = hf.eyeY - 0.08;
  let m = fromGroup(rig, 'body', vs => vs.every(v => rig.pos[v * 3 + 1] > lo));
  const headBone = BONE_INDEX.get('Head')!;
  for (const v of m.v) { v.j = [headBone, 0, 0, 0]; v.w = [1, 0, 0, 0]; }
  m = clip(m, scalpField(hf, o));
  if (o.keepBackTo !== undefined) {
    // hanging hair at the back: extrude the back part of the hairline downwards in two stages
    const back = (v: SoftVert) => azimuth(hf, v) > 0.55 && v.p[1] < hf.headY + 0.06;
    const drop = hf.headY - 0.02 - o.keepBackTo;
    rims(m, v => { const dx = v.p[0], dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * 0.02, -drop * 0.45, (dz / l) * 0.03]; }, back);
    rims(m, v => { const dx = v.p[0], dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * 0.015, -drop * 0.55, (dz / l) * 0.02]; }, v => v.p[1] < hf.headY - 0.03 && azimuth(hf, v) > 0.5);
    recomputeNormals(m);
  }
  return m;
}

function hairUV(v: SoftVert): [number, number] { const a = Math.atan2(v.p[0], v.p[2]) / Math.PI; return [a * 3 + 0.5, -v.p[1] * 6]; }

export interface HairResult { parts: Part[]; materials: GarmentMaterial[] }

export function buildHair(rig: Rig, style: HairStyle, colourHex: string, skinHex: string, seed = 0): HairResult {
  if (style === 'none') return { parts: [], materials: [] };
  const hf = headFrame(rig);
  const col = linear(colourHex), skin = linear(skinHex);
  const matName = (tex: string) => `hair_${tex}`;
  const mat = (tex: string): GarmentMaterial => ({ name: matName(tex), texture: `textures/${tex}.png`, baseColor: [1, 1, 1, 1], roughness: 0.78, doubleSided: true });
  const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  let m: SoftMesh; let tex = 'coils'; let fade = 0; let thick = 0.008;
  switch (style) {
    case 'low_cut': m = capMesh(rig, hf, { front: 0.055, side: -0.002, back: -0.02 }); thick = 0.003; fade = 0.012; break;
    case 'grey_short': m = capMesh(rig, hf, { front: 0.065, side: 0.0, back: -0.015 }); thick = 0.005; fade = 0.01; break;
    case 'coils': m = capMesh(rig, hf, { front: 0.055, side: -0.002, back: -0.02 }); thick = 0.011; break;
    case 'coils_fade': m = capMesh(rig, hf, { front: 0.055, side: -0.005, back: -0.025 }); thick = 0.012; fade = 0.03; break;
    case 'afro': m = capMesh(rig, hf, { front: 0.052, side: -0.002, back: -0.02 }); thick = 0.035; break;
    case 'afro_big': m = capMesh(rig, hf, { front: 0.05, side: -0.002, back: -0.02 }); thick = 0.055; break;
    case 'twists': m = capMesh(rig, hf, { front: 0.052, side: -0.002, back: -0.02, keepBackTo: hf.neckY - 0.02 }); thick = 0.016; tex = 'twists'; break;
    case 'braids': m = capMesh(rig, hf, { front: 0.05, side: -0.002, back: -0.02, keepBackTo: hf.neckY - 0.2 }); thick = 0.012; tex = 'braids'; break;
    case 'cornrows': m = capMesh(rig, hf, { front: 0.052, side: -0.002, back: -0.02 }); thick = 0.007; tex = 'braids'; break;
    case 'bun': m = capMesh(rig, hf, { front: 0.052, side: -0.002, back: -0.02 }); thick = 0.007; tex = 'braids'; break;
    default: m = capMesh(rig, hf, { front: 0.055, side: -0.002, back: -0.02 });
  }
  // volume: afros are rounder on top, everything gets a little organic noise
  const top = hf.topY;
  const boundaryY = (v: SoftVert) => hairline(hf, azimuth(hf, v), { front: 0.055, side: -0.002, back: -0.02 });
  const afro = style.startsWith('afro');
  offset(m, v => {
    const t = smooth(hf.eyeY, top, v.p[1]); const round = afro ? 0.6 + 0.6 * t : 1;
    const taper = afro ? 1 : 0.3 + 0.7 * smooth(0, 0.02, v.p[1] - boundaryY(v)); // flush with the skin at the hairline
    const noise = afro ? (r(Math.round(v.p[0] * 120) * 7 + Math.round(v.p[1] * 120)) - 0.5) * thick * 0.2 : 0;
    return thick * round * taper + noise;
  });
  recomputeNormals(m);
  // soft bottom rim so the cap has thickness at the hairline
  rims(m, v => [-v.n[0] * thick * 0.9, -v.n[1] * thick * 0.9, -v.n[2] * thick * 0.9]);
  const conc = concavity(m);
  const parts: Part[] = [toPart(m, `hair_${style}`, matName(tex), hairUV, (v, i) => {
    const f = fade ? (1 - smooth(0, fade, v.p[1] - boundaryY(v))) * (0.35 + 0.65 * smooth(0.15, 0.4, azimuth(hf, v))) : 0; // fade at the sides/back, light at the front
    const ao = 1 - 0.35 * conc[i];
    return [ (col[0] + (skin[0] - col[0]) * f) * ao, (col[1] + (skin[1] - col[1]) * f) * ao, (col[2] + (skin[2] - col[2]) * f) * ao ];
  })];
  if (style === 'bun') parts.push(sphere(`bun`, matName('braids'), [0, hf.topY - 0.03, hf.headZ - 0.085], 0.042, BONE_INDEX.get('Head')!, col));
  return { parts, materials: [mat(tex)] };
}

/** UV sphere skinned to one bone (buns, beads, fruit on trays …) */
export function sphere(name: string, material: string, c: number[], rad: number, bone: number, col?: number[], seg = 12, ring = 8, scale: number[] = [1, 1, 1]): Part {
  const p: Part = { name, material, pos: [], nrm: [], uv: [], joints: [], weights: [], idx: [], src: [], col: col ? [] : undefined };
  for (let j = 0; j <= ring; j++) { const ph = (j / ring) * Math.PI; for (let i = 0; i <= seg; i++) { const th = (i / seg) * Math.PI * 2; const n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    p.pos.push(c[0] + n[0] * rad * scale[0], c[1] + n[1] * rad * scale[1], c[2] + n[2] * rad * scale[2]); p.nrm.push(n[0], n[1], n[2]); p.uv.push(i / seg, j / ring); p.joints.push(bone, 0, 0, 0); p.weights.push(1, 0, 0, 0); p.src!.push(-1); if (col) p.col!.push(col[0], col[1], col[2]); } }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; p.idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return p;
}

// ---- headwear --------------------------------------------------------------------------------------
export function buildHeadwear(rig: Rig, style: HeadwearStyle, look: Look, seed = 0): HairResult & { coversHair: boolean } {
  if (style === 'none') return { parts: [], materials: [], coversHair: false };
  const hf = headFrame(rig); const fab = FABRICS[look.fabric];
  const tint = fab.tintable && look.colour ? linear(look.colour) : [1, 1, 1];
  const matName = `hw_${fab.name}_${(look.colour ?? '').replace('#', '')}`;
  const material: GarmentMaterial = { name: matName, texture: FABRIC_PNG(fab.name), baseColor: [tint[0], tint[1], tint[2], 1], roughness: fab.roughness ?? 0.85, doubleSided: true };
  const uv = (v: SoftVert): [number, number] => { const a = Math.atan2(v.p[0], v.p[2] - hf.headZ) / Math.PI; return [a * 0.6 / fab.tile + seed * 0.3, -v.p[1] / fab.tile]; };
  const parts: Part[] = []; let coversHair = true;
  const pleats = (v: SoftVert) => 1 - 0.22 * (0.5 + 0.5 * Math.sin(Math.atan2(v.p[0], v.p[2] - hf.headZ) * 26 + v.p[1] * 40));
  switch (style) {
    case 'gele': {
      let m = capMesh(rig, hf, { front: 0.045, side: -0.01, back: -0.03 });
      const base = hf.eyeY + 0.03, span = Math.max(0.05, hf.topY - base);
      displace(m, v => { const t = Math.max(0, Math.min(1, (v.p[1] - base) / span)); const k = 0.014 + 0.075 * t * t; const dx = v.p[0] + 0.02 * t, dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * k + 0.03 * t * t, 0.07 * t * t * t + 0.005, (dz / l) * k - 0.02 * t * t]; });
      recomputeNormals(m); rims(m, v => [-v.n[0] * 0.012, -0.004, -v.n[2] * 0.012]);
      const conc = concavity(m);
      parts.push(toPart(m, 'gele', matName, uv, (v, i) => { const k = pleats(v) * (1 - 0.3 * conc[i]); return [k, k, k]; }));
      break;
    }
    case 'scarf': {
      let m = capMesh(rig, hf, { front: 0.045, side: -0.012, back: -0.035 });
      offset(m, 0.012); recomputeNormals(m);
      rims(m, v => [-v.n[0] * 0.01, -0.003, -v.n[2] * 0.01]);
      const conc = concavity(m);
      parts.push(toPart(m, 'scarf', matName, uv, (v, i) => { const k = (1 - 0.3 * conc[i]); return [k, k, k]; }));
      break;
    }
    case 'hijab': {
      // cap down to the hairline + a conical drape over the shoulders; face opening carved with an ellipsoid
      let m = capMesh(rig, hf, { front: 0.03, side: -0.03, back: -0.045, ears: false });
      offset(m, 0.012); recomputeNormals(m);
      const faceC = [0, hf.eyeY - 0.03, hf.headZ + 0.08];
      m = clip(m, v => 1 - ((v.p[0] / 0.075) ** 2 + ((v.p[1] - faceC[1]) / 0.095) ** 2 + ((v.p[2] - faceC[2]) / 0.11) ** 2));
      // drape: two rim stages from the bottom boundary down to the shoulders
      const lower = (v: SoftVert) => v.p[1] < hf.eyeY + 0.02;
      rims(m, v => { const dx = v.p[0], dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * 0.045, -0.09, (dz / l) * 0.045 + 0.01]; }, lower);
      rims(m, v => { const dx = v.p[0], dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * 0.07, -0.1, (dz / l) * 0.06]; }, v => v.p[1] < hf.eyeY - 0.05);
      recomputeNormals(m);
      rims(m, v => [-v.n[0] * 0.01, -v.n[1] * 0.01, -v.n[2] * 0.01]);
      const conc = concavity(m);
      parts.push(toPart(m, 'hijab', matName, uv, (v, i) => { const k = 1 - 0.35 * conc[i]; return [k, k, k]; }));
      break;
    }
    case 'fila': case 'beret': case 'cap': case 'hardhat': {
      const lift = style === 'hardhat' ? 0.07 : 0.065;
      let m = capMesh(rig, hf, { front: lift, side: 0.02, back: 0.01, ears: false });
      const t0 = hf.eyeY + lift, span = Math.max(0.04, hf.topY - t0);
      if (style === 'fila') { offset(m, 0.013); displace(m, v => { const t = Math.max(0, (v.p[1] - t0) / span); return [0, 0.012 * t, 0]; }); }
      if (style === 'beret') { displace(m, v => { const t = Math.max(0, (v.p[1] - t0) / span); const dx = v.p[0] + 0.03 * t, dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * (0.01 + 0.04 * t) + 0.02 * t, -0.015 * t * t, (dz / l) * (0.01 + 0.04 * t)]; }); recomputeNormals(m); }
      if (style === 'cap') { offset(m, 0.01); }
      if (style === 'hardhat') { offset(m, 0.02); displace(m, v => { const t = Math.max(0, (v.p[1] - t0) / span); return [0, 0.02 * t, 0]; }); }
      recomputeNormals(m);
      // band / brim
      if (style === 'fila') rims(m, v => [v.n[0] * 0.006, -0.012, v.n[2] * 0.006]);
      if (style === 'cap' || style === 'hardhat') {
        const front = (v: SoftVert) => azimuth(hf, v) < (style === 'cap' ? 0.3 : 1.1);
        rims(m, v => { const dx = v.p[0], dz = v.p[2] - hf.headZ; const l = Math.hypot(dx, dz) || 1; const k = style === 'cap' ? 0.07 : 0.03 + 0.02 * (1 - azimuth(hf, v)); return [(dx / l) * k, -0.012, (dz / l) * k]; }, front, true);
      }
      rims(m, v => [-v.n[0] * 0.008, -v.n[1] * 0.004, -v.n[2] * 0.008]);
      const conc = concavity(m);
      parts.push(toPart(m, style, matName, uv, (v, i) => { const k = 1 - 0.3 * conc[i]; return [k, k, k]; }));
      coversHair = style !== 'cap' && style !== 'hardhat' && style !== 'beret';
      break;
    }
  }
  return { parts, materials: [material], coversHair };
}
