/** Parcel boundary treatments: compound walls, fences, hedges, railings and gates. */
import * as THREE from 'three';
import type { CityData, Parcel, Vec2 } from '../../shared/types';
import { v2 } from '../../shared/geom';
import { AtlasBuilder, ColorBuilder, type V3 } from '../geom';
import type { ChunkSet } from './chunks';
import type { WorldBase } from './terrain';
import { RNG } from '../../shared/rng';

export interface WallBuild { atlas: ChunkSet<AtlasBuilder>; color: ChunkSet<ColorBuilder>; glass: ChunkSet<ColorBuilder>; foliage: ChunkSet<ColorBuilder>; }

const C = (h: string) => new THREE.Color(h);
const WALL_COLORS = ['#d9d2c3', '#cfc6b2', '#e4ded0', '#c9c2b4', '#d6cdb8', '#bdb5a3', '#e8e2d6'];
const WALL_COLORS_OT = ['#c9b391', '#b8a07c', '#d4bf9e', '#a88c6a'];
const GATE_COLORS = ['#2f4a3a', '#3b3b3b', '#5a3a2a', '#1d4d6b', '#4a4a44'];
const HEDGE = ['#3f6b2f', '#4a7a36', '#577f3a', '#3a5f2c'];
const STEEL = C('#8e959b'), DARK = C('#3a3a3a'), MESH = C('#9aa0a6'), POST = C('#b9b3a7');

export function buildWalls(city: CityData, base: WorldBase, out: WallBuild) {
  const rng = new RNG('walls');
  for (const p of city.parcels) {
    if (!p.fence) continue;
    buildParcelBoundary(p, base, out, rng.fork(p.id));
  }
}

