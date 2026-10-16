/**
 * Building archetype catalogue. Every archetype composes one or more rectangular masses inside a parcel frame
 * (u along the street frontage, v into the parcel) with roof, facade and feature descriptors the renderer builds.
 */
import type { Parcel, Polygon, Vec2, BuildingMass, MassFeature, RoofType, BuildingUse, DistrictCode, Prop } from '../src/shared/types';
import { v2, rectCorners, rectInsidePolygon, area } from '../src/shared/geom';
import { RNG } from '../src/shared/rng';
import { BUILDING_COLORS as C, FAMILY_NAMES, BUSINESS_WORDS, PLACE_WORDS } from './config';

export interface Frame { o: Vec2; u: Vec2; vin: Vec2; umin: number; umax: number; width: number; depth: number; rot: number; poly: Polygon; parcel: Parcel; /** polygon centroid in local (u, v) coords */ centre: Vec2; }

export function frameOf(parcel: Parcel): Frame | null {
  if (!parcel.frontDir || !parcel.frontNormal) return null;
  let u = v2.norm(parcel.frontDir);
  let vin: Vec2 = v2.perp(u);
  // fixed handedness: vin = perp(u) points into the parcel (so a mass's local -Z face is its street front)
  if (v2.dot(vin, parcel.frontNormal) > 0) { u = [-u[0], -u[1]]; vin = [-vin[0], -vin[1]]; }
  // origin: projection of the frontage midpoint; find it as the boundary point most towards the street
  let best: Vec2 = parcel.polygon[0], bestD = Infinity;
  const c = centroidOf(parcel.polygon);
  for (let i = 0; i < parcel.polygon.length; i++) {
    const a = parcel.polygon[i], b = parcel.polygon[(i + 1) % parcel.polygon.length];
    const mid = v2.lerp(a, b, 0.5);
    const d = v2.dot(v2.sub(mid, c), vin); // most negative = closest to the street
    const dir = v2.norm(v2.sub(b, a));
    if (Math.abs(v2.dot(dir, u)) > 0.8 && d < bestD) { bestD = d; best = mid; }
  }
  const o = best;
  let umin = Infinity, umax = -Infinity, vmax = -Infinity, vmin = Infinity;
  for (const p of parcel.polygon) { const du = v2.dot(v2.sub(p, o), u), dv = v2.dot(v2.sub(p, o), vin); umin = Math.min(umin, du); umax = Math.max(umax, du); vmax = Math.max(vmax, dv); vmin = Math.min(vmin, dv); }
  const cl = centroidOf(parcel.polygon);
  return { o, u, vin, umin, umax, width: umax - umin, depth: vmax, rot: Math.atan2(u[1], u[0]), poly: parcel.polygon, parcel, centre: [v2.dot(v2.sub(cl, o), u), v2.dot(v2.sub(cl, o), vin)] };
}

/** frame for large complexes: use the longest axis of the site as the frontage when the site is deeper than wide */
export function wideFrame(parcel: Parcel): Frame | null {
  const f = frameOf(parcel); if (!f) return null;
  if (f.width >= f.depth * 0.8) return f;
  const c = centroidOf(parcel.polygon);
  // rotate the frame by 90°: candidates for the new vin are ±f.u; choose the front nearest to the city centre
  const cands: Vec2[] = [f.u, [-f.u[0], -f.u[1]]];
  let best: Frame | null = null, bestScore = -Infinity;
  for (const vin of cands) {
    const u: Vec2 = [vin[1], -vin[0]]; // vin = perp(u)  ⇒ u = (vin.z, -vin.x)
    let vmin = Infinity, vmax = -Infinity;
    for (const p of parcel.polygon) { const dv = v2.dot(v2.sub(p, c), vin); vmin = Math.min(vmin, dv); vmax = Math.max(vmax, dv); }
    const o = v2.add(c, v2.scale(vin, vmin));
    let umin = Infinity, umax = -Infinity, depth = 0;
    for (const p of parcel.polygon) { const du = v2.dot(v2.sub(p, o), u), dv = v2.dot(v2.sub(p, o), vin); umin = Math.min(umin, du); umax = Math.max(umax, du); depth = Math.max(depth, dv); }
    const score = -v2.len(o);
    if (score > bestScore) { bestScore = score; best = { o, u, vin, umin, umax, width: umax - umin, depth, rot: Math.atan2(u[1], u[0]), poly: parcel.polygon, parcel, centre: [v2.dot(v2.sub(c, o), u), v2.dot(v2.sub(c, o), vin)] }; }
  }
  return best;
}

function centroidOf(poly: Polygon): Vec2 { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }

export interface MassOpts {
  floors: number; fh: number; roof: BuildingMass['roof']; facade: BuildingMass['facade']; features?: MassFeature[]; rot?: number; noShrink?: boolean; minW?: number; minD?: number;
}

/** place a rectangular mass at local (cu, cv) with size w×d; searches nearby positions, then shrinks, until it fits inside the parcel polygon */
export function placeMass(f: Frame, cu: number, cv: number, w: number, d: number, o: MassOpts): BuildingMass | null {
  const minW = o.minW ?? w * 0.55, minD = o.minD ?? d * 0.55;
  const rot = f.rot + (o.rot ?? 0);
  const make = (u: number, v: number, w: number, d: number): BuildingMass | null => {
    const cx = f.o[0] + f.u[0] * u + f.vin[0] * v, cz = f.o[1] + f.u[1] * u + f.vin[1] * v;
    const fp = rectCorners(cx, cz, w / 2, d / 2, rot);
    if (!rectInsidePolygon(fp, f.poly, 0.05)) return null;
    return { x: r2(cx), z: r2(cz), w: r2(w), d: r2(d), rot: r2(rot, 4), floors: o.floors, floorHeight: o.fh, baseY: 0, plinthBottom: 0, roof: o.roof, facade: o.facade, features: o.features ?? [], footprint: fp.map(p => [r2(p[0]), r2(p[1])] as Vec2) };
  };
  for (let i = 0; i < 12; i++) {
    const m0 = make(cu, cv, w, d); if (m0) return m0;
    if (o.noShrink) return null;
    // search positions inside the parcel's extent, nearest to the requested spot first (front setback weighted)
    const halfW = o.rot ? d / 2 : w / 2, halfD = o.rot ? w / 2 : d / 2;
    const uLo = f.umin + halfW + 0.2, uHi = f.umax - halfW - 0.2, vLo = halfD + 0.2, vHi = f.depth - halfD - 0.2;
    if (uLo <= uHi && vLo <= vHi) {
      const nu = Math.min(9, Math.ceil((uHi - uLo) / 1.5) + 1), nv = Math.min(9, Math.ceil((vHi - vLo) / 1.5) + 1);
      const cands: [number, number, number][] = [];
      for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
        const u = nu === 1 ? (uLo + uHi) / 2 : uLo + (uHi - uLo) * (iu / (nu - 1));
        const v = nv === 1 ? (vLo + vHi) / 2 : vLo + (vHi - vLo) * (iv / (nv - 1));
        cands.push([u, v, (u - cu) ** 2 + ((v - cv) * 1.6) ** 2]);
      }
      cands.sort((a, b) => a[2] - b[2]);
      for (const [u, v] of cands) { const m = make(u, v, w, d); if (m) return m; }
    }
    w *= 0.92; d *= 0.94;
    if (w < minW || d < minD) return null;
  }
  return null;
}

