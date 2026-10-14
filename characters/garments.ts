/**
 * Wardrobe: garments are cut from MakeHuman's helper shells (helper-tights = body-hugging shell
 * incl. feet, helper-skirt = A-line shell from waist to ankle) in the rig's T-pose, then offset,
 * loosened, hemmed (rims) and UV-mapped planarly in metres so fabric prints keep a real-world scale.
 *
 * Nothing here is simulated cloth: garments are skinned exactly like the body, which is what a
 * mobile crowd needs.  Every builder returns the parts plus the body vertices it hides.
 */
import { base } from './body';
import { BONE_INDEX, type Rig } from './rig';
import { mergeInto, type Part } from './mesh';
import { clip, concavity, displace, flipMesh, fromGroup, limbFrame, offset, recomputeNormals, rims, toPart, type LimbFrame, type SoftMesh, type SoftVert } from './softmesh';
import { FABRICS, FABRIC_PNG, linear } from './fabrics';

export interface GarmentMaterial { name: string; texture: string; baseColor: [number, number, number, number]; roughness: number; doubleSided?: boolean }
export interface GarmentResult { parts: Part[]; hide: Set<number>; materials: GarmentMaterial[] }
export interface Look { fabric: string; colour?: string; /* hex, for tintable fabrics */ seed?: number }

export interface GarmentCtx {
  rig: Rig; frame: LimbFrame; height: number;
  /** landmarks (metres, T-pose) */
  hipsY: number; chestY: number; neckY: number; neckZ: number; kneeY: number; ankleY: number; waistY: number; shoulderX: number;
  armLen: number; foreLen: number; upLegLen: number; legLen: number;
  nearestTights: Int32Array; // body vertex → helper-tights vertex (MakeHuman index) or −1
}

const LEFT_ARM = ['LeftArm', 'LeftForeArm', 'LeftHand'], RIGHT_ARM = ['RightArm', 'RightForeArm', 'RightHand'];
const LEFT_LEG = ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], RIGHT_LEG = ['RightUpLeg', 'RightLeg', 'RightFoot'];

export function garmentCtx(rig: Rig): GarmentCtx {
  const frame = limbFrame(rig); const h = frame.heads;
  const hips = h('Hips'), spine2 = h('Spine2'), neck = h('Neck'), knee = h('LeftLeg'), ankle = h('LeftFoot'), arm = h('LeftArm'), fore = h('LeftForeArm'), hand = h('LeftHand'), upleg = h('LeftUpLeg');
  const height = rig.heads[BONE_INDEX.get('HeadTop_End')! * 3 + 1];
  const b = base();
  // nearest helper-tights vertex for every body vertex (coarse grid)
  const tights = new Set<number>(); for (const f of b.byGroup.get('helper-tights')!) for (const v of f.v) tights.add(v);
  const tArr = [...tights]; const cell = 0.05; const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const v of tArr) { const k = key(rig.pos[v * 3], rig.pos[v * 3 + 1], rig.pos[v * 3 + 2]); const a = grid.get(k); if (a) a.push(v); else grid.set(k, [v]); }
  const nearestTights = new Int32Array(b.nVerts).fill(-1);
  for (const f of b.byGroup.get('body')!) for (const vi of f.v) {
    if (nearestTights[vi] !== -1) continue;
    const x = rig.pos[vi * 3], y = rig.pos[vi * 3 + 1], z = rig.pos[vi * 3 + 2]; let best = 0.03 * 0.03, bi = -1;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue;
      for (const v of a) { const d = (rig.pos[v * 3] - x) ** 2 + (rig.pos[v * 3 + 1] - y) ** 2 + (rig.pos[v * 3 + 2] - z) ** 2; if (d < best) { best = d; bi = v; } }
    }
    nearestTights[vi] = bi;
  }
  return {
    rig, frame, height, hipsY: hips[1], chestY: spine2[1], neckY: neck[1], neckZ: neck[2], kneeY: knee[1], ankleY: ankle[1], waistY: hips[1] + 0.32 * (spine2[1] - hips[1]), shoulderX: arm[0],
    armLen: Math.hypot(fore[0] - arm[0], fore[1] - arm[1], fore[2] - arm[2]), foreLen: Math.hypot(hand[0] - fore[0], hand[1] - fore[1], hand[2] - fore[2]),
    upLegLen: Math.hypot(knee[0] - upleg[0], knee[1] - upleg[1], knee[2] - upleg[2]), legLen: Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]),
    nearestTights,
  };
}

