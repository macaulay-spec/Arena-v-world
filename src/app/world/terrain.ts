/** Terrain mesh (graded to the roads), water surface and ground-cover colouring. */
import * as THREE from 'three';
type V3 = [number, number, number];
import type { CityData, Block, Vec2, Polygon } from '../../shared/types';
import { Terrain, shorelineZ } from '../../shared/terrain';
import { Ground } from '../../shared/ground';
import { pointInPolygon, bbox, SpatialHash } from '../../shared/geom';
import { Noise2D } from '../../shared/noise';
import { AtlasBuilder } from '../geom';
import type { Atlas } from '../atlas';

export interface WorldBase { terrain: Terrain; ground: Ground; blockAt: (x: number, z: number) => Block | null; }

export function makeWorldBase(city: CityData): WorldBase {
  const terrain = new Terrain(city.meta.terrain);
  const ground = new Ground(terrain, city.roads.edges, city.landmarks.flatMap(l => l.plateau ? [l.plateau] : []));
  const hash = new SpatialHash<Block>(60);
  for (const b of city.blocks) { const bb = bbox(b.polygon); hash.insert(b, bb.minX, bb.minZ, bb.maxX, bb.maxZ); }
  const blockAt = (x: number, z: number): Block | null => { for (const b of hash.query(x, z, x, z)) if (pointInPolygon([x, z], b.polygon)) return b; return null; };
  return { terrain, ground, blockAt };
}

const COVER: Record<string, [string, string]> = {
  residential: ['#718a42', '#8e9a52'], commercial: ['#9a968c', '#a8a49a'], mixed: ['#8c8c6a', '#9a9470'], industrial: ['#8d8a7c', '#9a9282'],
  civic: ['#7e9048', '#8f9a58'], park: ['#5c8a3a', '#7aa04a'], plaza: ['#b8b2a4', '#c2bcae'], transport: ['#8e8a80', '#9a968c'], market: ['#9c8d6e', '#a89a78'],
  water: ['#6a7a70', '#728078'], open: ['#8f945f', '#a0a06a'], landmark: ['#7f9a4e', '#8fa65a'], farmland: ['#9a9a5a', '#a89f5e'],
};

/** terrain tile edge (metres): tiles are separate meshes so the renderer frustum-culls the ground */
export const TERRAIN_TILE = 200;
const INNER_STEP = 5, OUTER_STEP = 10, TERRACE_STEP = 2;

/**
 * Ground mesh: the inner city on a 5 m grid, the outer frame at 10 m, split into TERRAIN_TILE tiles.
 * Terraces (landmark plateaus) get a conforming patch: a finer grid whose vertex columns/rows are
 * doubled a few centimetres either side of the terrace edges, so the retaining step between the
 * flat terrace and the surrounding ground is a clean vertical face instead of a 5 m ramp that would
 * poke through the compound wall and bury the garden.
 */