/** size scaled from the parcel dimension with slight jitter, clamped */
export function scaled(r: RNG, dim: number, frac: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, dim * frac * r.range(0.92, 1.08))); }

export function r2(v: number, d = 2): number { const m = Math.pow(10, d); return Math.round(v * m) / m; }

export interface Spec {
  use: BuildingUse; archetype: string; masses: BuildingMass[]; name: string; tags: string[];
  fence?: 'wall' | 'fence' | 'hedge' | 'railing' | null; gateU?: number; gateWidth?: number;
  props?: Omit<Prop, 'y'>[]; entranceU?: number;
}

export interface Ctx { f: Frame; rng: RNG; district: DistrictCode; distToCenter: number; frontCls: string; blockUse: string; }

const pick = <T,>(r: RNG, a: readonly T[]) => r.pick(a);

export function bizName(kind: keyof typeof BUSINESS_WORDS, r: RNG): string {
  const fam = r.chance(0.55) ? pick(r, FAMILY_NAMES) : pick(r, PLACE_WORDS);
  const word = pick(r, BUSINESS_WORDS[kind]);
  if (kind === 'shop' && r.chance(0.3)) return `${fam} & Sons ${word}`;
  return `${fam} ${word}`;
}

// ─────────────────────────── palettes ───────────────────────────
function wallColor(r: RNG, d: DistrictCode): string {
  switch (d) {
    case 'CD': return r.chance(0.6) ? pick(r, C.plaster) : pick(r, C.concrete);
    case 'MQ': return r.chance(0.55) ? pick(r, C.plasterColour) : pick(r, C.plaster);
    case 'NH': return r.chance(0.8) ? pick(r, C.plaster) : pick(r, C.plasterColour);
    case 'OT': return r.chance(0.65) ? pick(r, C.plasterColour) : pick(r, C.plaster);
    case 'ID': return r.chance(0.5) ? pick(r, C.concrete) : pick(r, C.metal);
    case 'GE': return r.chance(0.6) ? pick(r, C.plaster) : pick(r, C.plasterColour);
    default: return pick(r, C.plaster);
  }
}
function roofColor(r: RNG, d: DistrictCode): { tile: string; color: string } {
  const z = r.next();
  if (d === 'OT') return z < 0.5 ? { tile: 'roof-zinc-rust', color: pick(r, C.roofBrown) } : z < 0.8 ? { tile: 'roof-tile', color: pick(r, C.roofTile) } : { tile: 'roof-zinc', color: pick(r, C.zinc) };
  if (d === 'NH') return z < 0.55 ? { tile: 'roof-tile', color: pick(r, C.roofTile) } : z < 0.8 ? { tile: 'roof-metal', color: pick(r, C.roofBrown) } : { tile: 'roof-zinc', color: pick(r, C.roofGreen) };
  if (d === 'ID') return z < 0.6 ? { tile: 'roof-zinc', color: pick(r, C.zinc) } : { tile: 'roof-metal', color: pick(r, [...C.roofGreen, ...C.metal]) };
  return z < 0.4 ? { tile: 'roof-zinc', color: pick(r, C.roofRed) } : z < 0.65 ? { tile: 'roof-zinc', color: pick(r, C.roofGreen) } : z < 0.85 ? { tile: 'roof-tile', color: pick(r, C.roofTile) } : { tile: 'roof-zinc', color: pick(r, C.zinc) };
}
const flat = (parapet = 0.6, tile = 'roof-concrete'): BuildingMass['roof'] => ({ type: 'flat', tile, parapet });
const pitched = (type: RoofType, rc: { tile: string; color: string }, pitch = 0.42, overhang = 0.6): BuildingMass['roof'] => ({ type, tile: rc.tile, pitch, overhang, color: rc.color });

export type Archetype = (c: Ctx) => Spec | null;

function tankFeature(r: RNG, p = 0.6): MassFeature[] { return r.chance(p) ? [{ kind: 'rooftank', p: [r.int(1, 2)] }] : []; }
function dish(r: RNG, p = 0.5): MassFeature[] { return r.chance(p) ? [{ kind: 'dish' }] : []; }

// ─────────────────────────── residential ───────────────────────────
export const bungalow: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 10 || f.depth < 12) return null;
  const w = Math.min(f.width - 3, scaled(r, f.width, 0.7, 10, 18)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.5, 9, 14));
  const rc = roofColor(r, district); const color = wallColor(r, district);
  const front = Math.min(5.5, Math.max(2.5, f.depth - d - 3));
  const feats: MassFeature[] = [{ kind: 'veranda', side: 0, p: [1.9] }, ...tankFeature(r, 0.45), ...dish(r, 0.4)];
  const m = placeMass(f, r.range(-0.12, 0.12) * (f.width - w), front + d / 2, w, d, { floors: 1, fh: 3.1, roof: pitched(r.chance(0.7) ? 'hip' : 'gable', rc, 0.4, 0.7), facade: { tile: r.chance(0.6) ? 'plaster-win' : 'plaster-louvre', bayWidth: 3.6, color, trim: pick(r, C.trim) }, features: feats });
  if (!m) return null;
  const masses = [m];
  if (f.width - w > 6 && r.chance(0.5)) { const g = placeMass(f, (m.x === f.o[0] ? 0 : 0) + (w / 2 + 3.2) * (r.chance(0.5) ? 1 : -1), front + 4, 5, 6.5, { floors: 1, fh: 2.7, roof: pitched('shed', rc, 0.2, 0.3), facade: { tile: 'plaster-plain', bayWidth: 4, color }, features: [{ kind: 'rollerdoor', side: 0, p: [1] }], noShrink: true }); if (g) masses.push(g); }
  return { use: 'house', archetype: 'bungalow', masses, name: '', tags: ['residential', 'single-storey'], fence: district === 'NH' ? 'wall' : r.chance(0.6) ? 'wall' : 'hedge', gateU: masses.length > 1 ? masses[1].x !== undefined ? localU(f, masses[1]) : 0 : r.range(-0.3, 0.3) * f.width };
};
function localU(f: Frame, m: BuildingMass): number { return v2.dot(v2.sub([m.x, m.z], f.o), f.u); }

export const duplex: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 11 || f.depth < 13) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.7, 10, 18)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.5, 9.5, 14));
  const rc = roofColor(r, district); const color = wallColor(r, district);
  const useFlat = r.chance(district === 'NH' ? 0.55 : 0.35);
  const front = Math.min(6, Math.max(3, f.depth - d - 3));
  const feats: MassFeature[] = [{ kind: 'balconies', side: 0, p: [1, 1, 1.4, 0.6] }, { kind: 'canopy', side: 0, p: [1.6, 3, 0.25] }, ...tankFeature(r, 0.7), ...dish(r, 0.5)];
  const m = placeMass(f, r.range(-0.1, 0.1) * (f.width - w), front + d / 2, w, d, { floors: 2, fh: 3.1, roof: useFlat ? flat(0.8) : pitched('hip', rc, 0.38, 0.6), facade: { tile: r.chance(0.5) ? 'plaster-win' : 'plaster-win2', bayWidth: 3.6, color, trim: pick(r, C.trim) }, features: feats });
  if (!m) return null;
  const masses = [m];
  const side = r.chance(0.5) ? 1 : -1;
  if (f.width - w > 6.5) { const g = placeMass(f, localU(f, m) + side * (w / 2 + 3.1), front + 4.5, 5.2, 7, { floors: 1, fh: 2.8, roof: useFlat ? flat(0.4) : pitched('shed', rc, 0.2, 0.3), facade: { tile: 'plaster-plain', bayWidth: 4, color }, features: [{ kind: 'rollerdoor', side: 0, p: [1] }], noShrink: true }); if (g) masses.push(g); }
  return { use: 'duplex', archetype: 'duplex', masses, name: '', tags: ['residential'], fence: 'wall', gateU: masses.length > 1 ? localU(f, masses[1]) : localU(f, m) + side * (w / 2 - 2) };
};