function buildParcelBoundary(p: Parcel, base: WorldBase, out: WallBuild, r: RNG) {
  const poly = p.polygon; const n = poly.length; if (n < 3) return;
  const inset = 0.15;
  // inward offset: polygon winding is CCW (positive signed area) ⇒ interior is to the left of each edge in math coords
  let area = 0; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area > 0 ? 1 : -1;
  const ctr = (x: number, z: number) => base.ground.height(x, z);
  const kind = p.fence!;
  const wallCol = C(p.districtId === 'OT' ? WALL_COLORS_OT[r.int(0, WALL_COLORS_OT.length - 1)] : WALL_COLORS[r.int(0, WALL_COLORS.length - 1)]);
  const hedgeCol = C(HEDGE[r.int(0, HEDGE.length - 1)]);
  const gateCol = C(GATE_COLORS[r.int(0, GATE_COLORS.length - 1)]);
  const wallH = kind === 'wall' ? (p.districtId === 'NH' ? 2.4 : p.districtId === 'ID' ? 2.6 : 2.0) : kind === 'fence' ? 2.1 : kind === 'railing' ? 1.2 : 1.2;
  const gate = p.gate;
  const gh = gate ? ctr(gate.x, gate.z) : 0;
  const tile = p.districtId === 'OT' || p.districtId === 'MQ' ? 'wall-block' : 'wall-plain';

  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const d = v2.sub(b, a); const L = v2.len(d); if (L < 0.4) continue;
    const dir = v2.scale(d, 1 / L); const inward = v2.scale(v2.perp(dir), -sign); // perp is right-hand; interior side depends on winding
    const o = v2.scale(inward, inset);
    // gate gap on this edge?
    let gapS0 = -1, gapS1 = -1;
    if (gate) { const t = v2.dot(v2.sub([gate.x, gate.z], a), dir); const off = Math.abs(v2.cross(dir, v2.sub([gate.x, gate.z], a))); if (off < 1.2 && t > -0.5 && t < L + 0.5) { gapS0 = t - gate.width / 2; gapS1 = t + gate.width / 2; } }
    // split into runs outside the gap
    const runs: [number, number][] = [];
    if (gapS0 < 0 && gapS1 < 0) runs.push([0, L]); else { if (gapS0 > 0.3) runs.push([0, Math.min(L, gapS0)]); if (gapS1 < L - 0.3) runs.push([Math.max(0, gapS1), L]); }
    for (const [s0, s1] of runs) {
      const segLen = s1 - s0; if (segLen < 0.3) continue;
      const nSeg = Math.max(1, Math.ceil(segLen / 4));
      for (let k = 0; k < nSeg; k++) {
        const u0 = s0 + (segLen * k) / nSeg, u1 = s0 + (segLen * (k + 1)) / nSeg;
        const pa = v2.add(v2.add(a, v2.scale(dir, u0)), o), pb = v2.add(v2.add(a, v2.scale(dir, u1)), o);
        const y = Math.max(ctr(pa[0], pa[1]), ctr(pb[0], pb[1]));
        switch (kind) {
          case 'wall': wallSegment(out, pa, pb, y, wallH, tile, wallCol, inward, k === 0, r); break;
          case 'fence': fenceSegment(out, pa, pb, y, wallH, inward); break;
          case 'railing': railingSegment(out, pa, pb, y, wallH); break;
          case 'hedge': hedgeSegment(out, pa, pb, y, wallH + r.range(-0.15, 0.25), hedgeCol); break;
        }
      }
      if (kind === 'wall') { const pe = v2.add(v2.add(a, v2.scale(dir, s1)), o); pillar(out, pe, Math.max(ctr(pe[0], pe[1]), 0), wallH, wallCol); }
      if (kind === 'fence' || kind === 'railing') { const pe = v2.add(v2.add(a, v2.scale(dir, s1)), o); const K = out.color.get(pe[0], pe[1]); K.box(pe[0], ctr(pe[0], pe[1]) + wallH / 2, pe[1], 0.1, wallH + 0.3, 0.1, kind === 'fence' ? STEEL : DARK); }
    }
    // gate leaves + posts
    if (gapS0 >= 0 && gapS1 >= 0 && gate) {
      const g0 = v2.add(v2.add(a, v2.scale(dir, Math.max(0, gapS0))), o), g1 = v2.add(v2.add(a, v2.scale(dir, Math.min(L, gapS1))), o);
      const K = out.color.get(gate.x, gate.z);
      const ph = kind === 'wall' ? wallH + 0.5 : wallH + 0.2;
      for (const g of [g0, g1]) K.box(g[0], gh + ph / 2 - 0.2, g[1], 0.45, ph + 0.4, 0.45, kind === 'wall' ? wallCol.clone().multiplyScalar(0.95) : STEEL);
      const rot = -Math.atan2(dir[1], dir[0]);
      const mid = v2.lerp(g0, g1, 0.5); const gw = v2.dist(g0, g1) - 0.5;
      if (kind === 'wall' || kind === 'hedge') {
        // solid steel gate with top rail and frame
        K.box(mid[0], gh + 1.0, mid[1], gw, 1.9, 0.06, gateCol, 0, 0, rot);
        K.box(mid[0], gh + 1.98, mid[1], gw, 0.08, 0.1, gateCol.clone().multiplyScalar(0.7), 0, 0, rot);
        K.box(mid[0], gh + 1.0, mid[1], 0.06, 1.9, 0.1, gateCol.clone().multiplyScalar(0.7), 0, 0, rot);
      } else {
        const G = out.glass.get(gate.x, gate.z);
        G.box(mid[0], gh + 1.0, mid[1], gw, 1.8, 0.03, MESH, 0, 0, rot);
        K.box(mid[0], gh + 1.9, mid[1], gw, 0.06, 0.06, STEEL, 0, 0, rot); K.box(mid[0], gh + 0.15, mid[1], gw, 0.06, 0.06, STEEL, 0, 0, rot);
      }
    }
  }
}

