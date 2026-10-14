/**
 * V-WORLD city generator. Deterministic: same seed → same data/city.json.
 *   npm run generate
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CityData, District, Block, Prop, Vec2, CityStats, Polygon } from '../src/shared/types';
import { RNG } from '../src/shared/rng';
import { Terrain, makeTerrainParams, DEFAULT_WATER, WATER_LEVEL } from '../src/shared/terrain';
import { Ground } from '../src/shared/ground';
import { polylineLength, area, centroid, rectCorners, pointInPolygon, v2 } from '../src/shared/geom';
import { corridorHalfWidth } from '../src/shared/types';
import { SEED, VERSION, DISTRICTS, HINTERLAND } from './config';
import { ROAD_PROFILES } from '../src/shared/types';
import { buildRoads } from './roads';
import { buildBlocks } from './blocks';
import { buildParcels } from './parcels';
import { buildBuildings, r2 } from './buildings';
import { buildProps } from './props';

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const seed = Number(process.env.SEED ?? SEED);
const rng = new RNG(seed);
const terrainParams = makeTerrainParams(seed);
const terrain = new Terrain(terrainParams);
const WORLD: [number, number, number, number] = [terrainParams.bounds.minX, terrainParams.bounds.minZ, terrainParams.bounds.maxX, terrainParams.bounds.maxZ];

log('roads…');
const rb = buildRoads(terrain, rng.fork('roads'));
log(`roads: ${rb.nodes.length} nodes, ${rb.edges.length} edges, ${rb.faces.length} faces`);

const ground = new Ground(terrain, rb.edges);

log('blocks…');
const blocks = buildBlocks(rb, terrain, rng.fork('blocks'));
log(`blocks: ${blocks.length}`);

log('parcels…');
const parcels = buildParcels(blocks, rb.edgeById, rng.fork('parcels'));
log(`parcels: ${parcels.length}`);

// ── hinterland compounds: small farm houses along the roads outside the ring ──
const cityBounds: Polygon = [[-838, -640], [838, -640], [838, 450], [-838, 450]];
{
  const r = rng.fork('hinterland-compounds');
  let k = 0;
  for (const e of rb.edges) {
    if (e.bridge) continue;
    const L = polylineLength(e.points);
    if (L < 60) continue;
    for (let s = 45; s < L - 45; s += 95) {
      if (!r.chance(0.42)) continue;
      // locate point
      let acc = 0, pos: Vec2 | null = null, dir: Vec2 = [1, 0];
      for (let i = 1; i < e.points.length; i++) { const l = v2.dist(e.points[i - 1], e.points[i]); if (s <= acc + l) { const t = (s - acc) / l; pos = v2.lerp(e.points[i - 1], e.points[i], t); dir = v2.norm(v2.sub(e.points[i], e.points[i - 1])); break; } acc += l; }
      if (!pos) continue;
      if (pointInPolygon(pos, cityBounds)) continue;
      const side = r.chance(0.5) ? 1 : -1;
      const n: Vec2 = [-dir[1] * side, dir[0] * side];
      const off = corridorHalfWidth(e.cls) + 1.5;
      const w = r.range(22, 34), d = r.range(20, 30);
      const c = v2.add(pos, v2.scale(n, off + d / 2));
      const rot = Math.atan2(dir[0], dir[1]);
      const poly = rectCorners(c[0], c[1], w / 2, d / 2, -rot);
      if (poly.some(q => terrain.isWater(q[0], q[1]) || terrain.rawHeight(q[0], q[1]) < 1.8 || pointInPolygon(q, cityBounds))) continue;
      if (q(poly, blocks)) continue;
      const bid = `HL${k++}`;
      const block: Block = { id: bid, districtId: 'HL', polygon: poly, buildable: poly, use: 'residential', area: r2(area(poly)), edgeIds: [e.id] };
      blocks.push(block);
      const front = v2.add(pos, v2.scale(n, off));
      parcels.push({ id: `P${bid}`, blockId: bid, districtId: 'HL', polygon: poly, area: r2(area(poly)), frontageEdgeId: e.id, frontDir: dir, frontNormal: [-n[0], -n[1]], use: 'building', fence: null, address: `${k} ${e.name}` });
    }
  }
  log(`hinterland compounds: ${k}`);
}
function q(poly: Polygon, blocks: Block[]): boolean { const c = centroid(poly); return blocks.some(b => b.districtId !== 'HL' && pointInPolygon(c, b.polygon)); }

log('buildings…');
const bres = buildBuildings(blocks, parcels, rb.edgeById, ground, rng.fork('buildings'), rb.nodes);
log(`buildings: ${bres.buildings.length}, landmarks: ${bres.landmarks.length}`);

log('props…');
const props = buildProps({ nodes: rb.nodes, edges: rb.edges, edgeById: rb.edgeById, nodeById: rb.nodeById, parcels, blocks, buildings: bres.buildings, terrain, ground, rng: rng.fork('props'), cityBounds, worldBounds: WORLD });
const allProps: Prop[] = [...bres.props, ...props].map((p: Omit<Prop, 'y'> & { y?: number }) => {
  const y = p.y ?? (p.t === 'boat' || p.t === 'pier' ? WATER_LEVEL : ground.height(p.x, p.z));
  const o: Prop = { t: p.t, x: r2(p.x), z: r2(p.z), y: r2(y), r: r2(p.r ?? 0, 3) };
  if (p.s !== undefined) o.s = Array.isArray(p.s) ? p.s.map(v => r2(v)) as any : r2(p.s);
  if (p.v !== undefined) o.v = p.v; if (p.c) o.c = p.c; if (p.p) o.p = p.p.map(v => r2(v)); if (p.text) o.text = p.text; if (p.e) o.e = [r2(p.e[0]), r2(p.e[1])];
  return o;
});
log(`props: ${allProps.length}`);

// ── districts ──
const districts: District[] = DISTRICTS.map(d => ({ id: d.code, code: d.code, name: d.name, character: d.character, polygon: d.polygon, color: d.color, center: centroid(d.polygon).map(v => r2(v)) as Vec2 }));
districts.push({ id: 'HL', code: 'HL', name: HINTERLAND.name, character: HINTERLAND.character, polygon: [[WORLD[0], WORLD[1]], [WORLD[2], WORLD[1]], [WORLD[2], WORLD[3]], [WORLD[0], WORLD[3]]], color: HINTERLAND.color, center: [0, 0] });

// ── stats ──
const roadLength: Record<string, number> = {};
for (const e of rb.edges) roadLength[e.cls] = r2((roadLength[e.cls] ?? 0) + polylineLength(e.points));
const buildingsByDistrict: Record<string, number> = {}; const byUse: Record<string, number> = {}; const byArch: Record<string, number> = {};
for (const b of bres.buildings) { buildingsByDistrict[b.districtId] = (buildingsByDistrict[b.districtId] ?? 0) + 1; byUse[b.use] = (byUse[b.use] ?? 0) + 1; byArch[b.archetype] = (byArch[b.archetype] ?? 0) + 1; }
const propsByType: Record<string, number> = {}; for (const p of allProps) propsByType[p.t] = (propsByType[p.t] ?? 0) + 1;
const parcelsByUse: Record<string, number> = {}; for (const p of parcels) parcelsByUse[p.use] = (parcelsByUse[p.use] ?? 0) + 1;
const stats: CityStats = {
  nodes: rb.nodes.length, edges: rb.edges.length, roadLengthByClass: roadLength, blocks: blocks.length, parcels: parcels.length, parcelsByUse,
  buildings: bres.buildings.length, buildingsByDistrict, buildingsByUse: byUse, buildingsByArchetype: byArch, landmarks: bres.landmarks.length, props: allProps.length, propsByType,
  streets: rb.streets.length, bridges: rb.edges.filter(e => e.bridge).length, intersections: rb.nodes.filter(n => n.edges.length >= 3).length, roundabouts: rb.nodes.filter(n => n.kind === 'roundabout').length,
};

const city: CityData = {
  meta: { name: 'Vora City', country: 'Republic of V', seed, version: VERSION, generatedAt: new Date().toISOString(), units: 'meters', terrain: terrainParams, bounds: WORLD },
  water: DEFAULT_WATER, districts,
  roads: {
    nodes: rb.nodes.map(n => ({ ...n, x: r2(n.x), z: r2(n.z) })),
    edges: rb.edges.map(e => ({ ...e, points: e.points.map(p => [r2(p[0]), r2(p[1])] as Vec2), heights: e.heights.map(h => r2(h)), length: r2(e.length) })),
    profiles: ROAD_PROFILES,
  },
  streets: rb.streets,
  blocks: blocks.map(b => ({ ...b, polygon: rp(b.polygon), buildable: b.buildable ? rp(b.buildable) : null, area: r2(b.area) })),
  parcels: parcels.map(p => ({ ...p, polygon: rp(p.polygon), area: r2(p.area), frontDir: p.frontDir ? [r2(p.frontDir[0], 4), r2(p.frontDir[1], 4)] : null, frontNormal: p.frontNormal ? [r2(p.frontNormal[0], 4), r2(p.frontNormal[1], 4)] : null, gate: p.gate ? { ...p.gate, x: r2(p.gate.x), z: r2(p.gate.z) } : null })),
  buildings: bres.buildings.map(b => ({ ...b, masses: b.masses.map(m => ({ ...m, x: r2(m.x), z: r2(m.z), w: r2(m.w), d: r2(m.d), rot: r2(m.rot, 4), footprint: rp(m.footprint) })) })),
  landmarks: bres.landmarks, props: allProps, stats,
};
function rp(poly: Polygon): Polygon { return poly.map(p => [r2(p[0]), r2(p[1])]); }

mkdirSync(resolve('data'), { recursive: true });
const json = JSON.stringify(city);
writeFileSync(resolve(process.env.OUT ?? 'data/city.json'), json);
log(`wrote data/city.json (${(json.length / 1e6).toFixed(2)} MB)`);
console.log(JSON.stringify(stats, null, 1));