export const villa: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 16 || f.depth < 18) return null;
  const w = Math.min(f.width - 6, scaled(r, f.width, 0.62, 14, 24)), d = Math.min(f.depth - 10, scaled(r, f.depth, 0.5, 12, 18));
  const color = r.chance(0.7) ? pick(r, C.plaster) : pick(r, C.plasterColour);
  const rc = { tile: 'roof-tile', color: pick(r, C.roofTile) };
  const floors = r.chance(0.6) ? 2 : 3;
  const modern = r.chance(0.5);
  const front = Math.min(9, Math.max(5, f.depth - d - 5));
  const feats: MassFeature[] = [{ kind: 'balconies', side: 0, p: [1, 1, 1.6, 0.7] }, { kind: 'columns', side: 0, p: [2, 3.1, 1] }, { kind: 'canopy', side: 0, p: [2.2, 3.05, 0.3] }, ...(modern ? [{ kind: 'pergola', p: [1] } as MassFeature] : []), ...tankFeature(r, 0.5), ...dish(r, 0.6)];
  const m = placeMass(f, r.range(-0.08, 0.08) * (f.width - w), front + d / 2, w, d, { floors, fh: 3.2, roof: modern ? flat(1.0) : pitched('hip', rc, 0.4, 0.7), facade: { tile: modern ? 'concrete-grid' : 'plaster-win2', bayWidth: modern ? 3.4 : 5.4, color, trim: pick(r, C.trim) }, features: feats });
  if (!m) return null;
  const masses = [m];
  const side = r.chance(0.5) ? 1 : -1;
  const g = placeMass(f, localU(f, m) + side * (w / 2 + 3.8), front + 4.5, 6.5, 7.5, { floors: 1, fh: 3, roof: modern ? flat(0.5) : pitched('hip', rc, 0.3, 0.4), facade: { tile: 'plaster-plain', bayWidth: 4, color }, features: [{ kind: 'rollerdoor', side: 0, p: [2] }], noShrink: true });
  if (g) masses.push(g);
  const props: Omit<Prop, 'y'>[] = [];
  if (r.chance(0.45) && f.depth - front - d > 9) { const pu = localU(f, m), pv = front + d + 5; const p = world(f, pu, pv); props.push({ t: 'path', x: p[0], z: p[1], r: f.rot, s: [7, 0.1, 3.5], v: 1 }); }
  return { use: 'villa', archetype: 'villa', masses, name: '', tags: ['residential', 'premium'], fence: 'wall', gateU: g ? localU(f, g) : localU(f, m) + side * (w / 2 - 2), gateWidth: 4.5, props };
};

export const mansion: Archetype = ({ f, rng: r }) => {
  if (f.width < 28 || f.depth < 26) return null;
  const w = Math.min(f.width - 10, scaled(r, f.width, 0.6, 18, 32)), d = Math.min(f.depth - 14, scaled(r, f.depth, 0.45, 13, 22));
  const color = pick(r, ['#efe6d6', '#f0e4d0', '#e8dccb', '#dcd3c2', '#e6d6b8']);
  const rc = { tile: 'roof-tile', color: pick(r, C.roofTile) };
  const front = Math.min(12, Math.max(7, f.depth - d - 8));
  const center = placeMass(f, 0, front + d / 2, w, d, { floors: 3, fh: 3.3, roof: pitched('hip', rc, 0.42, 0.8), facade: { tile: 'plaster-win2', bayWidth: 5.4, color, trim: '#ffffff' }, features: [{ kind: 'portico', side: 0, p: [7, 2.6, 6.8, 4] }, { kind: 'balconies', side: 0, p: [1, 1, 1.5, 0.5] }, ...dish(r, 0.5)] });
  if (!center) return null;
  const masses = [center];
  for (const s of [-1, 1]) { const wing = placeMass(f, s * (w / 2 + 4.2), front + d / 2 + 1.5, 8.4, d - 3, { floors: 2, fh: 3.3, roof: pitched('hip', rc, 0.42, 0.7), facade: { tile: 'plaster-win', bayWidth: 3.6, color, trim: '#ffffff' }, features: [], noShrink: true }); if (wing) masses.push(wing); }
  const props: Omit<Prop, 'y'>[] = [];
  const p = world(f, 0, front - 3.5); props.push({ t: 'fountain', x: p[0], z: p[1], r: f.rot, s: 0.7 });
  if (f.depth - front - d > 12) { const q = world(f, 0, front + d + 6); props.push({ t: 'path', x: q[0], z: q[1], r: f.rot, s: [10, 0.1, 5], v: 1 }); }
  return { use: 'mansion', archetype: 'mansion', masses, name: '', tags: ['residential', 'premium'], fence: 'wall', gateU: r.range(-0.3, 0.3) * f.width, gateWidth: 5.5, props };
};

export const terrace: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 10 || f.depth < 12) return null;
  const unit = 5.6; const n = Math.max(2, Math.floor((f.width - 1) / unit));
  const w = n * unit, d = Math.min(f.depth - 6, r.range(9, 11));
  const color = wallColor(r, district); const rc = roofColor(r, district);
  const front = Math.min(4, Math.max(2.5, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: 2, fh: 3.0, roof: r.chance(0.5) ? pitched('gable', rc, 0.5, 0.4) : flat(0.7), facade: { tile: 'plaster-win2', bayWidth: unit, color, trim: pick(r, C.trim) }, features: [{ kind: 'canopy', side: 0, p: [1.2, 2.9, 0.25, n] }, ...tankFeature(r, 0.6)], minW: unit * 2 });
  if (!m) return null;
  return { use: 'terrace', archetype: 'terrace', masses: [m], name: '', tags: ['residential', 'attached'], fence: r.chance(0.6) ? 'wall' : 'hedge', gateU: 0 };
};

export const semi: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 12 || f.depth < 13) return null;
  const w = Math.min(f.width - 3, scaled(r, f.width, 0.8, 12, 18)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.5, 9, 12.0));
  const color = wallColor(r, district); const rc = roofColor(r, district);
  const front = Math.min(5, Math.max(3, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: 2, fh: 3.0, roof: pitched('gable', rc, 0.5, 0.5), facade: { tile: 'plaster-win', bayWidth: 3.6, color, trim: pick(r, C.trim) }, features: [{ kind: 'canopy', side: 0, p: [1.3, 2.9, 0.25, 2] }, { kind: 'balconies', side: 0, p: [1, 1, 1.2, 0.35] }, ...tankFeature(r, 0.6), ...dish(r, 0.5)] });
  if (!m) return null;
  return { use: 'house', archetype: 'semi-detached', masses: [m], name: '', tags: ['residential'], fence: r.chance(0.7) ? 'wall' : 'hedge', gateU: r.chance(0.5) ? -w / 4 : w / 4 };
};

