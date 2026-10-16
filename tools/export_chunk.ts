/**
 * Exports deterministic Vora City planner data for Godot. The city plan remains the single source
 * of truth; this tool cuts the plan into 128 m runtime chunks and samples matching terrain.
 *
 * Single starter block (legacy S0):
 *   npx tsx tools/export_chunk.ts --name s0 --box -480,-510,-220,-250 --grid 2
 * Complete city chunk set (S1):
 *   npx tsx tools/export_chunk.ts --all --chunk-size 128 --grid 2
 */
import fs from 'node:fs';
import path from 'node:path';
import { Terrain, makeTerrainParams } from '../src/shared/terrain';

type Vec2 = [number, number];
type Box = [number, number, number, number];
type Args = Record<string, string | boolean>;

const args: Args = {};
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const key = token.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) { args[key] = next; i++; }
  else args[key] = true;
}

const city = JSON.parse(fs.readFileSync(path.resolve('data/city.json'), 'utf8'));
const terrain = new Terrain(makeTerrainParams(city.meta.seed));
const landmarks = city.landmarks as any[];
const jag = landmarks.find((l) => l.id === 'L-jag-house');
const plateauPoly: Vec2[] = jag.plateau.polygon;
const plateauY: number = jag.plateau.y;
const allEdges = city.roads.edges as any[];
const profiles = city.roads.profiles;
const outputDir = path.resolve('godot/assets/world');
const chunkDir = path.join(outputDir, 'chunks');

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

function segmentRect(a: Vec2, b: Vec2, box: Box): [number, number] | null {
  // Liang–Barsky clip; returns the inclusive segment interval inside the tile.
  const [x0, z0, x1, z1] = box;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dz, a[1] - z0], [dz, z1 - a[1]]] as [number, number][]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > hi) return null; lo = Math.max(lo, t); }
    else { if (t < lo) return null; hi = Math.min(hi, t); }
  }
  return hi - lo > 1e-8 ? [lo, hi] : null;
}

function clipRoad(edge: any, box: Box, cx: number, cz: number): any[] {
  const points: Vec2[] = edge.points;
  const heights: number[] = edge.heights;
  const pieces: any[] = [];
  let runPoints: Vec2[] = [];
  let runHeights: number[] = [];
  let runA = '';
  let runB = '';
  let runNo = 0;
  const flush = () => {
    if (runPoints.length >= 2) {
      const length = runPoints.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - runPoints[i][0], p[1] - runPoints[i][1]), 0);
      if (length > 0.5) pieces.push({
        id: `${edge.id}@${cx}_${cz}_${runNo++}`, a: runA || `clip:${edge.id}:${cx}:${cz}:a:${runNo}`,
        b: runB || `clip:${edge.id}:${cx}:${cz}:b:${runNo}`, cls: edge.cls, name: edge.name,
        street: edge.streetId, points: runPoints, heights: runHeights, profile: profiles[edge.cls],
      });
    }
    runPoints = []; runHeights = []; runA = ''; runB = '';
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const hit = segmentRect(points[i], points[i + 1], box);
    if (!hit) { flush(); continue; }
    const [t0, t1] = hit;
    const p0: Vec2 = [points[i][0] + (points[i + 1][0] - points[i][0]) * t0, points[i][1] + (points[i + 1][1] - points[i][1]) * t0];
    const p1: Vec2 = [points[i][0] + (points[i + 1][0] - points[i][0]) * t1, points[i][1] + (points[i + 1][1] - points[i][1]) * t1];
    const h0 = heights[i] + (heights[i + 1] - heights[i]) * t0;
    const h1 = heights[i] + (heights[i + 1] - heights[i]) * t1;
    const contiguous = runPoints.length > 0 && Math.hypot(runPoints[runPoints.length - 1][0] - p0[0], runPoints[runPoints.length - 1][1] - p0[1]) < 0.02;
    if (!contiguous && runPoints.length > 0) flush();
    if (runPoints.length === 0) {
      runPoints.push(p0); runHeights.push(h0);
      runA = i === 0 && t0 < 1e-7 ? edge.a : '';
    }
    if (Math.hypot(runPoints[runPoints.length - 1][0] - p1[0], runPoints[runPoints.length - 1][1] - p1[1]) > 0.01) {
      runPoints.push(p1); runHeights.push(h1);
    }
    runB = i === points.length - 2 && t1 > 1 - 1e-7 ? edge.b : '';
    if (t1 < 1 - 1e-7) flush();
  }
  flush();
  return pieces;
}

function bboxTouches(points: Vec2[], box: Box, pad = 0): boolean {
  const [x0, z0, x1, z1] = box;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  return maxX >= x0 - pad && minX <= x1 + pad && maxZ >= z0 - pad && minZ <= z1 + pad;
}

