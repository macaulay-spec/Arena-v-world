/** Building meshes: walls (atlas-tiled per bay/floor), plinths, roofs, parapets and the feature kit (balconies, canopies, porticos, tanks, …). */
import * as THREE from 'three';
import type { CityData, Building, BuildingMass, MassFeature, Vec2 } from '../../shared/types';
import { AtlasBuilder, ColorBuilder, type V3 } from '../geom';
import { TextBuilder, type TextAtlas } from '../signs';
import type { ChunkSet } from './chunks';
import type { WorldBase } from './terrain';
import { RNG } from '../../shared/rng';

export interface BuildingBuild { atlas: ChunkSet<AtlasBuilder>; color: ChunkSet<ColorBuilder>; text: ChunkSet<TextBuilder>; textAtlas: TextAtlas; }

const C = (h: string) => new THREE.Color(h);
const ROOF_DEFAULT: Record<string, string> = { 'roof-concrete': '#b9b3a7', 'roof-gravel': '#a9a49a', 'roof-zinc': '#9ea4a8', 'roof-zinc-rust': '#8f6a52', 'roof-tile': '#9c4f3a', 'roof-membrane': '#cfcac0', 'roof-metal': '#6f7f86' };
const DARK = C('#2a2a2a'), WHITE = C('#f2f2f0'), GLASS = C('#9fc3d6'), STEEL = C('#8e959b'), BLACK = C('#161616'), CONC = C('#b5afa4'), GOLD = C('#d9b24a');

interface Frame { m: BuildingMass; c: number; s: number; hw: number; hd: number; W: (lx: number, y: number, lz: number) => V3; N: (side: number) => Vec2; top: number; base: number; }

export function buildBuildings(city: CityData, base: WorldBase, out: BuildingBuild) {
  const rng = new RNG('render-buildings');
  city.buildings.forEach((b, bi) => {
    const id = bi + 1;
    for (let mi = 0; mi < b.masses.length; mi++) buildMass(b, b.masses[mi], mi, id, out, rng.fork(b.id + ':' + mi), base);
  });
}

function frameOf(m: BuildingMass): Frame {
  const c = Math.cos(m.rot), s = Math.sin(m.rot);
  const hw = m.w / 2, hd = m.d / 2;
  const W = (lx: number, y: number, lz: number): V3 => [m.x + lx * c - lz * s, y, m.z + lx * s + lz * c];
  const N = (side: number): Vec2 => side === 0 ? [s, -c] : side === 1 ? [c, s] : side === 2 ? [-s, c] : [-c, -s];
  const top = m.baseY + m.floors * m.floorHeight;
  return { m, c, s, hw, hd, W, N, top, base: m.baseY };
}

/** side segment in local coords: returns [ax, az, bx, bz] from the viewer's left to right when looking at the face from outside */
function sideSeg(f: Frame, side: number, inset = 0): [number, number, number, number] {
  const hw = f.hw - inset, hd = f.hd - inset;
  switch (side) {
    case 0: return [hw, -hd, -hw, -hd];   // front (local -z), viewer looks along +z: +x is on the left
    case 1: return [hw, hd, hw, -hd];     // right (+x), viewer looks along -x: +z on the left
    case 2: return [-hw, hd, hw, hd];     // back (+z), viewer looks along -z: -x on the left
    default: return [-hw, -hd, -hw, hd];  // left (-x), viewer looks along +x: -z on the left
  }
}
function sideLen(f: Frame, side: number) { return side % 2 === 0 ? f.m.w : f.m.d; }

function buildMass(b: Building, m: BuildingMass, mi: number, id: number, out: BuildingBuild, r: RNG, base: WorldBase) {
  const f = frameOf(m);
  const A = out.atlas.get(m.x, m.z), K = out.color.get(m.x, m.z), T = out.text.get(m.x, m.z);
  const facadeColor = C(m.facade.color);
  const trimColor = C(m.facade.trim ?? '#444444');
  const lit = r.range(0.35, 1);
  const open = m.facade.tile === 'open', frame = m.facade.tile === 'frame';
  const gh = m.facade.groundTile ? Math.min(m.facade.groundHeight ?? m.floorHeight, f.top - f.base - 0.5) : 0;
  const fh = m.floorHeight;

  // ── plinth ──
  if (m.plinthBottom < m.baseY - 0.01 && !open) {
    const pc = facadeColor.clone().multiplyScalar(0.72);
    for (let side = 0; side < 4; side++) {
      const [ax, az, bx, bz] = sideSeg(f, side, -0.05);
      A.quad(f.W(ax, m.plinthBottom - 0.6, az), f.W(bx, m.plinthBottom - 0.6, bz), f.W(bx, m.baseY + 0.02, bz), f.W(ax, m.baseY + 0.02, az), 'concrete-plain', 0, 1, sideLen(f, side) / 4, 0, pc, 0, id);
    }
  }

  // ── walls ──
  if (!open && !frame) {
    for (let side = 0; side < 4; side++) {
      const [ax, az, bx, bz] = sideSeg(f, side);
      const len = sideLen(f, side);
      const bays = Math.max(1, Math.round(len / m.facade.bayWidth));
      if (gh > 0) {
        const gTile = m.facade.groundTile!;
        const useGround = side === 0 || (side === 2 && (gTile === 'colonnade' || gTile === 'arcade')) || len > 30 && side !== 2 && gTile !== 'garage-door';
        const tile = useGround ? gTile : m.facade.tile === 'glass-curtain' || m.facade.tile === 'glass-dark' || m.facade.tile === 'glass-green' ? m.facade.tile : 'plaster-plain';
        const gBays = Math.max(1, Math.round(len / (tile === 'colonnade' || tile === 'arcade' ? 5 : m.facade.bayWidth)));
        A.quad(f.W(ax, f.base, az), f.W(bx, f.base, bz), f.W(bx, f.base + gh, bz), f.W(ax, f.base + gh, az), tile, 0, 1, gBays, 0, facadeColor, lit, id);
        const upperH = f.top - f.base - gh;
        const rows = Math.max(1, Math.round(upperH / fh));
        A.quad(f.W(ax, f.base + gh, az), f.W(bx, f.base + gh, bz), f.W(bx, f.top, bz), f.W(ax, f.top, az), m.facade.tile, 0, rows, bays, 0, facadeColor, lit, id);
      } else {
        A.quad(f.W(ax, f.base, az), f.W(bx, f.base, bz), f.W(bx, f.top, bz), f.W(ax, f.top, az), m.facade.tile, 0, m.floors, bays, 0, facadeColor, lit, id);
      }
    }
    // string course between ground floor and upper floors
    if (gh > 0) ledge(A, f, f.base + gh, 0.25, 0.3, trimColor, id);
  }
  if (frame) {
    // concrete frame: slabs per floor + columns at bay spacing, no walls (stadium stands)
    for (let i = 0; i <= m.floors; i++) {
      const y = f.base + i * fh;
      slab(A, f, y - (i === 0 ? 0 : 0.35), y, 'concrete-plain', facadeColor, id, 0);
    }
    for (let side = 0; side < 4; side++) {
      const [ax, az, bx, bz] = sideSeg(f, side, 0.3); const len = sideLen(f, side); const n = Math.max(2, Math.round(len / m.facade.bayWidth));
      for (let i = 0; i <= n; i++) { const t = i / n; const lx = ax + (bx - ax) * t, lz = az + (bz - az) * t; const p = f.W(lx, 0, lz); K.box(p[0], (f.base + f.top) / 2, p[2], 0.5, f.top - f.base, 0.5, facadeColor, 0, 0, -m.rot); }
    }
  }

  // ── roof ──
  buildRoof(A, K, f, facadeColor, trimColor, id, r);

  // ── features ──
  for (const ft of m.features) buildFeature(ft, f, A, K, T, out.textAtlas, facadeColor, trimColor, id, r, b, mi, gh);
  if (open) {
    // canopy slab for open structures (fuel station): roof already built as a slab; add fascia colour band
    ledge(A, f, f.top - 0.9, 0.9, 0.1, facadeColor, id);
  }
  void base;
}