export const courtyardHouse: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 11.5 || f.depth < 12.5) return null;
  const w = Math.min(f.width - 1.2, scaled(r, f.width, 0.9, 11, 24)), d = Math.min(f.depth - 1.5, scaled(r, f.depth, 0.85, 12, 24));
  const color = r.chance(0.6) ? pick(r, ['#c9a27a', '#b98a63', '#d2b48c', '#bf9f7b', '#c7a383']) : pick(r, C.plasterColour);
  const rc = roofColor(r, 'OT');
  const floors = r.chance(0.5) ? 1 : 2; const fh = 3.0;
  const tile = r.chance(0.5) ? 'mud-traditional' : 'plaster-win';
  const wing = Math.min(5.2, Math.max(3.6, Math.min(w, d) * 0.3));
  const front = 0.6;
  const mk = (cu: number, cv: number, mw: number, md: number, feats: MassFeature[], fl = floors) => placeMass(f, cu, cv, mw, md, { floors: fl, fh, roof: pitched(r.chance(0.6) ? 'hip' : 'gable', rc, 0.42, 0.6), facade: { tile, bayWidth: 3.2, color, trim: '#5a4a3a' }, features: feats, noShrink: true });
  const masses: BuildingMass[] = [];
  const fr = mk(0, front + wing / 2, w, wing, [{ kind: 'veranda', side: 0, p: [1.6] }, { kind: 'arch', side: 0, p: [2.4, 2.6] }]); if (!fr) return null; masses.push(fr);
  const left = mk(-(w / 2 - wing / 2), front + wing + (d - wing * 2) / 2, wing, d - wing * 2, [], floors); if (left) masses.push(left);
  const right = mk((w / 2 - wing / 2), front + wing + (d - wing * 2) / 2, wing, d - wing * 2, [], floors); if (right) masses.push(right);
  const back = mk(0, front + d - wing / 2, w, wing, tankFeature(r, 0.5), floors); if (back) masses.push(back);
  if (masses.length < 3) return null;
  return { use: 'courtyard-house', archetype: 'courtyard-house', masses, name: '', tags: ['residential', 'traditional'], fence: null, gateU: 0 };
};

export const apartments: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 16 || f.depth < 14) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.8, 16, 48)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.55, 12, 22));
  const floors = district === 'CD' ? r.int(5, 8) : r.int(3, 6);
  const color = wallColor(r, district);
  const front = Math.min(5, Math.max(2.5, f.depth - d - 3));
  const feats: MassFeature[] = [{ kind: 'balconies', side: 0, p: [1, 1, 1.5, 0.8] }, { kind: 'stairs', side: 2 }, { kind: 'rooftank', p: [r.int(2, 4)] }, { kind: 'ac', p: [0.5] }, { kind: 'dish' }, { kind: 'canopy', side: 0, p: [1.5, 3.2, 0.2] }];
  const m = placeMass(f, r.range(-0.1, 0.1) * (f.width - w), front + d / 2, w, d, { floors, fh: 3.0, roof: flat(1.0), facade: { tile: r.chance(0.5) ? 'concrete-grid' : 'plaster-win2', bayWidth: r.chance(0.5) ? 3.4 : 5.4, color, trim: pick(r, C.trim) }, features: feats });
  if (!m) return null;
  return { use: 'apartments', archetype: 'apartment-block', masses: [m], name: `${pick(r, PLACE_WORDS)} Court`, tags: ['residential', 'multi-family'], fence: r.chance(0.6) ? 'wall' : 'railing', gateU: r.range(-0.3, 0.3) * w };
};

export const residentialTower: Archetype = ({ f, rng: r }) => {
  if (f.width < 26 || f.depth < 22) return null;
  const w = Math.min(f.width - 6, scaled(r, f.width, 0.7, 22, 40)), d = Math.min(f.depth - 8, scaled(r, f.depth, 0.5, 14, 22));
  const floors = r.int(10, 18);
  const color = pick(r, [...C.plaster, ...C.concrete]);
  const front = Math.min(8, Math.max(4, f.depth - d - 5));
  const pod = placeMass(f, 0, front + d / 2 + 1, w + 4, d + 4, { floors: 1, fh: 4, roof: flat(0.8), facade: { tile: 'shopfront', bayWidth: 5, color, trim: '#333' }, features: [{ kind: 'canopy', side: 0, p: [2.5, 3.6, 0.3] }] });
  if (!pod) return null;
  const tower = placeMass(f, 0, front + d / 2 + 1, w, d, { floors, fh: 3.0, roof: flat(1.2), facade: { tile: 'concrete-grid', bayWidth: 3.4, color, trim: pick(r, C.trim) }, features: [{ kind: 'balconies', side: 0, p: [2, 1, 1.5, 0.9] }, { kind: 'balconies', side: 2, p: [2, 1, 1.5, 0.9] }, { kind: 'rooftank', p: [4] }, { kind: 'antenna' }], noShrink: true });
  if (!tower) return null;
  tower.baseY = 0; (tower as any).onTop = 1; // marker: sits on podium (renderer uses baseY offset)
  return { use: 'residential-tower', archetype: 'residential-tower', masses: [pod, tower], name: `${pick(r, PLACE_WORDS)} Heights`, tags: ['residential', 'high-rise'], fence: 'railing', gateU: 0 };
};

// ─────────────────────────── commercial ───────────────────────────
export const shophouse: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 6 || f.depth < 9) return null;
  const w = f.width - 0.4, d = Math.min(f.depth - 2, r.range(10, 16));
  const floors = district === 'OT' ? r.int(1, 2) : r.int(2, 3);
  const color = wallColor(r, district);
  const signColor = pick(r, C.sign);
  const feats: MassFeature[] = [{ kind: 'awning', side: 0, p: [1.4], color: pick(r, C.sign) }, { kind: 'sign', side: 0, text: bizName('shop', r), color: signColor }, ...tankFeature(r, 0.5), ...dish(r, 0.5)];
  if (floors > 1) feats.push({ kind: 'balconies', side: 0, p: [1, 1, 1.1, 0.9] });
  const groundTile = r.chance(0.6) ? 'shopfront' : 'shopfront-shutter';
  const roof = district === 'OT' && r.chance(0.5) ? pitched('shed', roofColor(r, 'OT'), 0.18, 0.4) : flat(0.7);
  const m = placeMass(f, 0, 0.2 + d / 2, w, d, { floors, fh: 3.2, roof, facade: { tile: 'plaster-win2', bayWidth: 4.2, groundTile, groundHeight: 4.0, color, trim: pick(r, C.trim) }, features: feats, minW: 5 });
  if (!m) return null;
  return { use: 'shophouse', archetype: 'shophouse', masses: [m], name: feats[1].text!, tags: ['commercial', 'retail', 'attached'], fence: null, gateU: 0 };
};

export const shop: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 8 || f.depth < 8) return null;
  const w = Math.min(f.width - 1.5, scaled(r, f.width, 0.8, 8, 16)), d = Math.min(f.depth - 3, scaled(r, f.depth, 0.6, 7, 12));
  const color = r.chance(0.5) ? pick(r, C.plasterColour) : pick(r, C.plaster);
  const name = bizName(r.chance(0.3) ? 'restaurant' : 'shop', r);
  const m = placeMass(f, 0, 1.5 + d / 2, w, d, { floors: 1, fh: 3.6, roof: flat(0.7), facade: { tile: 'shopfront', bayWidth: 5, color, trim: pick(r, C.trim) }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }, { kind: 'awning', side: 0, p: [1.2], color: pick(r, C.sign) }] });
  if (!m) return null;
  return { use: 'shop', archetype: 'corner-shop', masses: [m], name, tags: ['commercial', 'retail'], fence: null, gateU: 0 };
};