// ---- fields -----------------------------------------------------------------------------------
const armChain = (v: SoftVert) => (v.p[0] >= 0 ? LEFT_ARM : RIGHT_ARM);
const legChain = (v: SoftVert) => (v.p[0] >= 0 ? LEFT_LEG : RIGHT_LEG);

/** sleeve length measured from the shoulder joint along the arm chain (metres); non-arm vertices → keep */
function sleeveField(ctx: GarmentCtx, len: number) {
  return (v: SoftVert) => (Math.abs(v.p[0]) < ctx.shoulderX - 0.03 ? -1 : ctx.frame.along(v, armChain(v)) - len);
}
function legField(ctx: GarmentCtx, len: number) {
  return (v: SoftVert) => (v.p[1] > ctx.hipsY + 0.03 ? -1 : ctx.frame.along(v, legChain(v)) - len);
}
/** removes the neck opening: ellipsoid around the neck with a deeper front scoop (`dip`) */
function neckField(ctx: GarmentCtx, o: { r?: number; dip?: number; up?: number } = {}) {
  const r = o.r ?? 0.075, dip = o.dip ?? 0.03, cy = ctx.neckY + 0.07 + (o.up ?? 0), cz = ctx.neckZ;
  return (v: SoftVert) => {
    const front = Math.max(0, v.p[2] - cz) / 0.09; const y = v.p[1] + dip * Math.min(1, front);
    return 1 - ((v.p[0] / r) ** 2 + ((y - cy) / 0.13) ** 2 + ((v.p[2] - cz) / 0.09) ** 2);
  };
}
const maxField = (...fs: ((v: SoftVert) => number)[]) => (v: SoftVert) => { let m = -Infinity; for (const f of fs) m = Math.max(m, f(v)); return m; };

// ---- shaping ------------------------------------------------------------------------------------
/** push sleeve vertices away from the arm axis (wide sleeves) and leg vertices from the leg axis */
function loosenLimbs(ctx: GarmentCtx, m: SoftMesh, o: { arms?: (t: number) => number; legs?: (t: number) => number; torso?: (y: number) => number }): void {
  const totalArm = ctx.armLen + ctx.foreLen, totalLeg = ctx.upLegLen + ctx.legLen;
  displace(m, v => {
    const out = [0, 0, 0]; let any = false;
    if (o.arms && Math.abs(v.p[0]) > ctx.shoulderX - 0.02) {
      const chain = armChain(v); const t = Math.max(0, Math.min(1, ctx.frame.along(v, chain) / totalArm)); const { dir } = ctx.frame.radial(v, chain); const k = o.arms(t);
      if (k) { out[0] += dir[0] * k; out[1] += dir[1] * k; out[2] += dir[2] * k; any = true; }
    }
    if (o.legs && v.p[1] < ctx.hipsY + 0.02) {
      const chain = legChain(v); const t = Math.max(0, Math.min(1, ctx.frame.along(v, chain) / totalLeg)); const { dir } = ctx.frame.radial(v, chain); const k = o.legs(t);
      if (k) { out[0] += dir[0] * k; out[1] += dir[1] * k; out[2] += dir[2] * k; any = true; }
    }
    if (o.torso && Math.abs(v.p[0]) < ctx.shoulderX + 0.02) {
      const k = o.torso(v.p[1]);
      if (k && v.p[1] > ctx.hipsY - 0.02) { const dx = v.p[0], dz = v.p[2] - 0.02; const l = Math.hypot(dx, dz) || 1; out[0] += (dx / l) * k; out[2] += (dz / l) * k; any = true; } // radial from the spine line
      else if (k && !o.legs) { const { dir } = ctx.frame.radial(v, legChain(v)); out[0] += dir[0] * k; out[1] += dir[1] * k; out[2] += dir[2] * k; any = true; } // below the crotch: around each leg
    }
    return any ? out : null;
  });
}