function buildChunk(name: string, box: Box, grid: number, cx = 0, cz = 0, tileMode = false): any {
  const [x0, z0, x1, z1] = box;
  const inBox = (x: number, z: number, pad = 0) => x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad;
  const ownsPoint = (x: number, z: number) => x >= x0 - 1e-6 && x < x1 - 1e-6 && z >= z0 - 1e-6 && z < z1 - 1e-6;

  // Height flattening needs road centerlines just outside the tile (the smooth shoulder is 6 m wide).
  const heightEdges = allEdges.filter((e) => bboxTouches(e.points, box, 36)).map((e) => ({ ...e, profile: profiles[e.cls] }));
  function roadHeightNear(x: number, z: number): { d: number; h: number; halfW: number } | null {
    let best: { d: number; h: number; halfW: number } | null = null;
    for (const r of heightEdges) {
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

  const roads: any[] = [];
  if (tileMode) {
    for (const edge of allEdges) {
      if (!bboxTouches(edge.points, box)) continue;
      roads.push(...clipRoad(edge, box, cx, cz));
    }
  } else {
    // Keep the original S0 starter-block export stable: complete nearby road edges are useful for
    // its close-up NPC routes and the old scene is kept as the user's phone-test baseline.
    for (const edge of allEdges.filter((e) => e.points.some((p: Vec2) => inBox(p[0], p[1], 30)))) {
      roads.push({ id: edge.id, a: edge.a, b: edge.b, cls: edge.cls, name: edge.name, street: edge.streetId,
        points: edge.points, heights: edge.heights, profile: profiles[edge.cls] });
    }
  }

  // Tile mode assigns every mass once by its stable center, avoiding duplicated whole buildings at
  // chunk seams. The legacy S0 block preserves its original whole-building export semantics.
  const buildings: any[] = [];
  for (const b of city.buildings as any[]) {
    const masses = tileMode ? b.masses.filter((m: any) => ownsPoint(m.x, m.z)) :
      (b.masses.some((m: any) => inBox(m.x, m.z)) ? b.masses : []);
    if (!masses.length) continue;
    buildings.push({
      id: b.id, archetype: b.archetype, use: b.use, name: b.name, district: b.districtId,
      masses: masses.map((m: any) => ({
        x: m.x, z: m.z, w: m.w, d: m.d, rot: m.rot, floors: m.floors, fh: m.floorHeight, baseY: m.baseY, plinth: m.plinthBottom,
        roof: m.roof, facade: m.facade, features: (m.features ?? []).map((f: any) => f.kind), footprint: m.footprint,
      })),
    });
  }
  const props = (city.props as any[])
    .filter((p) => tileMode ? ownsPoint(p.x, p.z) : inBox(p.x, p.z))
    .map((p) => ({ t: p.t, x: p.x, z: p.z, y: p.y, r: p.r ?? 0, s: p.s ?? 1, p: p.p }));

  return {
    name, cx, cz, size: x1 - x0, box, grid, nx, nz, origin: [x0, z0], heights, roads, buildings, props,
    plateau: { polygon: plateauPoly, y: plateauY },
    jag: { x: jag.x, z: jag.z, view: jag.view },
    district: 'NH',
  };
}

function writeOne(name: string, box: Box, grid: number, cx = 0, cz = 0, outDir = outputDir, tileMode = false): number {
  const out = buildChunk(name, box, grid, cx, cz, tileMode);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out));
  return fs.statSync(outPath).size;
}

if (args.all) {
  const chunkSize = Number(args['chunk-size'] ?? 128);
  const grid = Number(args.grid ?? 2);
  if (!Number.isFinite(chunkSize) || chunkSize <= 0 || Math.abs(chunkSize / grid - Math.round(chunkSize / grid)) > 1e-8) {
    throw new Error('chunk size must be a positive multiple of the terrain grid');
  }
  const bounds: [number, number, number, number] = city.meta.bounds;
  const [minX, minZ, maxX, maxZ] = bounds;
  const minCX = Math.floor(minX / chunkSize) - 1;
  const maxCX = Math.floor(maxX / chunkSize) + 1;
  const minCZ = Math.floor(minZ / chunkSize) - 1;
  const maxCZ = Math.floor(maxZ / chunkSize) + 1;
  fs.rmSync(chunkDir, { recursive: true, force: true });
  fs.mkdirSync(chunkDir, { recursive: true });
  let totalBytes = 0, count = 0;
  for (let cz = minCZ; cz <= maxCZ; cz++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      const name = `c_${cx}_${cz}`;
      const size = chunkSize;
      const bytes = writeOne(name, [cx * size, cz * size, (cx + 1) * size, (cz + 1) * size], grid, cx, cz, chunkDir, true);
      totalBytes += bytes; count++;
    }
  }
  const index = {
    chunk_size: chunkSize, grid, min_cx: minCX, max_cx: maxCX, min_cz: minCZ, max_cz: maxCZ,
    count, bounds, districts: (city.districts as any[]).filter((d) => d.code !== 'HL').map((d) => ({ id: d.code, name: d.name, polygon: d.polygon, color: d.color })),
  };
  fs.writeFileSync(path.join(chunkDir, 'index.json'), JSON.stringify(index));
  console.log(`Godot city chunks: ${count} × ${chunkSize} m, grid ${grid} m; ${Math.round(totalBytes / 1024 / 1024 * 100) / 100} MiB JSON`);
  console.log(`chunk coords x ${minCX}..${maxCX}, z ${minCZ}..${maxCZ}; index ${path.join(chunkDir, 'index.json')}`);
} else {
  const name = String(args.name ?? 's0');
  const box = String(args.box ?? '-480,-510,-220,-250').split(',').map(Number) as Box;
  const grid = Number(args.grid ?? 2);
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || box[2] <= box[0] || box[3] <= box[1] || grid <= 0) {
    throw new Error('invalid --box or --grid');
  }
  const bytes = writeOne(name, box, grid);
  const outPath = path.join(outputDir, `${name}.json`);
  const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const minH = Math.min(...parsed.heights), maxH = Math.max(...parsed.heights);
  console.log(`${outPath}: ${Math.round(bytes / 1024)} KB, grid ${parsed.nx}x${parsed.nz}, roads ${parsed.roads.length}, buildings ${parsed.buildings.length}, props ${parsed.props.length}`);
  console.log(`heights ${minH}..${maxH}  jag plateau ${plateauY}`);
}