export const restaurant: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 12 || f.depth < 12) return null;
  const w = Math.min(f.width - 3, scaled(r, f.width, 0.75, 12, 22)), d = Math.min(f.depth - 7, scaled(r, f.depth, 0.5, 10, 16));
  const color = pick(r, [...C.plasterColour, '#f1d4a8', '#e3c0a0']);
  const name = bizName('restaurant', r);
  const front = Math.min(6, Math.max(4, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: r.int(1, 2), fh: 3.5, roof: r.chance(0.5) ? pitched('hip', roofColor(r, district), 0.35, 0.8) : flat(0.8), facade: { tile: 'plaster-arch', bayWidth: 3.4, groundTile: 'shopfront', groundHeight: 3.6, color, trim: '#ffffff' }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }, { kind: 'canopy', side: 0, p: [3.5, 3.2, 0.2] }] });
  if (!m) return null;
  const props: Omit<Prop, 'y'>[] = [];
  for (let i = 0; i < 3; i++) { const p = world(f, (i - 1) * 3.2, 1.6); props.push({ t: 'umbrella', x: p[0], z: p[1], r: f.rot, c: pick(r, C.sign) }); }
  return { use: 'restaurant', archetype: 'restaurant', masses: [m], name, tags: ['commercial', 'food'], fence: 'railing', gateU: 0, props };
};

export const supermarket: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 22 || f.depth < 24) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.8, 24, 52)), d = Math.min(f.depth - 16, scaled(r, f.depth, 0.5, 18, 34));
  const name = bizName('supermarket', r);
  const color = pick(r, ['#e8e2d6', '#d9d3c7', '#dfe6e2', '#e6dccb']);
  const front = Math.min(16, Math.max(10, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: 1, fh: 5.6, roof: flat(1.0, 'roof-membrane'), facade: { tile: 'panel-industrial', bayWidth: 4, groundTile: 'shopfront', groundHeight: 4.2, color, trim: '#333' }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }, { kind: 'canopy', side: 0, p: [3, 4, 0.3] }, { kind: 'ac', p: [0.2] }] });
  if (!m) return null;
  return { use: 'supermarket', archetype: 'supermarket', masses: [m], name, tags: ['commercial', 'retail', 'parking'], fence: null, gateU: 0, props: parkingRows(f, r, front - 2, w) };
};

export function parkingRows(f: Frame, r: RNG, depth: number, width: number): Omit<Prop, 'y'>[] {
  const props: Omit<Prop, 'y'>[] = [];
  if (depth < 8) return props;
  const rows = Math.floor((depth - 2) / 6);
  for (let row = 0; row < rows; row++) {
    const cv = 3 + row * 6;
    const n = Math.floor(width / 2.8);
    for (let i = 0; i < n; i++) {
      const cu = -width / 2 + 1.4 + i * 2.8;
      const p = world(f, cu, cv);
      props.push({ t: 'parkingline', x: p[0], z: p[1], r: f.rot });
      if (r.chance(0.45)) props.push({ t: 'car', x: p[0], z: p[1], r: f.rot + Math.PI / 2 + r.range(-0.05, 0.05), v: r.int(0, 7) });
    }
  }
  return props;
}

export function world(f: Frame, cu: number, cv: number): Vec2 { return [r2(f.o[0] + f.u[0] * cu + f.vin[0] * cv), r2(f.o[1] + f.u[1] * cu + f.vin[1] * cv)]; }

export const office: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 18 || f.depth < 16) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.85, 20, 50)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.65, 16, 34));
  const floors = district === 'CD' ? r.int(5, 10) : r.int(3, 6);
  const style = r.next();
  const tile = style < 0.35 ? 'concrete-strip' : style < 0.6 ? 'glass-curtain' : style < 0.8 ? 'concrete-grid' : 'glass-green';
  const color = tile.startsWith('glass') ? pick(r, C.glass) : pick(r, [...C.concrete, ...C.plaster]);
  const name = bizName(r.chance(0.2) ? 'bank' : 'office', r);
  const front = Math.min(6, Math.max(3, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors, fh: 3.6, roof: flat(1.2), facade: { tile, bayWidth: 3.4, groundTile: r.chance(0.5) ? 'colonnade' : 'shopfront', groundHeight: 4.6, color, trim: '#2b2b2b' }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign), p: [1] }, { kind: 'canopy', side: 0, p: [2.5, 4.2, 0.3] }, { kind: 'ac', p: [0.15] }, { kind: 'antenna' }] });
  if (!m) return null;
  return { use: 'office', archetype: 'office-midrise', masses: [m], name, tags: ['commercial', 'office'], fence: r.chance(0.4) ? 'railing' : null, gateU: 0 };
};

export const officeTower: Archetype = ({ f, rng: r, distToCenter }) => {
  if (f.width < 24 || f.depth < 22) return null;
  const w = Math.min(f.width - 8, scaled(r, f.width, 0.7, 24, 42)), d = Math.min(f.depth - 10, scaled(r, f.depth, 0.6, 20, 34));
  const floors = Math.round(12 + 26 * Math.exp(-distToCenter / 240) + r.range(-3, 5));
  const tile = pick(r, ['glass-curtain', 'glass-dark', 'glass-green', 'concrete-strip']);
  const color = tile.startsWith('glass') ? pick(r, C.glass) : pick(r, C.concrete);
  const name = bizName(r.chance(0.3) ? 'bank' : 'office', r);
  const front = Math.min(8, Math.max(5, f.depth - d - 6));
  const podiumFloors = 3;
  const pod = placeMass(f, 0, front + d / 2 + 2, w + 8, d + 6, { floors: podiumFloors, fh: 4.2, roof: flat(1.0, 'roof-gravel'), facade: { tile: 'concrete-grid', bayWidth: 3.4, groundTile: 'colonnade', groundHeight: 5, color: pick(r, C.concrete), trim: '#2b2b2b' }, features: [{ kind: 'canopy', side: 0, p: [4, 4.6, 0.4] }, { kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }] });
  if (!pod) return null;
  const crown = r.int(0, 3);
  const tower = placeMass(f, 0, front + d / 2 + 2, w, d, { floors, fh: 3.8, roof: flat(1.6), facade: { tile, bayWidth: 3, color, trim: '#1e1e1e' }, features: [{ kind: 'fins', p: [r.chance(0.5) ? 1 : 0] }, { kind: 'crown', p: [crown] }, ...(r.chance(0.35) ? [{ kind: 'helipad' } as MassFeature] : [{ kind: 'antenna' } as MassFeature])], noShrink: true });
  if (!tower) return null;
  (tower as any).onTop = 1;
  return { use: 'office-tower', archetype: 'office-tower', masses: [pod, tower], name, tags: ['commercial', 'office', 'high-rise', 'skyline'], fence: null, gateU: 0 };
};