/** planar UV in metres; `tile` = metres per texture repeat */
function planarUV(tile: number, seedU: number, seedV: number) {
  return (v: SoftVert): [number, number] => {
    const side = Math.abs(v.n[2]) >= Math.abs(v.n[0]); const a = side ? v.p[0] : v.p[2] * Math.sign(v.n[0] || 1);
    return [a / tile + seedU, -v.p[1] / tile + seedV];
  };
}

function finish(ctx: GarmentCtx, m: SoftMesh, name: string, mat: string, look: Look, o: { aoStrength?: number; vScale?: number } = {}): Part {
  const fab = FABRICS[look.fabric]; const tile = fab.tile; const seed = look.seed ?? 0;
  const conc = concavity(m);
  const uv = planarUV(tile, (seed % 7) * 0.137, (seed % 5) * 0.21);
  const uvFn = o.vScale ? (v: SoftVert): [number, number] => { const t = uv(v); return [t[0], -v.p[1] * o.vScale! / tile]; } : uv;
  return toPart(m, name, mat, uvFn, (v, i) => { const k = 1 - (o.aoStrength ?? 0.45) * conc[i] - (v.n[1] < -0.3 ? 0.12 : 0); return [k, k, k]; });
}

export function materialName(look: Look): string { const fab = FABRICS[look.fabric]; return 'g_' + fab.name + (fab.tintable && look.colour ? '_' + look.colour.replace('#', '').toLowerCase() : ''); }
function materialFor(_name: string, look: Look): GarmentMaterial {
  const fab = FABRICS[look.fabric];
  const tint = fab.tintable && look.colour ? linear(look.colour) : [1, 1, 1];
  return { name: materialName(look), texture: FABRIC_PNG(fab.name), baseColor: [tint[0], tint[1], tint[2], 1], roughness: fab.roughness ?? 0.85, doubleSided: true };
}

/** body vertices covered by kept helper-tights vertices (excluding a margin near the garment boundary) */
function hideUnderTights(ctx: GarmentCtx, m: SoftMesh, boundary: number[][], margin = 0.02): Set<number> {
  const covered = new Set<number>();
  for (const v of m.v) {
    if (v.src < 0) continue; let near = false;
    for (const b of boundary) { if ((b[0] - v.p[0]) ** 2 + (b[1] - v.p[1]) ** 2 + (b[2] - v.p[2]) ** 2 < margin * margin) { near = true; break; } }
    if (!near) covered.add(v.src);
  }
  const hide = new Set<number>();
  ctx.nearestTights.forEach((t, vi) => { if (t >= 0 && covered.has(t)) hide.add(vi); });
  return hide;
}
function boundaryPositions(m: SoftMesh): number[][] {
  const seen = new Set<number>(); const out: number[][] = [];
  const count = new Map<string, number>(); const edges: [number, number][] = [];
  for (const poly of m.f) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const k = a < b ? `${a}_${b}` : `${b}_${a}`; count.set(k, (count.get(k) ?? 0) + 1); edges.push([a, b]); }
  for (const [a, b] of edges) { const k = a < b ? `${a}_${b}` : `${b}_${a}`; if (count.get(k) === 1) for (const i of [a, b]) if (!seen.has(i)) { seen.add(i); out.push(m.v[i].p); } }
  return out;
}