function wallSegment(out: WallBuild, a: Vec2, b: Vec2, y: number, h: number, tile: string, col: THREE.Color, inward: Vec2, first: boolean, r: RNG) {
  const A = out.atlas.get(a[0], a[1]);
  const th = 0.22; const o = v2.scale(inward, th / 2);
  const ao = v2.add(a, o), bo = v2.add(b, o), ai = v2.sub(a, o), bi = v2.sub(b, o);
  const len = v2.dist(a, b); const y0 = y - 0.4, y1 = y + h;
  const P = (p: Vec2, yy: number): V3 => [p[0], yy, p[1]];
  // outer face (towards -inward) and inner face
  const outN: V3 = [-inward[0], 0, -inward[1]], inN: V3 = [inward[0], 0, inward[1]];
  A.quad(P(ai, y0), P(bi, y0), P(bi, y1), P(ai, y1), tile, 0, h / 2.4, len / 4, 0, col, 0, -1, outN);
  A.quad(P(bo, y0), P(ao, y0), P(ao, y1), P(bo, y1), tile, 0, h / 2.4, len / 4, 0, col, 0, -1, inN);
  // fix winding for the two faces by checking the normal direction
  const g = A; void g;
  // coping
  A.quadUp(P(ai, y1), P(bi, y1), P(bo, y1), P(ao, y1), 'concrete-plain', col.clone().multiplyScalar(0.92), 2);
  void first; void r;
}

function pillar(out: WallBuild, p: Vec2, y: number, h: number, col: THREE.Color) {
  const K = out.color.get(p[0], p[1]);
  K.box(p[0], y + h / 2, p[1], 0.4, h + 0.25 + 0.4, 0.4, col.clone().multiplyScalar(0.96));
  K.box(p[0], y + h + 0.3, p[1], 0.5, 0.1, 0.5, col.clone().multiplyScalar(0.85));
}

function fenceSegment(out: WallBuild, a: Vec2, b: Vec2, y: number, h: number, inward: Vec2) {
  const K = out.color.get(a[0], a[1]); const G = out.glass.get(a[0], a[1]);
  const mid = v2.lerp(a, b, 0.5); const len = v2.dist(a, b); const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  K.box(a[0], y + h / 2, a[1], 0.08, h + 0.3, 0.08, STEEL);
  K.box(mid[0], y + h - 0.05, mid[1], len, 0.05, 0.05, STEEL, 0, 0, rot);
  K.box(mid[0], y + 0.1, mid[1], len, 0.05, 0.05, STEEL, 0, 0, rot);
  G.box(mid[0], y + h / 2, mid[1], len, h - 0.1, 0.02, MESH, 0, 0, rot);
  // barbed wire outriggers on tall fences
  if (h > 2) { K.box(mid[0], y + h + 0.15, mid[1], len, 0.02, 0.02, DARK, 0, 0, rot); }
  void inward;
}

function railingSegment(out: WallBuild, a: Vec2, b: Vec2, y: number, h: number) {
  const K = out.color.get(a[0], a[1]); const G = out.glass.get(a[0], a[1]);
  const mid = v2.lerp(a, b, 0.5); const len = v2.dist(a, b); const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  K.box(a[0], y + h / 2, a[1], 0.08, h + 0.2, 0.08, DARK);
  K.box(mid[0], y + h, mid[1], len, 0.06, 0.06, DARK, 0, 0, rot);
  K.box(mid[0], y + 0.25, mid[1], len, 0.05, 0.05, DARK, 0, 0, rot);
  G.box(mid[0], y + h / 2 + 0.1, mid[1], len, h - 0.3, 0.02, DARK, 0, 0, rot);
  // low plinth
  const P = out.color.get(a[0], a[1]); P.box(mid[0], y + 0.1, mid[1], len, 0.3, 0.25, POST, 0, 0, rot);
}

function hedgeSegment(out: WallBuild, a: Vec2, b: Vec2, y: number, h: number, col: THREE.Color) {
  const F = out.foliage.get(a[0], a[1]);
  const mid = v2.lerp(a, b, 0.5); const len = v2.dist(a, b); const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  F.box(mid[0], y + h / 2 - 0.1, mid[1], len + 0.1, h, 0.7, col, 1, 0, rot);
}