export const hotel: Archetype = ({ f, rng: r }) => {
  if (f.width < 28 || f.depth < 26) return null;
  const w = Math.min(f.width - 6, scaled(r, f.width, 0.8, 28, 50)), d = Math.min(f.depth - 12, scaled(r, f.depth, 0.5, 18, 30));
  const floors = r.int(7, 14);
  const name = `${pick(r, PLACE_WORDS)} ${pick(r, BUSINESS_WORDS.hotel)}`;
  const color = pick(r, ['#efe6d6', '#e8dccb', '#d9cdb6', '#c8bba9']);
  const front = Math.min(12, Math.max(8, f.depth - d - 4));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors, fh: 3.3, roof: flat(1.2), facade: { tile: 'hotel', bayWidth: 4, groundTile: 'colonnade', groundHeight: 5.5, color, trim: '#3b3a38' }, features: [{ kind: 'canopy', side: 0, p: [8, 5, 0.5, 1, 1] }, { kind: 'sign', side: 0, text: name, color: pick(r, C.sign), p: [1] }, { kind: 'pergola', p: [1] }, { kind: 'antenna' }] });
  if (!m) return null;
  const props: Omit<Prop, 'y'>[] = [];
  for (const s of [-1, 1]) { const p = world(f, s * (w / 2 - 4), 3.5); props.push({ t: 'tree-palm', x: p[0], z: p[1], r: 0, s: 1.1 }); }
  const q = world(f, 0, 3.2); props.push({ t: 'fountain', x: q[0], z: q[1], r: 0, s: 0.8 });
  return { use: 'hotel', archetype: 'hotel', masses: [m], name, tags: ['commercial', 'hospitality'], fence: 'railing', gateU: w / 2 - 3, gateWidth: 7, props };
};

export const bank: Archetype = ({ f, rng: r }) => {
  if (f.width < 20 || f.depth < 18) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.8, 20, 34)), d = Math.min(f.depth - 8, scaled(r, f.depth, 0.55, 16, 24));
  const name = bizName('bank', r);
  const front = Math.min(7, Math.max(4, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: r.int(3, 5), fh: 3.8, roof: flat(1.0), facade: { tile: 'stone', bayWidth: 3.6, color: pick(r, ['#d8cfc0', '#c9bda9', '#bfb5a5']), trim: '#2b2b2b' }, features: [{ kind: 'portico', side: 0, p: [Math.min(12, w * 0.6), 3, 7.6, 4] }, { kind: 'flagpoles', side: 0, p: [2] }, { kind: 'sign', side: 0, text: name, color: pick(r, ['#1d5c8a', '#1f7a4d', '#b3261e']), p: [1] }] });
  if (!m) return null;
  return { use: 'bank', archetype: 'bank', masses: [m], name, tags: ['commercial', 'finance'], fence: 'railing', gateU: 0, gateWidth: 6 };
};

export const warehouse: Archetype = ({ f, rng: r }) => {
  if (f.width < 24 || f.depth < 26) return null;
  const w = Math.min(f.width - 8, scaled(r, f.width, 0.8, 28, 72)), d = Math.min(f.depth - 16, scaled(r, f.depth, 0.6, 20, 52));
  const name = bizName('industrial', r);
  const roofKind = r.next();
  const rc = { tile: r.chance(0.6) ? 'roof-zinc' : 'roof-metal', color: pick(r, [...C.zinc, ...C.roofGreen, '#8e949a']) };
  const roof: BuildingMass['roof'] = roofKind < 0.45 ? pitched('gable', rc, 0.18, 0.4) : roofKind < 0.75 ? { type: 'sawtooth', tile: rc.tile, pitch: 0.5, color: rc.color } : { type: 'barrel', tile: rc.tile, color: rc.color };
  const front = Math.min(14, Math.max(9, f.depth - d - 4));
  const m = placeMass(f, r.range(-0.1, 0.1) * (f.width - w), front + d / 2, w, d, { floors: 1, fh: r.range(7, 9.5), roof, facade: { tile: r.chance(0.5) ? 'panel-industrial' : 'warehouse', bayWidth: 5, color: pick(r, [...C.metal, '#9aa5b1', '#7c8a96', '#b8b2a8', '#6e7f8c']), trim: '#444' }, features: [{ kind: 'rollerdoor', side: 0, p: [r.int(2, 4)] }, { kind: 'loadingdock', side: 1 }, { kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }] });
  if (!m) return null;
  return { use: 'warehouse', archetype: 'warehouse', masses: [m], name, tags: ['industrial', 'logistics'], fence: 'fence', gateU: r.range(-0.3, 0.3) * f.width, gateWidth: 8, props: yardProps(f, r, front, w) };
};

export function yardProps(f: Frame, r: RNG, front: number, w: number): Omit<Prop, 'y'>[] {
  const props: Omit<Prop, 'y'>[] = [];
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) { const p = world(f, -w / 2 + 4 + i * 7, front / 2 + r.range(-1, 1)); props.push({ t: 'truck', x: p[0], z: p[1], r: f.rot + Math.PI / 2 + r.range(-0.1, 0.1), v: r.int(0, 3) }); }
  const c = r.int(0, 4);
  for (let i = 0; i < c; i++) { const p = world(f, w / 2 - 4 - i * 3.2, front / 2 - 1); props.push({ t: 'container', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5), p: [r.chance(0.3) ? 2 : 1] }); }
  return props;
}

export const factory: Archetype = ({ f, rng: r }) => {
  if (f.width < 36 || f.depth < 36) return null;
  const w = Math.min(f.width - 10, scaled(r, f.width, 0.8, 34, 72)), d = Math.min(f.depth - 24, scaled(r, f.depth, 0.5, 24, 50));
  const name = bizName('industrial', r);
  const rc = { tile: 'roof-zinc', color: pick(r, [...C.zinc, ...C.roofGreen]) };
  const front = Math.min(16, Math.max(12, f.depth - d - 10));
  const officeBlock = placeMass(f, -w / 2 + 9, front - 4, 16, 9, { floors: 2, fh: 3.4, roof: flat(0.8), facade: { tile: 'concrete-grid', bayWidth: 3.4, color: pick(r, C.concrete), trim: '#333' }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }, { kind: 'flagpoles', side: 0, p: [1] }], noShrink: true });
  const hall = placeMass(f, 0, front + d / 2, w, d, { floors: 1, fh: r.range(8, 11), roof: r.chance(0.5) ? { type: 'sawtooth', tile: rc.tile, pitch: 0.5, color: rc.color } : pitched('gable', rc, 0.16, 0.4), facade: { tile: 'panel-industrial', bayWidth: 4, color: pick(r, [...C.metal, '#7c8a96', '#8c7f73']), trim: '#444' }, features: [{ kind: 'stack', p: [r.range(18, 30), 1] }, { kind: 'rollerdoor', side: 0, p: [2] }, { kind: 'loadingdock', side: 3 }, { kind: 'clerestory', p: [0.6] }, { kind: 'tank', p: [2] }] });
  if (!hall) return null;
  const masses = officeBlock ? [officeBlock, hall] : [hall];
  return { use: 'factory', archetype: 'factory', masses, name, tags: ['industrial', 'manufacturing'], fence: 'fence', gateU: w / 4, gateWidth: 9, props: yardProps(f, r, front, w) };
};

export const workshop: Archetype = ({ f, rng: r }) => {
  if (f.width < 9 || f.depth < 9) return null;
  const w = Math.min(f.width - 1.5, scaled(r, f.width, 0.85, 10, 24)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.6, 9, 16));
  const name = bizName('workshop', r);
  const front = Math.min(7, Math.max(4, f.depth - d - 2));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: 1, fh: 4.4, roof: pitched('shed', { tile: 'roof-zinc-rust', color: pick(r, C.zinc) }, 0.2, 0.5), facade: { tile: r.chance(0.5) ? 'zinc-wall' : 'block-win', bayWidth: 4, groundTile: 'garage-door', groundHeight: 4.4, color: pick(r, [...C.plasterColour, ...C.metal]), trim: '#444' }, features: [{ kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }] });
  if (!m) return null;
  const props: Omit<Prop, 'y'>[] = [];
  for (let i = 0; i < r.int(1, 3); i++) { const p = world(f, r.range(-w / 2 + 2, w / 2 - 2), front / 2 + r.range(-1, 1)); props.push({ t: 'car', x: p[0], z: p[1], r: f.rot + r.range(-0.5, 0.5), v: r.int(0, 7) }); }
  return { use: 'workshop', archetype: 'workshop', masses: [m], name, tags: ['industrial', 'repair'], fence: r.chance(0.5) ? 'fence' : null, gateU: 0, gateWidth: 6, props };
};