// ---- tops ---------------------------------------------------------------------------------------
export interface TopOpts {
  sleeve: number;            // metres along the arm from the shoulder (0.02 = sleeveless, 0.55 = wrist)
  hem: number;               // absolute y of the hem
  neck?: { r?: number; dip?: number; up?: number };
  thickness?: number;        // normal offset (layer)
  wideSleeve?: number;       // radial loosening at the cuff (metres)
  wideTorso?: number;        // radial loosening of the torso below the chest (metres)
  collar?: 'none' | 'band' | 'shirt';
  tuck?: boolean;            // true: hem hugs the body (worn under trousers), no loosening at the hem
  vScale?: number;           // override: v = −y·vScale/tile (height-registered prints such as hi-vis bands)
  name?: string;
}
export function buildTop(ctx: GarmentCtx, look: Look, o: TopOpts): GarmentResult {
  const thick = o.thickness ?? 0.011;
  let m = fromGroup(ctx.rig, 'helper-tights');
  m = clip(m, maxField(v => o.hem - v.p[1], neckField(ctx, o.neck), sleeveField(ctx, o.sleeve)));
  if (o.wideSleeve || o.wideTorso) loosenLimbs(ctx, m, {
    arms: o.wideSleeve ? t => o.wideSleeve! * Math.min(1, t / Math.max(0.05, o.sleeve / (ctx.armLen + ctx.foreLen))) ** 1.2 : undefined,
    torso: o.wideTorso ? y => o.wideTorso! * Math.max(0, Math.min(1, (ctx.chestY - y) / Math.max(0.05, ctx.chestY - o.hem))) : undefined,
  });
  offset(m, thick);
  const boundary = boundaryPositions(m);
  const name = o.name ?? 'top'; const mat = materialName(look);
  // collar: standing band grown from the neckline, then the generic inner rim
  if (o.collar && o.collar !== 'none') {
    const h = o.collar === 'shirt' ? 0.03 : 0.02;
    rims(m, v => [v.n[0] * 0.004, h, v.n[2] * 0.004 + (v.p[2] > ctx.neckZ + 0.02 ? -0.008 : 0)], v => v.p[1] > ctx.neckY - 0.03);
    recomputeNormals(m);
  }
  rims(m, v => [-v.n[0] * thick * 0.85, -v.n[1] * thick * 0.85, -v.n[2] * thick * 0.85]);
  const part = finish(ctx, m, name, mat, look, { vScale: o.vScale });
  return { parts: [part], hide: hideUnderTights(ctx, m, boundary, o.tuck ? 0.015 : 0.02), materials: [materialFor(mat, look)] };
}

// ---- bottoms -------------------------------------------------------------------------------------
export interface BottomOpts { top: number; leg: number; thickness?: number; wideLeg?: number; name?: string }
export function buildTrousers(ctx: GarmentCtx, look: Look, o: BottomOpts): GarmentResult {
  const thick = o.thickness ?? 0.007;
  let m = fromGroup(ctx.rig, 'helper-tights');
  m = clip(m, maxField(v => v.p[1] - o.top, legField(ctx, o.leg)));
  if (o.wideLeg) loosenLimbs(ctx, m, { legs: t => o.wideLeg! * Math.min(1, t / Math.max(0.1, o.leg / (ctx.upLegLen + ctx.legLen))) ** 1.5 });
  offset(m, thick);
  const boundary = boundaryPositions(m);
  const name = o.name ?? 'trousers'; const mat = materialName(look);
  // waistband: thicker ring at the top
  rims(m, v => [v.n[0] * 0.004, 0.0, v.n[2] * 0.004], v => v.p[1] > o.top - 0.01);
  rims(m, v => [-v.n[0] * thick * 0.9, -v.n[1] * thick * 0.9, -v.n[2] * thick * 0.9]);
  const part = finish(ctx, m, name, mat, look);
  return { parts: [part], hide: hideUnderTights(ctx, m, boundary), materials: [materialFor(mat, look)] };
}

export interface SkirtOpts { top: number; hem: number; flare?: number; thickness?: number; name?: string; hideLegs?: boolean }
export function buildSkirt(ctx: GarmentCtx, look: Look, o: SkirtOpts): GarmentResult {
  const thick = o.thickness ?? 0.008;
  let m = fromGroup(ctx.rig, 'helper-skirt');
  m = clip(m, maxField(v => v.p[1] - o.top, v => o.hem - v.p[1]));
  const span = Math.max(0.05, o.top - o.hem);
  displace(m, v => {
    const t = Math.max(0, Math.min(1, (o.top - v.p[1]) / span)); const k = (o.flare ?? 0.02) * t * t + 0.004;
    const dx = v.p[0], dz = v.p[2] - 0.02; const l = Math.hypot(dx, dz) || 1; return [(dx / l) * k, 0, (dz / l) * k];
  });
  offset(m, thick);
  const name = o.name ?? 'skirt'; const mat = materialName(look);
  rims(m, v => [v.n[0] * 0.003, 0, v.n[2] * 0.003], v => v.p[1] > o.top - 0.01);
  rims(m, v => [-v.n[0] * thick, -v.n[1] * thick, -v.n[2] * thick]);
  const part = finish(ctx, m, name, mat, look);
  const hide = new Set<number>();
  if (o.hideLegs !== false) {
    const b = base(); const faces = b.byGroup.get('body')!;
    for (const f of faces) for (const vi of f.v) { const y = ctx.rig.pos[vi * 3 + 1], x = ctx.rig.pos[vi * 3]; if (y > o.hem + 0.04 && y < o.top - 0.01 && Math.abs(x) < 0.3) hide.add(vi); }
  }
  return { parts: [part], hide, materials: [materialFor(mat, look)] };
}