/** horizontal band protruding `depth` from all faces, `h` tall, at height y (bottom) */
function ledge(A: AtlasBuilder, f: Frame, y: number, h: number, depth: number, color: THREE.Color, id: number) {
  for (let side = 0; side < 4; side++) {
    const [ax, az, bx, bz] = sideSeg(f, side, -depth); const len = sideLen(f, side) + depth * 2;
    A.quad(f.W(ax, y, az), f.W(bx, y, bz), f.W(bx, y + h, bz), f.W(ax, y + h, az), 'concrete-plain', 0, 1, len / 4, 0, color, 0, id);
  }
  slab(A, f, y, y + h, 'concrete-plain', color, id, -depth, true);
}

/** flat slab covering the footprint (inset negative = outset); top face always, bottom face optional */
function slab(A: AtlasBuilder, f: Frame, y0: number, y1: number, tile: string, color: THREE.Color, id: number, inset = 0, bottom = false) {
  const hw = f.hw - inset, hd = f.hd - inset;
  A.quadUp(f.W(-hw, y1, -hd), f.W(hw, y1, -hd), f.W(hw, y1, hd), f.W(-hw, y1, hd), tile, color, 4, id);
  if (bottom) A.quadUp(f.W(-hw, y0, -hd), f.W(hw, y0, -hd), f.W(hw, y0, hd), f.W(-hw, y0, hd), tile, color, 4, id, [0, -1, 0]);
  if (y1 - y0 > 0.01 && inset !== 0) {
    for (let side = 0; side < 4; side++) {
      const [ax, az, bx, bz] = sideSeg(f, side, inset); const len = sideLen(f, side) - inset * 2;
      A.quad(f.W(ax, y0, az), f.W(bx, y0, bz), f.W(bx, y1, bz), f.W(ax, y1, az), 'concrete-plain', 0, 1, len / 4, 0, color, 0, id);
    }
  }
}