export const fuelStation: Archetype = ({ f, rng: r }) => {
  if (f.width < 22 || f.depth < 18) return null;
  const brand = pick(r, ['#1f7a4d', '#b3261e', '#d98a1f', '#1d5c8a', '#e0b323']);
  const name = `${pick(r, FAMILY_NAMES)} ${pick(r, BUSINESS_WORDS.fuel)}`;
  const canopy = placeMass(f, 0, 9, Math.min(f.width - 6, 22), 13, { floors: 1, fh: 5.4, roof: flat(0.9, 'roof-membrane'), facade: { tile: 'open', bayWidth: 4, color: brand, trim: brand }, features: [{ kind: 'columns', side: 0, p: [4, 5.4, 0, 1] }, { kind: 'sign', side: 0, text: name, color: brand }], noShrink: true });
  if (!canopy) return null;
  const kiosk = placeMass(f, 0, Math.min(f.depth - 5, 22), Math.min(f.width - 6, 14), 7, { floors: 1, fh: 3.6, roof: flat(0.6), facade: { tile: 'shopfront', bayWidth: 5, color: '#e8e2d6', trim: brand }, features: [{ kind: 'sign', side: 0, text: 'MART', color: brand }] });
  const props: Omit<Prop, 'y'>[] = [];
  for (const cu of [-5, 0, 5]) { const p = world(f, cu, 9); props.push({ t: 'pump', x: p[0], z: p[1], r: f.rot, c: brand }); }
  const b = world(f, -f.width / 2 + 3, 2); props.push({ t: 'billboard', x: b[0], z: b[1], r: f.rot, v: 1, c: brand, text: name });
  return { use: 'fuel-station', archetype: 'fuel-station', masses: kiosk ? [canopy, kiosk] : [canopy], name, tags: ['commercial', 'fuel'], fence: null, gateU: 0, props };
};

// ─────────────────────────── civic ───────────────────────────
export const school: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 30 || f.depth < 28) return null;
  const name = `${pick(r, [...PLACE_WORDS, ...FAMILY_NAMES])} ${pick(r, BUSINESS_WORDS.school)}`;
  const color = pick(r, ['#efe6d6', '#f1d4a8', '#e3c0a0', '#dfe6e2']);
  const trim = pick(r, ['#1f7a4d', '#1d5c8a', '#b3261e', '#d98a1f']);
  const w = Math.min(f.width - 8, r.range(32, 46));
  const a = placeMass(f, 0, 8 + 4.5, w, 9, { floors: 2, fh: 3.3, roof: pitched('gable', { tile: 'roof-zinc', color: pick(r, C.roofRed) }, 0.3, 0.6), facade: { tile: 'school', bayWidth: 3.6, color, trim }, features: [{ kind: 'sign', side: 0, text: name, color: trim }, { kind: 'flagpoles', side: 0, p: [1] }, { kind: 'veranda', side: 2, p: [2] }] });
  if (!a) return null;
  const b = placeMass(f, -w / 2 + 4.5, 8 + 9 + 2 + 9, 9, Math.min(f.depth - 32, 18), { floors: 2, fh: 3.3, roof: pitched('gable', { tile: 'roof-zinc', color: pick(r, C.roofRed) }, 0.3, 0.6), facade: { tile: 'school', bayWidth: 3.6, color, trim }, features: [{ kind: 'veranda', side: 1, p: [2] }], minD: 9 });
  const masses = b ? [a, b] : [a];
  const props: Omit<Prop, 'y'>[] = [];
  if (f.depth > 48 && f.width > 40) { const fieldC = world(f, 6, 8 + 9 + 2 + Math.min(f.depth - 32, 18) / 2 + 2); props.push({ t: 'goalpost', x: fieldC[0], z: fieldC[1], r: f.rot, p: [Math.min(f.width - 16, 36), Math.min(f.depth - 36, 22)] }); }
  return { use: 'school', archetype: 'school', masses, name, tags: ['civic', 'education'], fence: 'wall', gateU: w / 2 - 5, gateWidth: 5, props };
};

export const clinic: Archetype = ({ f, rng: r }) => {
  if (f.width < 16 || f.depth < 16) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.75, 16, 30)), d = Math.min(f.depth - 8, scaled(r, f.depth, 0.5, 12, 18));
  const name = `${pick(r, [...PLACE_WORDS, ...FAMILY_NAMES])} ${pick(r, BUSINESS_WORDS.clinic)}`;
  const front = Math.min(7, Math.max(4, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: r.int(2, 3), fh: 3.4, roof: flat(0.9), facade: { tile: 'hospital', bayWidth: 3.6, color: pick(r, ['#f4f1ea', '#e8f0ea', '#efe6d6']), trim: '#1f7a4d' }, features: [{ kind: 'cross', side: 0 }, { kind: 'canopy', side: 0, p: [3, 3.4, 0.3] }, { kind: 'sign', side: 0, text: name, color: '#1f7a4d' }, { kind: 'rooftank', p: [2] }] });
  if (!m) return null;
  return { use: 'clinic', archetype: 'clinic', masses: [m], name, tags: ['civic', 'health'], fence: 'railing', gateU: w / 2 - 4, gateWidth: 5 };
};

export const church: Archetype = ({ f, rng: r }) => {
  if (f.width < 16 || f.depth < 24) return null;
  const w = Math.min(f.width - 5, scaled(r, f.width, 0.6, 12, 20)), d = Math.min(f.depth - 8, scaled(r, f.depth, 0.6, 22, 34));
  const name = `${pick(r, ['St. Peter', 'St. Mary', 'Holy Trinity', 'Christ', 'Grace', 'Emmanuel', 'All Saints', 'St. Michael'])} ${pick(r, BUSINESS_WORDS.church)}`;
  const color = pick(r, ['#efe6d6', '#f0e4d0', '#dcd3c2', '#e3d9c5']);
  const front = Math.min(7, Math.max(4, f.depth - d - 3));
  const nave = placeMass(f, 0, front + d / 2, w, d, { floors: 1, fh: 7.5, roof: pitched('gable', { tile: 'roof-metal', color: pick(r, [...C.roofRed, ...C.roofBrown]) }, 0.62, 0.5), facade: { tile: 'church', bayWidth: 3.2, color, trim: '#5a4a3a' }, features: [{ kind: 'cross', p: [1] }, { kind: 'arch', side: 0, p: [3, 4.5] }] });
  if (!nave) return null;
  const tower = placeMass(f, -w / 2 + 2.2, front + 2.2, 4.4, 4.4, { floors: 1, fh: 17 + r.range(0, 6), roof: pitched('hip', { tile: 'roof-metal', color: '#5f4030' }, 1.4, 0.3), facade: { tile: 'stone', bayWidth: 3.6, color, trim: '#5a4a3a' }, features: [{ kind: 'spire', p: [6] }], noShrink: true });
  return { use: 'church', archetype: 'church', masses: tower ? [nave, tower] : [nave], name, tags: ['civic', 'religious'], fence: 'railing', gateU: 0, gateWidth: 6 };
};