// ---- feet ---------------------------------------------------------------------------------------
export interface ShoeOpts { top: number; thickness?: number; sole?: number; name?: string; style?: 'shoe' | 'boot' | 'slide' | 'sandal' }
export function buildShoes(ctx: GarmentCtx, look: Look, o: ShoeOpts): GarmentResult {
  const thick = o.thickness ?? 0.006; const sole = o.sole ?? 0.012; const style = o.style ?? 'shoe';
  const name = o.name ?? 'shoes'; const mat = materialName(look); const soleLook: Look = { fabric: 'rubber', colour: '#2B2B2B' }; const soleMat = materialName(soleLook);
  let m = fromGroup(ctx.rig, 'helper-tights', vs => vs.every(v => ctx.rig.pos[v * 3 + 1] < ctx.kneeY));
  const toeZ = ctx.frame.heads('LeftToeBase')[2];
  if (style === 'slide' || style === 'sandal') {
    // sole plate = underside of the foot shell, pushed down to the ground and thickened
    const plate = clip(m, v => v.p[1] - 0.028);
    flipMesh(plate); // underside faces → upward-facing top of the sole
    const fl = ctx.frame.heads('LeftFoot'), fr = ctx.frame.heads('RightFoot');
    displace(plate, v => { const f = v.p[0] >= 0 ? fl : fr; return [(v.p[0] - f[0]) * 0.1, -v.p[1] + sole, (v.p[2] - f[2] - 0.05) * 0.08]; });
    rims(plate, () => [0, -sole, 0]); // vertical rim down to the ground
    recomputeNormals(plate);
    const parts = [finish(ctx, plate, name + '_sole', soleMat, soleLook, { aoStrength: 0.2 })];
    // strap(s): slab(s) of the shell across the instep
    const straps: [number, number][] = style === 'slide' ? [[toeZ - 0.05, toeZ - 0.005]] : [[toeZ - 0.085, toeZ - 0.06], [toeZ - 0.03, toeZ - 0.005]];
    let strapMesh: SoftMesh | null = null;
    for (const [z0, z1] of straps) {
      let s = clip(m, maxField(v => z0 - v.p[2], v => v.p[2] - z1, v => 0.02 - v.p[1], v => v.p[1] - 0.09));
      offset(s, thick); rims(s, v => [-v.n[0] * thick, -v.n[1] * thick, -v.n[2] * thick]);
      if (!strapMesh) strapMesh = s; else { const off = strapMesh.v.length; strapMesh.v.push(...s.v); for (const f of s.f) strapMesh.f.push(f.map(i => i + off)); }
    }
    if (strapMesh) parts.push(finish(ctx, strapMesh, name + '_strap', mat, look));
    const hide = new Set<number>(); const b = base();
    for (const f of b.byGroup.get('body')!) for (const vi of f.v) if (ctx.rig.pos[vi * 3 + 1] < 0.012) hide.add(vi);
    return { parts, hide, materials: [materialFor(mat, look), materialFor(soleMat, soleLook)] };
  }
  m = clip(m, v => v.p[1] - o.top);
  offset(m, v => (v.n[1] < -0.4 ? 0.0 : thick));
  // flat sole: everything in the bottom band is dragged to the ground and widened slightly
  displace(m, v => { const d = [v.n[0] * 0.004, 0, v.n[2] * 0.004]; if (v.p[1] < sole) d[1] = -v.p[1]; else if (v.p[1] < sole + 0.02) d[1] = -(sole + 0.02 - v.p[1]) * 0.5; return d; });
  const boundary = boundaryPositions(m);
  rims(m, v => [v.n[0] * 0.003, 0, v.n[2] * 0.003], v => v.p[1] > o.top - 0.02); // ankle collar
  rims(m, v => [-v.n[0] * thick * 1.5, -v.n[1] * thick * 1.5, -v.n[2] * thick * 1.5]);
  const part = finish(ctx, m, name, mat, look, { aoStrength: 0.35 });
  // sole band colour (vertex colour darkening below `sole`+6mm)
  for (let i = 0; i < part.pos.length / 3; i++) { if (part.pos[i * 3 + 1] < sole + 0.006) { part.col![i * 3] *= 0.35; part.col![i * 3 + 1] *= 0.35; part.col![i * 3 + 2] *= 0.35; } }
  return { parts: [part], hide: hideUnderTights(ctx, m, boundary, 0.015), materials: [materialFor(mat, look)] };
}