function buildRoof(A: AtlasBuilder, K: ColorBuilder, f: Frame, facadeColor: THREE.Color, trimColor: THREE.Color, id: number, r: RNG) {
  const m = f.m; const roof = m.roof;
  const rc = C(roof.color ?? ROOF_DEFAULT[roof.tile] ?? '#b0aaa0');
  const top = f.top;
  const pitch = roof.pitch ?? 0.35, over = roof.overhang ?? 0.5;
  const longX = m.w >= m.d;
  const short = Math.min(m.w, m.d);
  switch (roof.type) {
    case 'flat': case 'parapet': {
      const par = roof.parapet ?? 0.6;
      if (m.facade.tile === 'open') {
        // thick slab canopy
        slab(A, f, top - 0.9, top, roof.tile, rc, id, 0, true);
        for (let side = 0; side < 4; side++) { const [ax, az, bx, bz] = sideSeg(f, side); A.quad(f.W(ax, top - 0.9, az), f.W(bx, top - 0.9, bz), f.W(bx, top, bz), f.W(ax, top, az), 'concrete-plain', 0, 1, sideLen(f, side) / 4, 0, facadeColor, 0, id); }
        break;
      }
      const inset = par > 0 ? 0.3 : 0;
      A.quadUp(f.W(-f.hw + inset, top + 0.05, -f.hd + inset), f.W(f.hw - inset, top + 0.05, -f.hd + inset), f.W(f.hw - inset, top + 0.05, f.hd - inset), f.W(-f.hw + inset, top + 0.05, f.hd - inset), roof.tile, rc, 4, id);
      if (par > 0) {
        for (let side = 0; side < 4; side++) {
          const [ax, az, bx, bz] = sideSeg(f, side); const len = sideLen(f, side);
          A.quad(f.W(ax, top, az), f.W(bx, top, bz), f.W(bx, top + par, bz), f.W(ax, top + par, az), 'plaster-plain', 0, 1, len / 4, 0, facadeColor, 0, id);
          const [ix, iz, jx, jz] = sideSeg(f, side, inset);
          A.quad(f.W(jx, top, jz), f.W(ix, top, iz), f.W(ix, top + par, iz), f.W(jx, top + par, jz), 'plaster-plain', 0, 1, len / 4, 0, facadeColor, 0, id);
          A.quadUp(f.W(ax, top + par, az), f.W(bx, top + par, bz), f.W(jx, top + par, jz), f.W(ix, top + par, iz), 'concrete-plain', trimColor.clone().lerp(WHITE, 0.6), 4, id);
        }
      } else {
        ledge(A, f, top - 0.2, 0.25, 0.15, trimColor, id);
      }
      break;
    }
    case 'gable': {
      const rise = pitch * short / 2;
      const hwE = f.hw + over, hdE = f.hd + over; const eaveY = top - over * pitch;
      if (longX) {
        A.quadFacing(f.W(-hwE, eaveY, -hdE), f.W(hwE, eaveY, -hdE), f.W(hwE, top + rise, 0), f.W(-hwE, top + rise, 0), roof.tile, 0, (f.hd + over) / 2, m.w / 2, 0, rc, 0, id, [0, 1, 0]);
        A.quadFacing(f.W(hwE, eaveY, hdE), f.W(-hwE, eaveY, hdE), f.W(-hwE, top + rise, 0), f.W(hwE, top + rise, 0), roof.tile, 0, (f.hd + over) / 2, m.w / 2, 0, rc, 0, id, [0, 1, 0]);
        // gable ends
        for (const sx of [-1, 1]) {
          const x = f.hw * sx;
          const p0 = f.W(x, top, -f.hd), p1 = f.W(x, top, f.hd), p2 = f.W(x, top + rise, 0);
          A.triFacing(p0, p1, p2, [0, 1], [1, 1], [0.5, 0], 'plaster-plain', facadeColor, 0, id, [f.c * sx, 0, f.s * sx]);
        }
        // barge boards / underside
        for (const sz of [-1, 1]) { const z = hdE * sz; A.quadUp(f.W(-hwE, eaveY - 0.02, z), f.W(hwE, eaveY - 0.02, z), f.W(hwE, top - 0.02, f.hd * sz), f.W(-hwE, top - 0.02, f.hd * sz), 'plaster-plain', trimColor, 2, id, [0, -1, 0]); }
      } else {
        A.quadFacing(f.W(-hdE * 0 - hwE, eaveY, -hdE), f.W(-hwE, eaveY, hdE), f.W(0, top + rise, hdE), f.W(0, top + rise, -hdE), roof.tile, 0, (f.hw + over) / 2, m.d / 2, 0, rc, 0, id, [0, 1, 0]);
        A.quadFacing(f.W(hwE, eaveY, hdE), f.W(hwE, eaveY, -hdE), f.W(0, top + rise, -hdE), f.W(0, top + rise, hdE), roof.tile, 0, (f.hw + over) / 2, m.d / 2, 0, rc, 0, id, [0, 1, 0]);
        for (const sz of [-1, 1]) {
          const z = f.hd * sz;
          const p0 = f.W(-f.hw, top, z), p1 = f.W(f.hw, top, z), p2 = f.W(0, top + rise, z);
          A.triFacing(p0, p1, p2, [0, 1], [1, 1], [0.5, 0], 'plaster-plain', facadeColor, 0, id, [-f.s * sz, 0, f.c * sz]);
        }
        for (const sx of [-1, 1]) { const x = hwE * sx; A.quadUp(f.W(x, eaveY - 0.02, -hdE), f.W(x, eaveY - 0.02, hdE), f.W(f.hw * sx, top - 0.02, hdE), f.W(f.hw * sx, top - 0.02, -hdE), 'plaster-plain', trimColor, 2, id, [0, -1, 0]); }
      }
      break;
    }
    case 'hip': {
      const rise = pitch * short / 2;
      const hwE = f.hw + over, hdE = f.hd + over; const eaveY = top - over * pitch;
      const ridgeHalf = Math.max(0, (Math.max(m.w, m.d) - short) / 2);
      const R0: V3 = longX ? f.W(-ridgeHalf, top + rise, 0) : f.W(0, top + rise, -ridgeHalf);
      const R1: V3 = longX ? f.W(ridgeHalf, top + rise, 0) : f.W(0, top + rise, ridgeHalf);
      const e0 = f.W(-hwE, eaveY, -hdE), e1 = f.W(hwE, eaveY, -hdE), e2 = f.W(hwE, eaveY, hdE), e3 = f.W(-hwE, eaveY, hdE);
      const uvS = 2;
      if (longX) {
        A.quadFacing(e0, e1, R1, R0, roof.tile, 0, hdE / uvS, m.w / uvS, 0, rc, 0, id, [0, 1, 0]);
        A.quadFacing(e2, e3, R0, R1, roof.tile, 0, hdE / uvS, m.w / uvS, 0, rc, 0, id, [0, 1, 0]);
        A.triFacing(e1, e2, R1, [0, 1], [1, 1], [0.5, 0], roof.tile, rc, 0, id, [0, 1, 0]);
        A.triFacing(e3, e0, R0, [0, 1], [1, 1], [0.5, 0], roof.tile, rc, 0, id, [0, 1, 0]);
      } else {
        A.quadFacing(e3, e0, R0, R1, roof.tile, 0, hwE / uvS, m.d / uvS, 0, rc, 0, id, [0, 1, 0]);
        A.quadFacing(e1, e2, R1, R0, roof.tile, 0, hwE / uvS, m.d / uvS, 0, rc, 0, id, [0, 1, 0]);
        A.triFacing(e0, e1, R0, [0, 1], [1, 1], [0.5, 0], roof.tile, rc, 0, id, [0, 1, 0]);
        A.triFacing(e2, e3, R1, [0, 1], [1, 1], [0.5, 0], roof.tile, rc, 0, id, [0, 1, 0]);
      }
      // soffit ring
      A.quadUp(e0, e1, f.W(f.hw, top - 0.02, -f.hd), f.W(-f.hw, top - 0.02, -f.hd), 'plaster-plain', trimColor, 2, id, [0, -1, 0]);
      A.quadUp(e1, e2, f.W(f.hw, top - 0.02, f.hd), f.W(f.hw, top - 0.02, -f.hd), 'plaster-plain', trimColor, 2, id, [0, -1, 0]);
      A.quadUp(e2, e3, f.W(-f.hw, top - 0.02, f.hd), f.W(f.hw, top - 0.02, f.hd), 'plaster-plain', trimColor, 2, id, [0, -1, 0]);
      A.quadUp(e3, e0, f.W(-f.hw, top - 0.02, -f.hd), f.W(-f.hw, top - 0.02, f.hd), 'plaster-plain', trimColor, 2, id, [0, -1, 0]);
      break;
    }
    case 'shed': {
      const rise = pitch * m.d;
      const hwE = f.hw + over, hdE = f.hd + over;
      // low at the front (−z), high at the back (+z)
      const y0 = top - over * pitch, y1 = top + rise + over * pitch;
      A.quadFacing(f.W(-hwE, y0, -hdE), f.W(hwE, y0, -hdE), f.W(hwE, y1, hdE), f.W(-hwE, y1, hdE), roof.tile, 0, m.d / 2, m.w / 2, 0, rc, 0, id, [0, 1, 0]);
      // side triangles and the raised back wall
      for (const sx of [-1, 1]) {
        const x = f.hw * sx; const p0 = f.W(x, top, -f.hd), p1 = f.W(x, top, f.hd), p2 = f.W(x, top + rise, f.hd);
        A.triFacing(p0, p1, p2, [0, 1], [1, 1], [1, 0], 'plaster-plain', facadeColor, 0, id, [f.c * sx, 0, f.s * sx]);
      }
      const [ax, az, bx, bz] = sideSeg(f, 2);
      A.quadFacing(f.W(ax, top, az), f.W(bx, top, bz), f.W(bx, top + rise, bz), f.W(ax, top + rise, az), 'plaster-plain', 0, 1, m.w / 4, 0, facadeColor, 0, id, [-f.s, 0, f.c]);
      A.quadUp(f.W(-hwE, y0 - 0.02, -hdE), f.W(hwE, y0 - 0.02, -hdE), f.W(f.hw, top - 0.02, -f.hd), f.W(-f.hw, top - 0.02, -f.hd), 'plaster-plain', trimColor, 2, id, [0, -1, 0]);
      break;
    }
    case 'sawtooth': {
      const tw = 6; const n = Math.max(1, Math.round(m.w / tw)); const w = m.w / n; const rise = pitch * w * 0.7;
      for (let i = 0; i < n; i++) {
        const x0 = -f.hw + i * w, x1 = x0 + w * 0.72, x2 = x0 + w;
        A.quadFacing(f.W(x0, top, -f.hd), f.W(x0, top, f.hd), f.W(x1, top + rise, f.hd), f.W(x1, top + rise, -f.hd), roof.tile, 0, m.d / 2, w / 2, 0, rc, 0, id, [0, 1, 0]);
        A.quadFacing(f.W(x2, top, f.hd), f.W(x2, top, -f.hd), f.W(x1, top + rise, -f.hd), f.W(x1, top + rise, f.hd), 'glass-dark', 0, 1, m.d / 3, 0, GLASS, 0.6, id, [f.c, 0, f.s]);
        for (const sz of [-1, 1]) { const z = f.hd * sz; const p0 = f.W(x0, top, z), p1 = f.W(x2, top, z), p2 = f.W(x1, top + rise, z); A.triFacing(p0, p1, p2, [0, 1], [1, 1], [0.7, 0], 'plaster-plain', facadeColor, 0, id, [-f.s * sz, 0, f.c * sz]); }
      }
      break;
    }
    case 'barrel': {
      const seg = 10; const rise = Math.max(1.2, pitch * short / 2);
      const L = longX ? f.hw : f.hd, Rr = longX ? f.hd : f.hw;
      const pt = (u: number, a: number): V3 => { const y = top + Math.sin(a) * rise; const v = Math.cos(a) * Rr; return longX ? f.W(u, y, v) : f.W(v, y, u); };
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
        const p0 = pt(-L, a0), p1 = pt(L, a0), p2 = pt(L, a1), p3 = pt(-L, a1);
        const n = f.W(0, 0, 0); void n;
        const q0 = longX ? p0 : p1, q1 = longX ? p1 : p0, q2 = longX ? p2 : p3, q3 = longX ? p3 : p2;
        // make sure it faces outward: normal should have positive y for the top half
        const nrm = normalOf(q0, q1, q2); if (nrm[1] >= 0) A.quad(q0, q1, q2, q3, roof.tile, 0, 1, L / 2, 0, rc, 0, id); else A.quad(q1, q0, q3, q2, roof.tile, 0, 1, L / 2, 0, rc, 0, id);
      }
      for (const su of [-1, 1]) {
        const ring: V3[] = []; for (let i = 0; i <= seg; i++) ring.push(pt(su * L, Math.PI * (i / seg)));
        for (let i = 0; i + 1 < ring.length; i++) { const c0 = pt(su * L, Math.PI / 2); const centre: V3 = [c0[0], top, c0[2]]; const n2 = normalOf(centre, ring[i], ring[i + 1]); const outward: V3 = longX ? f.W(su, 0, 0) : f.W(0, 0, su); const ox = outward[0] - f.m.x, oz = outward[2] - f.m.z; if (n2[0] * ox + n2[2] * oz >= 0) A.tri(centre, ring[i], ring[i + 1], [0.5, 1], [0, 0], [1, 0], 'plaster-plain', facadeColor, 0, id); else A.tri(centre, ring[i + 1], ring[i], [0.5, 1], [0, 0], [1, 0], 'plaster-plain', facadeColor, 0, id); }
      }
      break;
    }
    case 'dome': {
      const rad = short / 2 * 0.92; const drumH = 1.2;
      slab(A, f, top, top + 0.05, 'roof-concrete', C('#b9b3a7'), id, 0);
      ledge(A, f, top, 0.4, 0.2, trimColor, id);
      K.cylinder(f.m.x, top, f.m.z, rad + 0.4, rad + 0.4, drumH, 24, facadeColor);
      const col = rc; const seg = 24, rings = 8;
      const cx = f.m.x, cz = f.m.z, cy = top + drumH;
      const pts: V3[][] = [];
      for (let j = 0; j <= rings; j++) { const phi = (j / rings) * Math.PI / 2; const row: V3[] = []; for (let i = 0; i < seg; i++) { const th = (i / seg) * Math.PI * 2; row.push([cx + Math.cos(th) * Math.cos(phi) * rad, cy + Math.sin(phi) * rad * 0.95, cz + Math.sin(th) * Math.cos(phi) * rad]); } pts.push(row); }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const k = (i + 1) % seg; const a = pts[j][i], bq = pts[j][k], c2 = pts[j + 1][k], d = pts[j + 1][i]; const n: V3 = [(a[0] + c2[0]) / 2 - cx, ((a[1] + c2[1]) / 2 - cy) / 0.95, (a[2] + c2[2]) / 2 - cz]; const l = Math.hypot(n[0], n[1], n[2]) || 1; const nn: V3 = [n[0] / l, n[1] / l, n[2] / l]; if (j === rings - 1) K.tri(a, d, bq, col, 0, 0, nn); else K.quad(a, d, c2, bq, col, 0, 0, nn); }
      // finial
      K.cylinder(cx, cy + rad * 0.95 - 0.1, cz, 0.25, 0.25, 1.6, 8, GOLD);
      K.sphere(cx, cy + rad * 0.95 + 1.8, cz, 0.45, 1, 10, 6, GOLD);
      break;
    }
  }
  void r;
}