export const mosque: Archetype = ({ f, rng: r }) => {
  if (f.width < 22 || f.depth < 22) return null;
  const w = Math.min(f.width - 8, scaled(r, f.width, 0.7, 20, 32)), d = Math.min(f.depth - 10, scaled(r, f.depth, 0.6, 18, 28));
  const name = `${pick(r, [...FAMILY_NAMES, ...PLACE_WORDS])} ${pick(r, BUSINESS_WORDS.mosque)}`;
  const color = pick(r, ['#f4f1ea', '#efe6d6', '#e8f0ea', '#d9e4d0']);
  const green = pick(r, ['#2e7d5b', '#1f7a4d', '#3a8f6a', '#c5a45e']);
  const front = Math.min(9, Math.max(6, f.depth - d - 4));
  const hall = placeMass(f, 0, front + d / 2, w, d, { floors: 1, fh: 6.5, roof: { type: 'dome', tile: 'roof-metal', color: green }, facade: { tile: 'plaster-arch', bayWidth: 3.4, groundTile: 'arcade', groundHeight: 4.2, color, trim: green }, features: [{ kind: 'minaret', p: [Math.min(26, w * 1.2), 0] }, { kind: 'minaret', p: [Math.min(26, w * 1.2), 1] }, { kind: 'crescent' }] });
  if (!hall) return null;
  return { use: 'mosque', archetype: 'mosque', masses: [hall], name, tags: ['civic', 'religious'], fence: 'wall', gateU: 0, gateWidth: 6 };
};

export const community: Archetype = ({ f, rng: r }) => {
  if (f.width < 16 || f.depth < 14) return null;
  const w = Math.min(f.width - 4, scaled(r, f.width, 0.75, 16, 28)), d = Math.min(f.depth - 6, scaled(r, f.depth, 0.5, 12, 18));
  const name = `${pick(r, [...PLACE_WORDS, ...FAMILY_NAMES])} ${pick(r, BUSINESS_WORDS.community)}`;
  const front = Math.min(6, Math.max(3, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: r.int(1, 2), fh: 4, roof: pitched('hip', { tile: 'roof-metal', color: pick(r, C.roofGreen) }, 0.3, 0.8), facade: { tile: 'plaster-arch', bayWidth: 3.4, color: pick(r, C.plaster), trim: pick(r, C.trim) }, features: [{ kind: 'portico', side: 0, p: [Math.min(10, w * 0.5), 2.6, 4.2, 4] }, { kind: 'sign', side: 0, text: name, color: pick(r, C.sign) }] });
  if (!m) return null;
  return { use: 'community', archetype: 'community-hall', masses: [m], name, tags: ['civic', 'community'], fence: 'railing', gateU: 0, gateWidth: 5 };
};

export const construction: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 18 || f.depth < 18) return null;
  const w = Math.min(f.width - 6, scaled(r, f.width, 0.7, 18, 34)), d = Math.min(f.depth - 8, scaled(r, f.depth, 0.5, 14, 24));
  const floors = district === 'CD' ? r.int(6, 14) : r.int(2, 4);
  const front = Math.min(6, Math.max(4, f.depth - d - 3));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors, fh: 3.4, roof: { type: 'flat', tile: 'roof-concrete', parapet: 0 }, facade: { tile: 'frame', bayWidth: 4, color: '#b8b2a8', trim: '#888' }, features: [{ kind: 'pitchlights', p: [0] }] });
  if (!m) return null;
  const props: Omit<Prop, 'y'>[] = [];
  const cr = world(f, w / 2 + 2.5, front + d / 2); props.push({ t: 'crane', x: cr[0], z: cr[1], r: f.rot + r.range(0, 6.28), p: [floors * 3.4 + 12, Math.max(18, w * 0.8)] });
  const sh = world(f, -w / 2 + 2, 2.5); props.push({ t: 'sandheap', x: sh[0], z: sh[1], r: 0, s: r.range(0.8, 1.3) });
  const sc = world(f, 0, front - 1.2); props.push({ t: 'scaffold', x: sc[0], z: sc[1], r: f.rot, p: [Math.min(w, 16), Math.min(floors, 4) * 3.4] });
  const ct = world(f, w / 2 - 4, 2.5); props.push({ t: 'container', x: ct[0], z: ct[1], r: f.rot, v: 2 });
  return { use: 'construction', archetype: 'construction-site', masses: [m], name: 'Construction Site', tags: ['construction'], fence: 'fence', gateU: -w / 3, gateWidth: 6, props };
};

export const kioskRow: Archetype = ({ f, rng: r }) => {
  // tiny parcels: a kiosk or two (rendered as props)
  if (f.width < 3 || f.depth < 3) return null;
  return null;
};

/** one/two-room cottage: last-resort residential infill for very small or irregular parcels */
export const cottage: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 6.5 || f.depth < 7) return null;
  const w = Math.min(f.width - 1, scaled(r, f.width, 0.75, 6, 10)), d = Math.min(f.depth - 2, scaled(r, f.depth, 0.5, 5.5, 9));
  const rc = roofColor(r, district); const color = wallColor(r, district);
  const front = Math.min(4, Math.max(1.2, f.depth - d - 2));
  const m = placeMass(f, 0, front + d / 2, w, d, { floors: r.chance(0.2) ? 2 : 1, fh: 2.9, roof: pitched(r.chance(0.6) ? 'gable' : 'hip', rc, 0.42, 0.6), facade: { tile: r.chance(0.5) ? 'plaster-louvre' : 'block-win', bayWidth: 3.2, color, trim: pick(r, C.trim) }, features: [...tankFeature(r, 0.3)], minW: 5.5, minD: 5 });
  if (!m) return null;
  return { use: 'house', archetype: 'cottage', masses: [m], name: '', tags: ['residential', 'infill'], fence: r.chance(0.5) ? 'wall' : null, gateU: r.range(-0.3, 0.3) * f.width };
};

/** kiosk / lock-up shop row for tiny commercial frontages */
export const kioskShop: Archetype = ({ f, rng: r, district }) => {
  if (f.width < 4.5 || f.depth < 4.5) return null;
  const w = Math.min(f.width - 0.6, scaled(r, f.width, 0.9, 4, 12)), d = Math.min(f.depth - 1, scaled(r, f.depth, 0.6, 3.5, 7));
  const color = wallColor(r, district);
  const m = placeMass(f, 0, 0.6 + d / 2, w, d, { floors: 1, fh: 3.0, roof: pitched('shed', { tile: 'roof-zinc', color: pick(r, C.zinc) }, 0.15, 0.5), facade: { tile: 'shopfront-shutter', bayWidth: 3, color, trim: pick(r, C.trim) }, features: [{ kind: 'awning', side: 0, p: [1.2], color: pick(r, ['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a']) }, { kind: 'sign', side: 0, text: bizName('shop', r), color: pick(r, C.sign) }], minW: 3.5, minD: 3 });
  if (!m) return null;
  return { use: 'kiosk', archetype: 'lockup-shops', masses: [m], name: bizName('shop', r), tags: ['commercial', 'retail', 'infill'], fence: null, gateU: 0 };
};

export const ARCHETYPES = { cottage, kioskShop, bungalow, duplex, villa, mansion, terrace, semi, courtyardHouse, apartments, residentialTower, shophouse, shop, restaurant, supermarket, office, officeTower, hotel, bank, warehouse, factory, workshop, fuelStation, school, clinic, church, mosque, community, construction };
export { area };