// ---- outfits ------------------------------------------------------------------------------------
export type GarmentId =
  | 'briefs' | 'tank' | 'tshirt' | 'polo' | 'shirt_long' | 'shirt_short' | 'blouse' | 'buba' | 'kaftan' | 'senator' | 'agbada' | 'jacket' | 'hivis' | 'jersey' | 'vest' | 'uniform_shirt' | 'school_shirt' | 'lab_coat'
  | 'trousers' | 'jeans' | 'shorts' | 'sokoto' | 'wrapper' | 'skirt_knee' | 'skirt_long' | 'school_skirt'
  | 'dress' | 'gown' | 'boubou' | 'abaya' | 'iro_buba'
  | 'shoes' | 'sneakers' | 'boots' | 'slides' | 'sandals' | 'heels';

export interface OutfitItem { id: GarmentId; look: Look }

/** Build one garment by catalogue id; options are derived from the character's landmarks. */
export function buildGarment(ctx: GarmentCtx, item: OutfitItem): GarmentResult {
  const { id, look } = item; const c = ctx; const H = c.height / 1.75;
  const hipHem = (d: number) => c.hipsY + d * H;
  switch (id) {
    // ---- tops
    case 'briefs': return buildTrousers(c, look, { top: c.hipsY + 0.06 * H, leg: 0.07, thickness: 0.004, name: 'briefs' });
    case 'tank': return buildTop(c, look, { sleeve: 0.02, hem: hipHem(-0.03), neck: { r: 0.085, dip: 0.06 }, thickness: 0.006, name: 'tank' });
    case 'tshirt': return buildTop(c, look, { sleeve: 0.18 * H, hem: hipHem(-0.04), neck: { r: 0.07, dip: 0.025 }, name: 'tshirt' });
    case 'polo': return buildTop(c, look, { sleeve: 0.17 * H, hem: hipHem(-0.05), neck: { r: 0.065, dip: 0.02 }, collar: 'shirt', name: 'polo' });
    case 'shirt_long': return buildTop(c, look, { sleeve: 0.56 * H, hem: hipHem(-0.08), neck: { r: 0.065, dip: 0.02 }, collar: 'shirt', name: 'shirt' });
    case 'shirt_short': return buildTop(c, look, { sleeve: 0.2 * H, hem: hipHem(-0.08), neck: { r: 0.065, dip: 0.02 }, collar: 'shirt', name: 'shirt' });
    case 'uniform_shirt': return buildTop(c, look, { sleeve: 0.2 * H, hem: hipHem(-0.06), neck: { r: 0.065, dip: 0.02 }, collar: 'shirt', name: 'uniform' });
    case 'school_shirt': return buildTop(c, look, { sleeve: 0.17 * H, hem: hipHem(-0.05), neck: { r: 0.06, dip: 0.02 }, collar: 'shirt', name: 'school' });
    case 'blouse': return buildTop(c, look, { sleeve: 0.22 * H, hem: hipHem(-0.06), neck: { r: 0.08, dip: 0.05 }, wideSleeve: 0.02, name: 'blouse' });
    case 'buba': return buildTop(c, look, { sleeve: 0.5 * H, hem: hipHem(-0.16), neck: { r: 0.08, dip: 0.04 }, wideSleeve: 0.05, wideTorso: 0.03, thickness: 0.013, name: 'buba' });
    case 'kaftan': return buildKaftan(c, look, { hem: c.kneeY + 0.02, sleeve: 0.56 * H, name: 'kaftan' });
    case 'senator': return buildKaftan(c, look, { hem: c.kneeY + 0.08, sleeve: 0.56 * H, collar: 'band', name: 'senator' });
    case 'agbada': return buildAgbada(c, look);
    case 'jacket': return buildTop(c, look, { sleeve: 0.58 * H, hem: hipHem(-0.03), neck: { r: 0.085, dip: 0.12 }, thickness: 0.018, collar: 'shirt', name: 'jacket' });
    case 'hivis': return buildTop(c, look, { sleeve: 0.02, hem: hipHem(-0.01), neck: { r: 0.09, dip: 0.06 }, thickness: 0.02, name: 'hivis', vScale: 1.75 / c.height });
    case 'vest': return buildTop(c, look, { sleeve: 0.02, hem: hipHem(-0.02), neck: { r: 0.08, dip: 0.08 }, thickness: 0.016, name: 'vest' });
    case 'jersey': return buildTop(c, look, { sleeve: 0.2 * H, hem: hipHem(-0.05), neck: { r: 0.07, dip: 0.03 }, name: 'jersey' });
    case 'lab_coat': return buildKaftan(c, look, { hem: c.kneeY + 0.04, sleeve: 0.56 * H, collar: 'shirt', name: 'labcoat', thickness: 0.018 });
    // ---- bottoms
    case 'trousers': return buildTrousers(c, look, { top: c.waistY, leg: c.upLegLen + c.legLen - 0.005, name: 'trousers' });
    case 'jeans': return buildTrousers(c, look, { top: c.waistY - 0.02, leg: c.upLegLen + c.legLen - 0.005, name: 'jeans', thickness: 0.008 });
    case 'shorts': return buildTrousers(c, look, { top: c.waistY - 0.01, leg: c.upLegLen * 0.55, name: 'shorts' });
    case 'sokoto': return buildTrousers(c, look, { top: c.waistY, leg: c.upLegLen + c.legLen - 0.05, wideLeg: 0.03, name: 'sokoto' });
    case 'wrapper': return buildSkirt(c, look, { top: c.waistY + 0.01, hem: c.ankleY + 0.04, flare: 0.0, name: 'wrapper' });
    case 'skirt_knee': return buildSkirt(c, look, { top: c.waistY, hem: c.kneeY + 0.01, flare: 0.03, name: 'skirt' });
    case 'school_skirt': return buildSkirt(c, look, { top: c.waistY, hem: c.kneeY - 0.02, flare: 0.04, name: 'skirt' });
    case 'skirt_long': return buildSkirt(c, look, { top: c.waistY, hem: c.ankleY + 0.06, flare: 0.06, name: 'skirt' });
    // ---- full
    case 'dress': return merge(buildTop(c, look, { sleeve: 0.12 * H, hem: c.waistY - 0.03, neck: { r: 0.08, dip: 0.05 }, name: 'dress_top' }), buildSkirt(c, look, { top: c.waistY + 0.02, hem: c.kneeY + 0.02, flare: 0.05, name: 'dress_skirt' }));
    case 'gown': return merge(buildTop(c, look, { sleeve: 0.02, hem: c.waistY - 0.03, neck: { r: 0.085, dip: 0.08 }, name: 'gown_top' }), buildSkirt(c, look, { top: c.waistY + 0.02, hem: c.ankleY + 0.03, flare: 0.1, name: 'gown_skirt' }));
    case 'boubou': return merge(buildTop(c, look, { sleeve: 0.5 * H, hem: c.waistY - 0.03, neck: { r: 0.09, dip: 0.08 }, wideSleeve: 0.12, wideTorso: 0.05, thickness: 0.016, name: 'boubou_top' }), buildSkirt(c, look, { top: c.waistY + 0.03, hem: c.ankleY + 0.03, flare: 0.1, thickness: 0.03, name: 'boubou_skirt' }));
    case 'abaya': return merge(buildTop(c, look, { sleeve: 0.58 * H, hem: c.waistY - 0.03, neck: { r: 0.06, dip: 0.0 }, wideSleeve: 0.04, wideTorso: 0.03, thickness: 0.014, name: 'abaya_top' }), buildSkirt(c, look, { top: c.waistY + 0.03, hem: c.ankleY + 0.02, flare: 0.07, thickness: 0.02, name: 'abaya_skirt' }));
    case 'iro_buba': return merge(buildTop(c, look, { sleeve: 0.45 * H, hem: hipHem(-0.14), neck: { r: 0.08, dip: 0.04 }, wideSleeve: 0.06, wideTorso: 0.03, thickness: 0.013, name: 'buba' }), buildSkirt(c, look, { top: c.waistY + 0.01, hem: c.ankleY + 0.05, flare: 0.0, name: 'iro' }));
    // ---- feet
    case 'shoes': return buildShoes(c, look, { top: c.ankleY + 0.02, name: 'shoes' });
    case 'sneakers': return buildShoes(c, look, { top: c.ankleY + 0.035, thickness: 0.008, sole: 0.02, name: 'sneakers' });
    case 'boots': return buildShoes(c, look, { top: c.ankleY + 0.14, thickness: 0.008, sole: 0.02, name: 'boots', style: 'boot' });
    case 'heels': return buildShoes(c, look, { top: c.ankleY + 0.005, thickness: 0.004, sole: 0.01, name: 'heels' });
    case 'slides': return buildShoes(c, look, { top: 0, name: 'slides', style: 'slide', sole: 0.015 });
    case 'sandals': return buildShoes(c, look, { top: 0, name: 'sandals', style: 'sandal', sole: 0.012 });
  }
}