export function buildTerrain(city: CityData, base: WorldBase, mat: THREE.Material): THREE.Group {
  const { ground, blockAt } = base;
  const cb = city.meta.terrain.cityBounds, wb = city.meta.terrain.bounds;
  const noise = new Noise2D(7);
  const grass = new THREE.Color(), tmp = new THREE.Color();
  const sand = new THREE.Color('#c9b98a'), bed = new THREE.Color('#5a6a66'), savanna = new THREE.Color('#9c9a58'), savanna2 = new THREE.Color('#7f8f46'), earth = new THREE.Color('#9a8a66');
  const colorAt = (x: number, z: number, h: number): THREE.Color => {
    const n = noise.fbm(x * 0.01, z * 0.01, 3);
    if (h < 0.35) { tmp.copy(bed).lerp(sand, Math.max(0, (h + 1.5) / 2)); return tmp; }
    const shore = shorelineZ(x) - z;
    if (shore < 28 && h < 3) { tmp.copy(sand).lerp(savanna, Math.max(0, shore / 28)); return tmp; }
    if (h < 1.6) { tmp.copy(sand).lerp(earth, h / 1.6); return tmp; }
    const b = blockAt(x, z);
    if (b) {
      const [a, c] = COVER[b.use] ?? COVER.open;
      tmp.set(a).lerp(grass.set(c), n);
      // worn patches of bare earth (less in parks, more in markets / industry / open land)
      const n2 = noise.fbm(x * 0.055 + 31, z * 0.055 - 17, 2);
      const wear = b.use === 'park' || b.use === 'civic' ? 0.72 : b.use === 'residential' ? 0.6 : 0.5;
      tmp.lerp(earth, THREE.MathUtils.clamp((n2 - wear) * 3.2, 0, 0.85));
      return tmp;
    }
    tmp.copy(savanna).lerp(savanna2, n * 1.2 - 0.1);
    if (h > 14) tmp.lerp(earth, Math.min(1, (h - 14) / 10));
    return tmp;
  };
  const group = new THREE.Group(); group.name = 'terrain';

  // terrace patches, snapped outward to the inner grid lines so they replace whole 5 m cells
  const snapLo = (v: number, o: number) => o + Math.floor((v - o) / INNER_STEP) * INNER_STEP, snapHi = (v: number, o: number) => o + Math.ceil((v - o) / INNER_STEP) * INNER_STEP;
  const patches = ground.terraces.map(t => {
    const b = bbox(t.polygon), pad = ground.plateauBand + 1;
    return { polygon: t.polygon, minX: snapLo(b.minX - pad, cb.minX), maxX: snapHi(b.maxX + pad, cb.minX), minZ: snapLo(b.minZ - pad, cb.minZ), maxZ: snapHi(b.maxZ + pad, cb.minZ) };
  });
  const inPatch = (x: number, z: number) => patches.some(p => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ);

  /** one tile: a regular grid (cells overlapping a terrace patch are left out — the patch fills them) */
  const addTile = (x0: number, z0: number, x1: number, z1: number, step: number, skip: boolean, name: string) => {
    const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
      const h = ground.height(x, z);
      positions.push(x, h, z);
      const c = colorAt(x, z, h);
      colors.push(c.r, c.g, c.b);
      uvs.push(x / 24, z / 24);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (skip && inPatch(x0 + ((x1 - x0) * (i + 0.5)) / nx, z0 + ((z1 - z0) * (j + 0.5)) / nz)) continue;
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    if (!indices.length) return;
    emit(positions, colors, uvs, indices, name);
  };
  const emit = (positions: number[], colors: number[], uvs: number[], indices: number[], name: string) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.name = name;
    group.add(mesh);
  };

  // inner city: TERRAIN_TILE tiles on the 5 m grid
  for (let tz = cb.minZ; tz < cb.maxZ; tz += TERRAIN_TILE) for (let tx = cb.minX; tx < cb.maxX; tx += TERRAIN_TILE) {
    const x1 = Math.min(cb.maxX, tx + TERRAIN_TILE), z1 = Math.min(cb.maxZ, tz + TERRAIN_TILE);
    addTile(tx, tz, x1, z1, INNER_STEP, true, `terrain:${tx},${tz}`);
  }
  // outer frame coarser (shared edge vertices are not welded; a 10 m grid against the 5 m one is close enough at that distance)
  const outer: [number, number, number, number][] = [
    [wb.minX, wb.minZ, wb.maxX, cb.minZ], [wb.minX, cb.maxZ, wb.maxX, wb.maxZ], [wb.minX, cb.minZ, cb.minX, cb.maxZ], [cb.maxX, cb.minZ, wb.maxX, cb.maxZ],
  ];
  for (const [x0, z0, x1, z1] of outer) {
    const tile = TERRAIN_TILE * 2;
    for (let tz = z0; tz < z1; tz += tile) for (let tx = x0; tx < x1; tx += tile) addTile(tx, tz, Math.min(x1, tx + tile), Math.min(z1, tz + tile), OUTER_STEP, false, `terrain:outer:${tx},${tz}`);
  }

  // terrace patches: finer grid + doubled columns/rows 2 cm either side of every terrace edge coordinate.
  // Boundary vertices take the coarse grid's linear interpolation so the patch meets the tiles without cracks.
  const EPS = 0.02;
  for (const p of patches) {
    const axes = (lo: number, hi: number, edges: number[]) => {
      const v = new Set<number>();
      for (let a = lo; a <= hi + 1e-6; a += TERRACE_STEP) v.add(Math.min(hi, a));
      v.add(hi);
      for (const e of edges) if (e - EPS > lo && e + EPS < hi) { v.add(e - EPS); v.add(e + EPS); }
      return [...v].sort((a, b) => a - b);
    };
    const xs = axes(p.minX, p.maxX, [...new Set(p.polygon.map(q => q[0]))]), zs = axes(p.minZ, p.maxZ, [...new Set(p.polygon.map(q => q[1]))]);
    const coarse = (x: number, z: number) => { // height on the coarse grid lines (linear between 5 m vertices)
      const gx = (x - cb.minX) / INNER_STEP, gz = (z - cb.minZ) / INNER_STEP;
      const onX = Math.abs(gx - Math.round(gx)) < 1e-6, onZ = Math.abs(gz - Math.round(gz)) < 1e-6;
      if (onX && onZ) return ground.height(x, z);
      if (onX) { const z0 = cb.minZ + Math.floor(gz) * INNER_STEP, z1 = z0 + INNER_STEP, t = (z - z0) / INNER_STEP; return ground.height(x, z0) * (1 - t) + ground.height(x, z1) * t; }
      const x0 = cb.minX + Math.floor(gx) * INNER_STEP, x1 = x0 + INNER_STEP, t = (x - x0) / INNER_STEP; return ground.height(x0, z) * (1 - t) + ground.height(x1, z) * t;
    };
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      const x = xs[i], z = zs[j];
      const edge = i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1;
      const h = edge ? coarse(x, z) : ground.height(x, z);
      positions.push(x, h, z);
      const c = colorAt(x, z, h); colors.push(c.r, c.g, c.b); uvs.push(x / 24, z / 24);
    }
    for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
      const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    emit(positions, colors, uvs, indices, `terrain:terrace:${p.minX},${p.minZ}`);
  }
  return group;
}

