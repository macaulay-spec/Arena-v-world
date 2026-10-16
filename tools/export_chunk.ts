/**
 * Exports a rectangular slice of the Vora City plan (data/city.json + the terrain function) into a
 * compact JSON the Godot runtime builds geometry from. The city plan stays the single source of
 * truth; this is the bridge between the planner and the engine.
 *
 *   npx tsx tools/export_chunk.ts --name s0 --box -480,-500,-220,-250 --grid 2
 *
 * Output: godot/assets/world/<name>.json
 *   { box, grid, heights[] (row-major, z then x), roads[], buildings[], props[], plateau }
 */
import fs from 'node:fs';
import path from 'node:path';
import { Terrain, makeTerrainParams } from '../src/shared/terrain';

type Vec2 = [number, number];
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter((p) => p.length));
const name = args.name ?? 's0';
const box = (args.box ?? '-480,-510,-220,-250').split(',').map(Number) as [number, number, number, number];
const grid = Number(args.grid ?? 2);
const [x0, z0, x1, z1] = box;

const city = JSON.parse(fs.readFileSync(path.resolve('data/city.json'), 'utf8'));
const terrain = new Terrain(makeTerrainParams(city.meta.seed));
const landmarks = city.landmarks as any[];
const jag = landmarks.find((l) => l.id === 'L-jag-house');
const plateauPoly: Vec2[] = jag.plateau.polygon;
const plateauY: number = jag.plateau.y;

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / (abx * abx + abz * abz || 1)));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t)));
  }
  return best;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// roads inside the box (edges touching the box)
const nodes = new Map<string, any>((city.roads.nodes as any[]).map((n) => [n.id, n]));
const profiles = city.roads.profiles;
const inBox = (x: number, z: number, pad = 0) => x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad;
const roads = (city.roads.edges as any[])
  .filter((e) => e.points.some((p: Vec2) => inBox(p[0], p[1], 30)))
  .map((e) => ({ id: e.id, a: e.a, b: e.b, cls: e.cls, name: e.name, street: e.streetId, points: e.points, heights: e.heights, profile: profiles[e.cls] }));

// height with the JAG plateau and road flattening applied
function roadHeightNear(x: number, z: number): { d: number; h: number; halfW: number } | null {
  let best: { d: number; h: number; halfW: number } | null = null;
  for (const r of roads) {
    const halfW = r.profile.carriageway / 2 + r.profile.sidewalk + (r.profile.median ?? 0) / 2;
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const abx = b[0] - a[0], abz = b[1] - a[1];
      const len2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / len2));
      const d = Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
      if (!best || d < best.d) best = { d, h: r.heights[i] + (r.heights[i + 1] - r.heights[i]) * t, halfW };
    }
  }
  return best;
}
function heightAt(x: number, z: number): number {
  let h = terrain.height(x, z);
  const p: Vec2 = [x, z];
  if (pointInPoly(p, plateauPoly)) h = plateauY;
  else { const d = distToPoly(p, plateauPoly); if (d < 14) h = h + (plateauY - h) * (1 - smooth(0, 14, d)); }
  const r = roadHeightNear(x, z);
  if (r && r.d < r.halfW + 6) {
    const t = 1 - smooth(r.halfW + 0.5, r.halfW + 6, r.d);
    h = h + (r.h - 0.03 - h) * t;
  }
  return h;
}

const nx = Math.round((x1 - x0) / grid) + 1, nz = Math.round((z1 - z0) / grid) + 1;
const heights: number[] = new Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = +heightAt(x0 + i * grid, z0 + j * grid).toFixed(2);

const buildings = (city.buildings as any[])
  .filter((b) => b.masses.some((m: any) => inBox(m.x, m.z)))
  .map((b) => ({
    id: b.id, archetype: b.archetype, use: b.use, name: b.name, district: b.districtId,
    masses: b.masses.map((m: any) => ({
      x: m.x, z: m.z, w: m.w, d: m.d, rot: m.rot, floors: m.floors, fh: m.floorHeight, baseY: m.baseY, plinth: m.plinthBottom,
      roof: m.roof, facade: m.facade, features: (m.features ?? []).map((f: any) => f.kind), footprint: m.footprint,
    })),
  }));

const props = (city.props as any[])
  .filter((p) => inBox(p.x, p.z))
  .map((p) => ({ t: p.t, x: p.x, z: p.z, y: p.y, r: p.r ?? 0, s: p.s ?? 1, p: p.p }));

const out = {
  name, box, grid, nx, nz, origin: [x0, z0], heights, roads, buildings, props,
  plateau: { polygon: plateauPoly, y: plateauY },
  jag: { x: jag.x, z: jag.z, view: jag.view },
  district: 'NH',
};
const outPath = path.resolve('godot/assets/world', `${name}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`${outPath}: ${kb} KB, grid ${nx}x${nz}, roads ${roads.length}, buildings ${buildings.length} (${buildings.reduce((s, b) => s + b.masses.length, 0)} masses), props ${props.length}`);
const minH = Math.min(...heights), maxH = Math.max(...heights);
console.log(`heights ${minH}..${maxH}  jag plateau ${plateauY}`);