function normalOf(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

// ─────────────────────────── features ───────────────────────────

function buildFeature(ft: MassFeature, f: Frame, A: AtlasBuilder, K: ColorBuilder, T: TextBuilder, TA: TextAtlas, facadeColor: THREE.Color, trimColor: THREE.Color, id: number, r: RNG, b: Building, mi: number, gh: number) {
  const m = f.m; const p = ft.p ?? [];
  const side = ft.side ?? 0;
  const n = f.N(side); const [ax, az, bx, bz] = sideSeg(f, side); const len = sideLen(f, side);
  const rot = -m.rot; // three.js rotation.y equivalent for local x axis
  // helper: a point at fraction t along the face (viewer's left→right), outward distance o, height y
  const at = (t: number, o: number, y: number): V3 => { const lx = ax + (bx - ax) * t, lz = az + (bz - az) * t; const w = f.W(lx, y, lz); return [w[0] + n[0] * o, y, w[2] + n[1] * o]; };
  const faceRot = rot + (side % 2 === 1 ? Math.PI / 2 : 0);
  const fh = m.floorHeight;
  switch (ft.kind) {
    case 'canopy': {
      const depth = p[0] ?? 2, h = p[1] ?? 3.2, th = p[2] ?? 0.3, count = Math.max(1, Math.round(p[3] ?? 1)), porte = p[4] === 1;
      const span = count > 1 ? len / count : Math.min(len - 0.6, Math.max(4, len * 0.8));
      for (let k = 0; k < count; k++) {
        const t = count > 1 ? (k + 0.5) / count : 0.5;
        const c = at(t, depth / 2, f.base + h);
        K.box(c[0], c[1], c[2], count > 1 ? span - 0.4 : span, th, depth, trimColor.clone().lerp(facadeColor, 0.3), 0, 0, faceRot);
        if (porte) for (const s of [-1, 1]) { const q = at(t + s * (span / 2 - 0.5) / len, depth - 0.4, 0); K.box(q[0], f.base + h / 2, q[2], 0.4, h, 0.4, trimColor, 0, 0, faceRot); }
      }
      break;
    }
    case 'awning': {
      const depth = p[0] ?? 1.2; const col = C(ft.color ?? '#b3261e');
      const y0 = f.base + (gh > 0 ? gh - 0.3 : Math.min(fh - 0.2, 3.0)), y1 = y0 - 0.6;
      const bays = Math.max(1, Math.round(len / m.facade.bayWidth));
      for (let k = 0; k < bays; k++) {
        const t0 = (k + 0.08) / bays, t1 = (k + 0.92) / bays;
        const q0 = at(t0, 0.05, y0), q1 = at(t1, 0.05, y0), q2 = at(t1, depth, y1), q3 = at(t0, depth, y1);
        K.quad(q0, q1, q2, q3, col); K.quad(q1, q0, q3, q2, col.clone().multiplyScalar(0.8));
        // valance
        K.quad(q3, q2, [q2[0], q2[1] - 0.25, q2[2]], [q3[0], q3[1] - 0.25, q3[2]], col);
      }
      break;
    }
    case 'balconies': {
      const mode = p[0] ?? 1, start = Math.max(1, Math.round(p[1] ?? 1)), depth = p[2] ?? 1.4, frac = p[3] ?? 0.7;
      const bays = Math.max(1, Math.round(len / m.facade.bayWidth)); const bw = len / bays;
      const slabC = facadeColor.clone().multiplyScalar(0.85), railC = trimColor.clone().lerp(WHITE, 0.3);
      const y0 = f.base + (gh > 0 ? gh : fh);
      const floors = gh > 0 ? Math.max(1, Math.round((f.top - f.base - gh) / fh)) : m.floors;
      for (let fl = start; fl < floors + (gh > 0 ? 1 : 0); fl++) {
        const y = y0 + (fl - 1) * fh; if (y > f.top - 1) break;
        if (mode >= 2) {
          const c = at(0.5, depth / 2, y); K.box(c[0], y + 0.08, c[2], len - 0.6, 0.16, depth, slabC, 0, 0, faceRot);
          const rr = at(0.5, depth - 0.05, y); K.box(rr[0], y + 0.6, rr[2], len - 0.6, 1.0, 0.06, railC, 0, 0, faceRot);
          for (const s of [-1, 1]) { const e = at(0.5 + s * (len - 0.6) / 2 / len, depth / 2, y); K.box(e[0], y + 0.6, e[2], 0.06, 1.0, depth, railC, 0, 0, faceRot); }
        } else {
          for (let k = 0; k < bays; k++) {
            if (bays > 3 && (k + fl) % 2 === 1 && mode === 1 && frac < 0.6) continue;
            const t = (k + 0.5) / bays; const w = bw * frac;
            const c = at(t, depth / 2, y); K.box(c[0], y + 0.08, c[2], w, 0.16, depth, slabC, 0, 0, faceRot);
            const rr = at(t, depth - 0.05, y); K.box(rr[0], y + 0.6, rr[2], w, 1.0, 0.06, railC, 0, 0, faceRot);
            for (const s of [-1, 1]) { const e = at(t + s * (w / 2) / len, depth / 2, y); K.box(e[0], y + 0.6, e[2], 0.06, 1.0, depth, railC, 0, 0, faceRot); }
          }
        }
      }
      break;
    }
    case 'columns': {
      const count = Math.max(2, Math.round(p[0] ?? 4)), h = p[1] ?? fh, round = (p[2] ?? 0) === 1, all = (p[3] ?? 0) === 1;
      const col = facadeColor.clone().lerp(WHITE, 0.3);
      const sides = all ? [0, 1, 2, 3] : [side];
      for (const sd of sides) {
        const [sax, saz, sbx, sbz] = sideSeg(f, sd, 0.4); const sl = sideLen(f, sd); const cnt = all ? Math.max(2, Math.round(sl / 6)) : count;
        for (let i = 0; i < cnt; i++) {
          const t = cnt === 1 ? 0.5 : i / (cnt - 1); const lx = sax + (sbx - sax) * t, lz = saz + (sbz - saz) * t; const q = f.W(lx, 0, lz);
          if (round) K.cylinder(q[0], f.base, q[2], 0.28, 0.25, h, 10, col); else K.box(q[0], f.base + h / 2, q[2], 0.45, h, 0.45, col, 0, 0, rot);
        }
      }
      break;
    }
    case 'portico': {
      const w = Math.min(len - 1, p[0] ?? 7), depth = p[1] ?? 2.6, h = p[2] ?? 6, cols = Math.max(2, Math.round(p[3] ?? 4));
      const col = facadeColor.clone().lerp(WHITE, 0.35);
      const cc = at(0.5, depth / 2, f.base + h);
      K.box(cc[0], f.base + h + 0.35, cc[2], w, 0.7, depth + 0.4, col, 0, 0, faceRot);
      // pediment
      if (h > 5) { const ped = at(0.5, depth / 2, 0); const ph = w / 7; const l = at(0.5 - (w / 2) / len, depth + 0.2, f.base + h + 0.7), rr = at(0.5 + (w / 2) / len, depth + 0.2, f.base + h + 0.7), tp: V3 = [ped[0] + n[0] * (depth / 2 + 0.2 - depth / 2), f.base + h + 0.7 + ph, ped[2] + n[1] * (depth / 2 + 0.2 - depth / 2)]; const tp2: V3 = [ (l[0] + rr[0]) / 2, tp[1], (l[2] + rr[2]) / 2]; K.tri(l, rr, tp2, col); K.tri(rr, l, tp2, col);
        const lb = at(0.5 - (w / 2) / len, 0.05, f.base + h + 0.7), rb = at(0.5 + (w / 2) / len, 0.05, f.base + h + 0.7); const tb: V3 = [(lb[0] + rb[0]) / 2, tp[1], (lb[2] + rb[2]) / 2];
        // roof slopes of the pediment
        K.quad(l, tp2, tb, lb, col.clone().multiplyScalar(0.85)); K.quad(tp2, rr, rb, tb, col.clone().multiplyScalar(0.85)); }
      for (let i = 0; i < cols; i++) { const t = 0.5 + ((i / (cols - 1)) - 0.5) * (w - 0.8) / len; const q = at(t, depth - 0.4, 0); K.cylinder(q[0], f.base, q[2], 0.38, 0.34, h + 0.02, 12, col); K.box(q[0], f.base + h - 0.2, q[2], 0.9, 0.4, 0.9, col, 0, 0, faceRot); }
      // steps
      for (let s = 0; s < 3; s++) { const q = at(0.5, depth + 0.3 + s * 0.35, 0); K.box(q[0], f.base - 0.15 * s - 0.075 - 0.45 + 0.45, q[2], w + 1, 0.15, 0.7 + s * 0.7, CONC, 0, 0, faceRot); }
      break;
    }
    case 'veranda': {
      const depth = p[0] ?? 1.8; const col = trimColor.clone().lerp(WHITE, 0.2);
      const y1 = f.base + (gh > 0 ? gh : fh) - 0.15, y0 = y1 - depth * 0.25;
      const q0 = at(0.0, 0.02, y1), q1 = at(1.0, 0.02, y1), q2 = at(1.0, depth, y0), q3 = at(0.0, depth, y0);
      const rc = C(m.roof.color ?? ROOF_DEFAULT[m.roof.tile] ?? '#9ea4a8');
      A.quad(q0, q1, q2, q3, m.roof.tile === 'roof-tile' ? 'roof-tile' : 'roof-zinc', 0, depth / 2, len / 2, 0, rc, 0, id);
      A.quad(q1, q0, q3, q2, 'plaster-plain', 0, 1, len / 4, 0, col, 0, id);
      const posts = Math.max(2, Math.round(len / 3));
      for (let i = 0; i < posts; i++) { const t = i / (posts - 1); const q = at(t * 0.96 + 0.02, depth - 0.15, 0); K.box(q[0], f.base + (y0 - f.base) / 2, q[2], 0.18, y0 - f.base, 0.18, col, 0, 0, faceRot); }
      // low wall / railing
      const rr = at(0.5, depth - 0.15, 0); K.box(rr[0], f.base + 0.45, rr[2], len - 0.4, 0.9, 0.08, col, 0, 0, faceRot);
      // floor slab
      const fl = at(0.5, depth / 2, 0); K.box(fl[0], f.base + 0.1, fl[2], len, 0.2, depth, CONC, 0, 0, faceRot);
      break;
    }
    case 'sign': {
      if (!ft.text) break;
      const big = p[0] === 1; const col = C(ft.color ?? '#1d5c8a');
      const slot = TA.get(ft.text.toUpperCase());
      const h = big ? Math.min(2.2, Math.max(1.2, len / 14)) : 0.7;
      const y = big ? Math.max(f.base + 4, f.top - h / 2 - 0.6 - (m.roof.parapet && m.roof.type === 'flat' ? 0 : 0)) : f.base + (gh > 0 ? gh : Math.min(fh, 3.2)) - 0.5;
      const maxW = len - 1;
      const boardW = Math.min(maxW, slot.aspect * h + h * 0.8);
      const c = at(0.5, big ? 0.12 : 0.14, y);
      if (!big) K.box(c[0], y, c[2], boardW, h + 0.2, 0.12, col, 0, 0.6, faceRot);
      else K.box(c[0], y, c[2], boardW, h + 0.3, 0.14, col.clone().multiplyScalar(0.9), 0, 0.3, faceRot);
      const tc = at(0.5, big ? 0.2 : 0.22, y);
      T.label(tc[0], y, tc[2], n[0], n[1], h, maxW - 0.4, slot, WHITE, 1);
      break;
    }
    case 'rooftank': {
      const cnt = Math.max(1, Math.round(p[0] ?? 1));
      for (let i = 0; i < cnt; i++) {
        const lx = -f.hw + 1.2 + r.range(0, Math.max(0.1, m.w - 2.4)), lz = f.hd - 1.2 - r.range(0, Math.min(3, Math.max(0.1, m.d - 2.4)));
        const q = f.W(lx, 0, lz); const y = f.top + (m.roof.type === 'flat' ? 0.05 : 0);
        if (m.roof.type !== 'flat' && m.roof.type !== 'parapet') continue;
        K.box(q[0], y + 0.7, q[2], 1.2, 1.4, 1.2, STEEL, 0, 0, rot);
        K.cylinder(q[0], y + 1.4, q[2], 0.62, 0.55, 1.3, 10, BLACK);
      }
      break;
    }
    case 'ac': {
      const dens = p[0] ?? 0.2; const floors = Math.max(1, m.floors - 1);
      for (const sd of [1, 2, 3]) {
        const [sax, saz, sbx, sbz] = sideSeg(f, sd); const sl = sideLen(f, sd); const bays = Math.max(1, Math.round(sl / m.facade.bayWidth));
        const nn = f.N(sd);
        for (let fl = 0; fl < floors; fl++) for (let k = 0; k < bays; k++) { if (!r.chance(dens * 0.6)) continue; const t = (k + 0.5) / bays; const lx = sax + (sbx - sax) * t, lz = saz + (sbz - saz) * t; const w = f.W(lx, 0, lz); const y = f.base + (gh > 0 ? gh : fh) + fl * fh + 0.4; K.box(w[0] + nn[0] * 0.25, y, w[2] + nn[1] * 0.25, 0.75, 0.5, 0.4, C('#d9d6cf'), 0, 0, rot + (sd % 2 ? Math.PI / 2 : 0)); }
      }
      break;
    }
    case 'dish': {
      if (m.roof.type !== 'flat' && m.roof.type !== 'parapet') { const q = f.W(f.hw - 0.6, 0, -f.hd + 0.6); K.box(q[0], f.top + 0.9, q[2], 0.08, 1.8, 0.08, STEEL); K.cylinder(q[0], f.top + 1.6, q[2], 0.5, 0.05, 0.25, 10, C('#e4e4e0')); break; }
      const q = f.W(f.hw - 1, 0, f.hd - 1.2); K.box(q[0], f.top + 0.6, q[2], 0.08, 1.2, 0.08, STEEL); K.cylinder(q[0], f.top + 1.0, q[2], 0.5, 0.06, 0.3, 10, C('#e4e4e0'));
      break;
    }
    case 'antenna': {
      const q = f.W(f.hw - 1.5, 0, -f.hd + 1.5); const h = Math.min(10, 4 + m.floors * 0.3);
      K.box(q[0], f.top + h / 2, q[2], 0.12, h, 0.12, STEEL);
      K.box(q[0], f.top + h * 0.7, q[2], 1.2, 0.08, 0.08, STEEL, 0, 0, rot); K.box(q[0], f.top + h * 0.9, q[2], 0.8, 0.08, 0.08, STEEL, 0, 0, rot);
      K.sphere(q[0], f.top + h + 0.1, q[2], 0.12, 1, 6, 4, C('#ff3b2f'), 0, 1);
      break;
    }
    case 'pergola': {
      const w = Math.min(6, m.w - 2), d = Math.min(4, m.d - 2); if (w < 2 || d < 2) break;
      const q = f.W(-f.hw + w / 2 + 0.8, 0, -f.hd + d / 2 + 0.8); const y = f.top + 0.05; const col = C('#8a6a4a');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = f.W(-f.hw + w / 2 + 0.8 + sx * (w / 2 - 0.15), 0, -f.hd + d / 2 + 0.8 + sz * (d / 2 - 0.15)); K.box(c[0], y + 1.2, c[2], 0.15, 2.4, 0.15, col, 0, 0, rot); }
      for (let i = 0; i <= 6; i++) { const c = f.W(-f.hw + 0.8 + (w * i) / 6, 0, -f.hd + d / 2 + 0.8); K.box(c[0], y + 2.45, c[2], 0.1, 0.1, d, col, 0, 0, rot); }
      void q;
      break;
    }
    case 'stairs': {
      // external zig-zag stair against the face
      const col = CONC; const flights = m.floors; const run = Math.min(len * 0.45, fh * 1.6);
      for (let fl = 0; fl < flights; fl++) {
        const y0 = f.base + fl * fh, y1 = y0 + fh; const dir = fl % 2 === 0 ? 1 : -1;
        const a = at(0.5 - dir * run / 2 / len, 0.8, y0), bq = at(0.5 + dir * run / 2 / len, 0.8, y1);
        const steps = 8;
        for (let s = 0; s < steps; s++) { const t = (s + 0.5) / steps; const x = a[0] + (bq[0] - a[0]) * t, z = a[2] + (bq[2] - a[2]) * t, y = a[1] + (bq[1] - a[1]) * t; K.box(x, y, z, run / steps + 0.05, 0.18, 1.2, col, 0, 0, faceRot); }
        const lp = at(0.5 + dir * run / 2 / len, 0.8, y1); K.box(lp[0], y1 - 0.1, lp[2], 1.4, 0.2, 1.4, col, 0, 0, faceRot);
        const rl = at(0.5, 1.4, 0); K.box(rl[0], (y0 + y1) / 2 + 0.9, rl[2], run, 0.05, 0.05, STEEL, 0, 0, faceRot);
      }
      break;
    }
    case 'loadingdock': {
      const col = CONC; const c = at(0.5, 1.6, 0);
      K.box(c[0], f.base + 0.6, c[2], Math.max(4, len - 2), 1.2, 3.2, col, 0, 0, faceRot);
      const cv = at(0.5, 1.8, f.base + 4.4); K.box(cv[0], cv[1], cv[2], Math.max(4, len - 2), 0.2, 3.6, STEEL, 0, 0, faceRot);
      const doors = Math.max(1, Math.floor((len - 2) / 5));
      for (let k = 0; k < doors; k++) { const t = (k + 0.5) / doors; const d = at(t, 0.06, f.base + 2.5); K.box(d[0], d[1], d[2], 3.2, 2.6, 0.08, C('#4a4f55'), 0, 0, faceRot); }
      break;
    }
    case 'rollerdoor': {
      const cnt = Math.max(1, Math.round(p[0] ?? 1)); const dw = Math.min(4, (len - 1) / cnt - 0.5), dh = Math.min(f.base + (gh > 0 ? gh : fh) - 0.4, f.base + 4.2) - f.base;
      for (let k = 0; k < cnt; k++) { const t = (k + 0.5) / cnt; const q0 = at(t - dw / 2 / len, 0.04, f.base + 0.02), q1 = at(t + dw / 2 / len, 0.04, f.base + 0.02), q2 = at(t + dw / 2 / len, 0.04, f.base + dh), q3 = at(t - dw / 2 / len, 0.04, f.base + dh); A.quad(q0, q1, q2, q3, 'garage-door', 0, 1, 1, 0, C('#9aa0a6'), 0, id); }
      break;
    }
    case 'arch': {
      const w = Math.min(len - 1, p[0] ?? 3), h = Math.min(f.top - f.base - 0.3, p[1] ?? 4.5); const col = trimColor.clone().lerp(facadeColor, 0.4);
      // portal frame: two jambs + arched head approximated by 6 segments; dark opening behind
      const q = at(0.5, 0.25, 0);
      K.box(q[0], f.base + h / 2, q[2], w + 1.2, h + 0.6, 0.5, col, 0, 0, faceRot);
      const o = at(0.5, 0.52, 0); K.box(o[0], f.base + (h - 0.4) / 2 + 0.4 * 0 , o[2], w, h - 0.4, 0.1, C('#1a1612'), 0, 0, faceRot);
      const seg = 8; const rad = w / 2;
      for (let i = 0; i < seg; i++) { const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg; const c0 = Math.cos((a0 + a1) / 2) * rad, s0 = Math.sin((a0 + a1) / 2) * rad; const pt = at(0.5 + c0 / len, 0.55, f.base + h - rad + s0 * 0.5); K.box(pt[0], pt[1], pt[2], (Math.PI * rad / seg) * 1.1, 0.2, 0.2, col.clone().multiplyScalar(0.9), 0, 0, faceRot + (a0 + a1) / 2 * 0); }
      break;
    }
    case 'clerestory': {
      const h = p[0] ?? 0.6;
      for (let sd = 0; sd < 4; sd++) { const [sax, saz, sbx, sbz] = sideSeg(f, sd, -0.06); const sl = sideLen(f, sd); A.quad(f.W(sax, f.top - h - 0.4, saz), f.W(sbx, f.top - h - 0.4, sbz), f.W(sbx, f.top - 0.4, sbz), f.W(sax, f.top - 0.4, saz), 'glass-dark', 0, 1, sl / 3, 0, GLASS, 0.8, id); }
      break;
    }
    case 'stack': {
      const h = p[0] ?? 20; const q = f.W(f.hw - 3, 0, f.hd - 3); K.cylinder(q[0], f.base, q[2], 1.4, 1.0, h, 12, C('#8c7f74')); K.cylinder(q[0], f.base + h, q[2], 1.1, 1.1, 0.6, 12, C('#3a3a3a'));
      break;
    }
    case 'tank': {
      const cnt = Math.max(1, Math.round(p[0] ?? 1)); if (m.roof.type !== 'flat' && m.roof.type !== 'parapet' && m.roof.type !== 'sawtooth' && m.roof.type !== 'gable') break;
      for (let i = 0; i < cnt; i++) { const q = f.W(-f.hw + 2.5 + i * 3.2, 0, f.hd - 2.5); if (-f.hw + 2.5 + i * 3.2 > f.hw - 2) break; K.cylinder(q[0], f.top + 0.2, q[2], 1.3, 1.3, 3, 12, C('#c9c4b8')); K.cylinder(q[0], f.top + 3.2, q[2], 1.3, 0.2, 0.5, 12, C('#b0aba0')); }
      break;
    }
    case 'minaret': {
      const h = p[0] ?? 20; const which = (p[1] ?? 0) === 1 ? 1 : -1;
      const q = f.W(which * (f.hw + 1.8), 0, -f.hd + 1.6);
      const col = facadeColor;
      K.box(q[0], f.base + h * 0.5, q[2], 2.6, h, 2.6, col, 0, 0, rot);
      K.box(q[0], f.base + h * 0.66, q[2], 3.6, 0.5, 3.6, trimColor, 0, 0, rot);
      K.box(q[0], f.base + h * 0.66 + 0.6, q[2], 3.6, 1.0, 0.1, trimColor.clone().lerp(WHITE, 0.4), 0, 0, rot);
      K.cylinder(q[0], f.base + h, q[2], 1.6, 1.4, 1.2, 12, col);
      K.sphere(q[0], f.base + h + 1.3, q[2], 1.5, 0.8, 14, 7, C(m.roof.color ?? '#2e7d5b'));
      K.cylinder(q[0], f.base + h + 2.4, q[2], 0.12, 0.08, 2.4, 6, GOLD);
      break;
    }
    case 'spire': {
      const h = p[0] ?? 6; K.cylinder(m.x, f.top + (m.roof.type === 'hip' ? (m.roof.pitch ?? 1) * Math.min(m.w, m.d) / 2 : 0) - 0.2, m.z, Math.min(m.w, m.d) * 0.3, 0.02, h, 8, C('#4d3a30'));
      K.box(m.x, f.top + h + 1.2, m.z, 0.15, 1.6, 0.15, GOLD); K.box(m.x, f.top + h + 1.4, m.z, 0.9, 0.15, 0.15, GOLD, 0, 0, rot);
      break;
    }
    case 'crown': {
      const type = p[0] ?? 1; const col = facadeColor;
      if (type === 1) { // stepped setbacks
        K.box(m.x, f.top + 1.5, m.z, m.w * 0.7, 3, m.d * 0.7, col, 0, 0, rot); K.box(m.x, f.top + 4.2, m.z, m.w * 0.45, 2.4, m.d * 0.45, col, 0, 0, rot); K.box(m.x, f.top + 7, m.z, 0.3, 4, 0.3, STEEL);
      } else if (type === 2) { // tapered crown + mast
        K.cylinder(m.x, f.top, m.z, Math.min(m.w, m.d) * 0.42, Math.min(m.w, m.d) * 0.2, 6, 4, col.clone().lerp(WHITE, 0.2));
        K.cylinder(m.x, f.top + 6, m.z, 0.5, 0.15, 14, 6, STEEL); K.sphere(m.x, f.top + 20.3, m.z, 0.3, 1, 6, 4, C('#ff3b2f'), 0, 1);
      } else if (type === 3) { // wedge / sloped top
        const hwid = m.w / 2, hd = m.d / 2; const a = f.W(-hwid, f.top, -hd), bq = f.W(hwid, f.top, -hd), c2 = f.W(hwid, f.top + 6, hd), d2 = f.W(-hwid, f.top + 6, hd);
        K.quad(a, bq, c2, d2, GLASS.clone().multiplyScalar(0.8), 0, 0.5); K.tri(bq, f.W(hwid, f.top, hd), c2, col); K.tri(d2, f.W(-hwid, f.top, hd), a, col);
        K.quad(f.W(hwid, f.top, hd), f.W(-hwid, f.top, hd), d2, c2, col);
      } else { K.box(m.x, f.top + 0.6, m.z, m.w * 0.9, 1.2, m.d * 0.9, trimColor, 0, 0, rot); }
      break;
    }
    case 'fins': {
      const vertical = (p[0] ?? 1) === 1; const col = trimColor.clone().lerp(facadeColor, 0.5);
      for (let sd = 0; sd < 4; sd++) {
        const [sax, saz, sbx, sbz] = sideSeg(f, sd); const sl = sideLen(f, sd); const nn = f.N(sd); const bays = Math.max(1, Math.round(sl / m.facade.bayWidth));
        if (vertical) { for (let k = 0; k <= bays; k++) { const t = k / bays; const lx = sax + (sbx - sax) * t, lz = saz + (sbz - saz) * t; const w = f.W(lx, 0, lz); K.box(w[0] + nn[0] * 0.2, (f.base + f.top) / 2, w[2] + nn[1] * 0.2, sd % 2 === 0 ? 0.25 : 0.4, f.top - f.base, sd % 2 === 0 ? 0.4 : 0.25, col, 0, 0, rot); } }
        else { for (let fl = 1; fl < m.floors; fl++) { const y = f.base + fl * fh; const c = f.W((sax + sbx) / 2, y, (saz + sbz) / 2); K.box(c[0] + nn[0] * 0.2, y, c[2] + nn[1] * 0.2, sd % 2 === 0 ? sl : 0.4, 0.3, sd % 2 === 0 ? 0.4 : sl, col, 0, 0, rot); } }
      }
      break;
    }
    case 'helipad': { K.cylinder(m.x, f.top + 0.05, m.z, Math.min(6, Math.min(m.w, m.d) * 0.35), Math.min(6, Math.min(m.w, m.d) * 0.35), 0.3, 20, C('#8d8d8d')); K.box(m.x, f.top + 0.37, m.z, 0.5, 0.02, 3, WHITE, 0, 0, rot); K.box(m.x - 1, f.top + 0.37, m.z, 0.5, 0.02, 3, WHITE, 0, 0, rot); K.box(m.x + 1, f.top + 0.37, m.z, 0.5, 0.02, 3, WHITE, 0, 0, rot); K.box(m.x, f.top + 0.37, m.z, 2.5, 0.02, 0.5, WHITE, 0, 0, rot); break; }
    case 'skylight': { const w = Math.min(m.w * 0.5, 12), d = Math.min(m.d * 0.3, 6); K.box(m.x, f.top + 0.6, m.z, w, 1.2, d, GLASS, 0, 0.6, rot); break; }
    case 'cross': {
      if (p[0] === 1) { const q = f.W(0, 0, -f.hd + 1.5); const rise = (m.roof.pitch ?? 0.5) * Math.min(m.w, m.d) / 2; K.box(q[0], f.top + rise + 1.4, q[2], 0.2, 2.8, 0.2, WHITE); K.box(q[0], f.top + rise + 2.1, q[2], 1.4, 0.2, 0.2, WHITE, 0, 0, rot); }
      else { const q = at(0.5, 0.15, f.top - 1.6); K.box(q[0], q[1], q[2], 0.25, 1.6, 0.12, C('#b3261e'), 0, 0.5, faceRot); K.box(q[0], q[1] + 0.3, q[2], 1.0, 0.25, 0.12, C('#b3261e'), 0, 0.5, faceRot); }
      break;
    }
    case 'crescent': { const rad = Math.min(m.w, m.d) / 2 * 0.92; const y = f.top + 1.2 + rad * 0.95; K.cylinder(m.x, y, m.z, 0.12, 0.08, 2.2, 6, GOLD); K.sphere(m.x, y + 2.4, m.z, 0.5, 1, 10, 5, GOLD); break; }
    case 'clock': { const q = at(0.5, 0.2, f.top - 2.2); K.cylinder(q[0], q[1] - 0.1, q[2], 1.4, 1.4, 0.2, 20, WHITE); K.box(q[0] + n[0] * 0.25, q[1], q[2] + n[1] * 0.25, 0.1, 1.9, 0.1, DARK, 0, 0, faceRot); K.box(q[0] + n[0] * 0.25, q[1], q[2] + n[1] * 0.25, 1.6, 0.1, 0.1, DARK, 0, 0, faceRot); break; }
    case 'flagpoles': {
      const cnt = Math.max(1, Math.round(p[0] ?? 1));
      for (let k = 0; k < cnt; k++) { const t = 0.5 + (k - (cnt - 1) / 2) * 2.5 / len; const q = at(t, 3.5, 0); K.cylinder(q[0], f.base, q[2], 0.07, 0.05, 9, 6, C('#d8d8d8')); const fc = [C('#1f7a4d'), WHITE, C('#d98a1f')][k % 3]; K.box(q[0] + 0.7, f.base + 8.4, q[2], 1.4, 0.9, 0.03, fc, 0, 0, faceRot + Math.PI / 2); }
      break;
    }
    case 'pitchlights': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = f.W(sx * (f.hw + 6), 0, sz * (f.hd + 6)); K.cylinder(q[0], f.base, q[2], 0.5, 0.3, 36, 8, STEEL); K.box(q[0], f.base + 36, q[2], 4, 3, 0.6, C('#dcdcdc'), 0, 0.8, rot); }
      break;
    }
    case 'solar': case 'pylon': case 'cables': case 'parapet': default: break;
  }
  void b; void mi;
}