export function buildWater(city: CityData, mat: THREE.Material): THREE.Mesh {
  const wb = city.meta.terrain.bounds;
  const g = new THREE.PlaneGeometry(wb.maxX - wb.minX + 600, wb.maxZ - wb.minZ + 600, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set((wb.minX + wb.maxX) / 2, city.water.level + 0.02, (wb.minZ + wb.maxZ) / 2);
  m.renderOrder = 2; m.name = 'water';
  return m;
}

/** flat surfaces for parcels that have a paved/earth character (plazas, parking, yards, stalls, fields, pitches) */
export function buildSurfaces(city: CityData, base: WorldBase, atlas: Atlas, into: AtlasBuilder) {
  const { ground } = base;
  const surfaceFor = (use: string, districtId: string): [string, string] | null => {
    switch (use) {
      case 'plaza': return ['paving-plaza', '#d8d2c4'];
      case 'parking': return ['asphalt-old', '#9a9a9a'];
      case 'yard': return ['concrete-plain', '#b8b2a6'];
      case 'stalls': return districtId === 'OT' ? ['earth', '#b9a784'] : ['concrete-plain', '#b4ad9f'];
      case 'field': return ['field', '#b9a95e'];
      case 'open': return null;
      case 'pitch': return ['pitch', '#6f9a44'];
      case 'quay': return ['concrete-plain', '#b0aba0'];
      default: return null;
    }
  };
  for (const p of city.parcels) {
    const sf = surfaceFor(p.use, p.districtId);
    if (!sf) continue;
    const [tile, col] = sf;
    gridSurface(p.polygon, (x, z) => ground.height(x, z) + 0.08, tile, new THREE.Color(col), 6, into, -1);
  }
  // landmark site surfaces: hard landscaping around civic buildings
  const blockById = new Map(city.blocks.map(b => [b.id, b]));
  for (const p of city.parcels) {
    const b = blockById.get(p.blockId); if (!b?.reservedFor) continue;
    const z = b.reservedFor;
    const hard = ['city-hall', 'meridian-tower', 'cultural-centre', 'secretariat', 'vora-mall', 'police-fire', 'hospital', 'grand-market', 'terminal', 'port', 'works', 'stadium', 'mosque', 'cathedral', 'kesari-square', 'kesari-court', 'ot-market', 'harbour'];
    if (!hard.includes(z) || p.use === 'plaza') continue;
    const tile = z === 'port' || z === 'works' || z === 'terminal' || z === 'vora-mall' ? 'asphalt-old' : z === 'grand-market' || z === 'ot-market' || z === 'harbour' ? 'concrete-plain' : z === 'kesari-square' || z === 'kesari-court' ? 'earth' : 'paving';
    const col = tile === 'asphalt-old' ? '#9c9c9c' : tile === 'earth' ? '#bfae8a' : tile === 'concrete-plain' ? '#b8b2a6' : '#cfc9bb';
    gridSurface(p.polygon, (x, zz) => ground.height(x, zz) + 0.08, tile, new THREE.Color(col), 6, into, -1);
  }
  void atlas;
}

/** triangulate a polygon as a terrain-following surface by clipping it into grid cells */
/** cell size of the inner-city terrain lattice; surfaces are cut on the same lattice (and the same diagonal) so they follow it exactly */
export const TERRAIN_CELL = 5;

export function gridSurface(poly: Polygon, hAt: (x: number, z: number) => number, tile: string, color: THREE.Color, scale: number, into: AtlasBuilder, id = -1, cell = TERRAIN_CELL) {
  const bb = bbox(poly);
  const big = (bb.maxX - bb.minX) > cell * 1.5 || (bb.maxZ - bb.minZ) > cell * 1.5;
  const pieces: Polygon[] = [];
  if (!big) pieces.push(poly);
  else {
    for (let x = Math.floor(bb.minX / cell) * cell; x < bb.maxX; x += cell) for (let z = Math.floor(bb.minZ / cell) * cell; z < bb.maxZ; z += cell) {
      let c: Polygon = poly;
      c = clip(c, [x, z], [1, 0]); if (c.length < 3) continue;
      c = clip(c, [x + cell, z], [-1, 0]); if (c.length < 3) continue;
      c = clip(c, [x, z], [0, 1]); if (c.length < 3) continue;
      c = clip(c, [x, z + cell], [0, -1]); if (c.length < 3) continue;
      // full lattice cell: two triangles on the terrain's anti-diagonal (b–c), identical to the terrain mesh
      if (c.length === 4 && cell === TERRAIN_CELL && c.every(q => (Math.abs(q[0] - x) < 1e-6 || Math.abs(q[0] - x - cell) < 1e-6) && (Math.abs(q[1] - z) < 1e-6 || Math.abs(q[1] - z - cell) < 1e-6))) {
        const a: V3 = [x, hAt(x, z), z], b: V3 = [x + cell, hAt(x + cell, z), z], cc: V3 = [x, hAt(x, z + cell), z + cell], d: V3 = [x + cell, hAt(x + cell, z + cell), z + cell];
        into.triY(a, cc, b, tile, color, scale, id); into.triY(b, cc, d, tile, color, scale, id);
        continue;
      }
      pieces.push(c);
    }
  }
  for (const pc of pieces) {
    let cx = 0, cz = 0; for (const q of pc) { cx += q[0]; cz += q[1]; } cx /= pc.length; cz /= pc.length;
    const ys = pc.map(q => hAt(q[0], q[1]));
    // winding: ensure CCW seen from above (x right, z down ⇒ use signed area sign)
    let area = 0; for (let i = 0; i < pc.length; i++) { const a = pc[i], b = pc[(i + 1) % pc.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const ring = area < 0 ? pc.slice().reverse() : pc; const ys2 = area < 0 ? ys.slice().reverse() : ys;
    into.fanY([cx, cz], hAt(cx, cz), ring, ys2, tile, color, scale, id);
  }
}

function clip(poly: Polygon, o: Vec2, n: Vec2): Polygon {
  const out: Polygon = [];
  const side = (p: Vec2) => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