function merge(a: GarmentResult, b: GarmentResult): GarmentResult {
  const hide = new Set([...a.hide, ...b.hide]);
  return { parts: [...a.parts, ...b.parts], hide, materials: [...a.materials, ...b.materials] };
}

/** knee-length tunic: tights top down to the waist + skirt shell down to the hem (single tube around the legs) */
function buildKaftan(ctx: GarmentCtx, look: Look, o: { hem: number; sleeve: number; collar?: 'none' | 'band' | 'shirt'; name: string; thickness?: number }): GarmentResult {
  const thick = o.thickness ?? 0.014;
  const top = buildTop(ctx, look, { sleeve: o.sleeve, hem: ctx.waistY - 0.03, neck: { r: 0.065, dip: 0.02 }, wideSleeve: 0.02, wideTorso: 0.02, thickness: thick, collar: o.collar ?? 'band', name: o.name + '_top' });
  const skirt = buildSkirt(ctx, look, { top: ctx.waistY + 0.03, hem: o.hem, flare: 0.03, thickness: thick + 0.006, name: o.name + '_skirt' });
  return merge(top, skirt);
}

/** agbada: inner kaftan + voluminous outer robe with very wide sleeves */
function buildAgbada(ctx: GarmentCtx, look: Look): GarmentResult {
  const inner = buildKaftan(ctx, { fabric: 'cotton', colour: look.colour ?? '#F2F2F2', seed: look.seed }, { hem: ctx.kneeY + 0.02, sleeve: 0.56 * (ctx.height / 1.75), collar: 'band', name: 'agbada_inner' });
  const robeTop = buildTop(ctx, look, { sleeve: 0.5 * (ctx.height / 1.75), hem: ctx.waistY - 0.03, neck: { r: 0.09, dip: 0.14 }, wideSleeve: 0.16, wideTorso: 0.07, thickness: 0.03, name: 'agbada_top' });
  const robeSkirt = buildSkirt(ctx, look, { top: ctx.waistY + 0.03, hem: ctx.kneeY - 0.12, flare: 0.12, thickness: 0.045, name: 'agbada_skirt', hideLegs: false });
  return merge(inner, merge(robeTop, robeSkirt));
}

/** Convenience: merge several garments' parts that share a material into fewer draw calls. */
export function combineByMaterial(results: GarmentResult[]): { parts: Part[]; hide: Set<number>; materials: GarmentMaterial[] } {
  const byMat = new Map<string, Part>(); const mats = new Map<string, GarmentMaterial>(); const hide = new Set<number>();
  for (const r of results) {
    for (const p of r.parts) { const ex = byMat.get(p.material); if (ex) mergeInto(ex, p); else byMat.set(p.material, p); }
    for (const m of r.materials) mats.set(m.name, m);
    for (const h of r.hide) hide.add(h);
  }
  return { parts: [...byMat.values()], hide, materials: [...mats.values()] };
}
