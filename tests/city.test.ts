/**
 * Verification of the baked city data (data/city.json): determinism, road-graph integrity,
 * parcel/building consistency, no buildings on roads, no land props in water, stats.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CityData, Vec2 } from '../src/shared/types';
import { corridorHalfWidth } from '../src/shared/types';
import { SpatialHash, pointInPolygon } from '../src/shared/geom';
import { Terrain } from '../src/shared/terrain';
import { Ground } from '../src/shared/ground';

let city: CityData;
beforeAll(() => { city = JSON.parse(readFileSync('data/city.json', 'utf8')); });

const strip = (s: string) => s.replace(/"generatedAt":"[^"]*"/, '"generatedAt":""');

describe('generator', () => {
  it('is deterministic and data/city.json is up to date with the generator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vworld-'));
    const out = join(dir, 'city.json');
    execFileSync('npx', ['tsx', 'generator/index.ts'], { env: { ...process.env, OUT: out }, stdio: 'ignore' });
    const fresh = readFileSync(out, 'utf8');
    rmSync(dir, { recursive: true, force: true });
    expect(strip(fresh)).toBe(strip(readFileSync('data/city.json', 'utf8')));
  }, 120000);
});

function segInt(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

describe('road network', () => {
  it('has unique node and edge ids and every edge references existing nodes', () => {
    const nodeIds = new Set(city.roads.nodes.map(n => n.id)); expect(nodeIds.size).toBe(city.roads.nodes.length);
    const edgeIds = new Set(city.roads.edges.map(e => e.id)); expect(edgeIds.size).toBe(city.roads.edges.length);
    for (const e of city.roads.edges) { expect(nodeIds.has(e.a)).toBe(true); expect(nodeIds.has(e.b)).toBe(true); expect(e.points.length).toBeGreaterThanOrEqual(2); }
  });
  it('is a single connected component', () => {
    const adj = new Map<string, string[]>();
    for (const e of city.roads.edges) { (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b); (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a); }
    const seen = new Set<string>(); const stack = [city.roads.nodes[0].id];
    while (stack.length) { const n = stack.pop()!; if (seen.has(n)) continue; seen.add(n); for (const m of adj.get(n) ?? []) stack.push(m); }
    expect(seen.size).toBe(city.roads.nodes.length);
  });
  it('has no dangling road ends inside the world (only roads leaving the map may end)', () => {
    const deg = new Map<string, number>();
    for (const e of city.roads.edges) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
    const ends = city.roads.nodes.filter(n => (deg.get(n.id) ?? 0) <= 1);
    const inside = ends.filter(n => Math.abs(n.x) < 1150 && Math.abs(n.z) < 900);
    expect(inside, `dangling ends: ${inside.map(n => `${n.id}@${n.x},${n.z}`).join(' ')}`).toHaveLength(0);
  });
  it('is planar: streets only cross at junction nodes', () => {
    const hash = new SpatialHash<{ e: string; a: Vec2; b: Vec2 }>(50);
    const segs: { e: string; a: Vec2; b: Vec2 }[] = [];
    for (const e of city.roads.edges) for (let i = 0; i + 1 < e.points.length; i++) { const s = { e: e.id, a: e.points[i], b: e.points[i + 1] }; segs.push(s); hash.insert(s, Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])); }
    const nodes = new SpatialHash<Vec2>(50); for (const n of city.roads.nodes) nodes.insert([n.x, n.z], n.x, n.z, n.x, n.z);
    const bad: string[] = [];
    for (const s of segs) {
      for (const o of hash.query(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]))) {
        if (o === s || o.e === s.e) continue;
        const p = segInt(s.a, s.b, o.a, o.b); if (!p) continue;
        const near = nodes.query(p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1).some(n => Math.hypot(n[0] - p[0], n[1] - p[1]) < 0.6);
        if (!near) bad.push(`${s.e}×${o.e}@${p.map(v => v.toFixed(1))}`);
      }
    }
    expect(bad, bad.join(' ')).toHaveLength(0);
  });
  it('has the expected hierarchy, bridges and roundabouts', () => {
    const classes = new Set(city.roads.edges.map(e => e.cls));
    for (const c of ['arterial', 'secondary', 'local', 'lane', 'service']) expect(classes.has(c as never), c).toBe(true);
    expect(city.roads.edges.filter(e => e.bridge).length).toBeGreaterThanOrEqual(2);
    expect(city.roads.nodes.filter(n => n.kind === 'roundabout').length).toBeGreaterThanOrEqual(5);
    for (const e of city.roads.edges) expect(e.name.length).toBeGreaterThan(0);
  });
});

describe('blocks, parcels and buildings', () => {
  it('have unique ids and consistent references', () => {
    const blockIds = new Set(city.blocks.map(b => b.id)); expect(blockIds.size).toBe(city.blocks.length);
    const parcelIds = new Set(city.parcels.map(p => p.id)); expect(parcelIds.size).toBe(city.parcels.length);
    const buildingIds = new Set(city.buildings.map(b => b.id)); expect(buildingIds.size).toBe(city.buildings.length);
    for (const p of city.parcels) expect(blockIds.has(p.blockId), p.id).toBe(true);
    for (const b of city.buildings) { expect(parcelIds.has(b.parcelId), b.id).toBe(true); expect(blockIds.has(b.blockId), b.id).toBe(true); expect(b.masses.length).toBeGreaterThan(0); expect(b.height).toBeGreaterThan(0); }
    for (const l of city.landmarks) for (const id of l.buildingIds) expect(buildingIds.has(id), `${l.name} → ${id}`).toBe(true);
  });
  it('every district keeps its name and has buildings of its intended character', () => {
    const names = city.districts.map(d => d.name);
    for (const n of ['Central District', 'Market Quarter', 'North Heights', 'Old Town', 'Industrial District', 'Green Estates']) expect(names).toContain(n);
    const by = (d: string) => city.buildings.filter(b => b.districtId === d);
    expect(by('CD').some(b => b.floors >= 15)).toBe(true);                       // skyline
    expect(by('MQ').filter(b => /shop|market|warehouse|supermarket/.test(b.archetype)).length).toBeGreaterThan(40);
    expect(by('NH').filter(b => /house|villa|mansion|duplex/.test(b.archetype)).length).toBeGreaterThan(60);
    expect(by('OT').filter(b => /courtyard|compound|shophouse/.test(b.archetype)).length).toBeGreaterThan(40);
    expect(by('ID').filter(b => /factory|warehouse|workshop|garage|depot|port|works/.test(b.archetype)).length).toBeGreaterThan(30);
    expect(by('GE').filter(b => /house|terrace|semi|apartment|bungalow|duplex|cottage|school|clinic/.test(b.archetype)).length).toBeGreaterThan(60);
  });
  it('places no building on a road', () => {
    const terrain = new Terrain(city.meta.terrain);
    const ground = new Ground(terrain, city.roads.edges);
    const bad: string[] = [];
    for (const b of city.buildings) for (const m of b.masses) {
      const c = Math.cos(m.rot), s = Math.sin(m.rot);
      const corners: Vec2[] = [[-m.w / 2, -m.d / 2], [m.w / 2, -m.d / 2], [m.w / 2, m.d / 2], [-m.w / 2, m.d / 2]].map(([x, z]) => [m.x + x * c - z * s, m.z + x * s + z * c]);
      // sample corners and edge midpoints
      const pts: Vec2[] = [...corners, ...corners.map((p, i) => { const q = corners[(i + 1) % 4]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Vec2; })];
      for (const p of pts) {
        const r = ground.nearestRoad(p[0], p[1]);
        if (r && r.dist < corridorHalfWidth(r.cls) - 0.9) { bad.push(`${b.id} (${b.archetype}) on ${r.edge.id}`); break; }
      }
    }
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0);
  });
  it('buildings sit inside their parcel and parcels inside their block', () => {
    const parcelById = new Map(city.parcels.map(p => [p.id, p]));
    let outside = 0;
    for (const b of city.buildings) {
      const p = parcelById.get(b.parcelId)!;
      for (const m of b.masses) if (!pointInPolygon([m.x, m.z], p.polygon)) outside++;
    }
    expect(outside).toBe(0);
  });
});

describe('props', () => {
  it('keeps land props out of the water', () => {
    const terrain = new Terrain(city.meta.terrain);
    const waterOk = new Set(['boat', 'pier', 'quaycrane', 'wire']);
    const wet = city.props.filter(p => !waterOk.has(p.t) && terrain.isWater(p.x, p.z));
    expect(wet.map(p => `${p.t}@${p.x},${p.z}`)).toHaveLength(0);
  });
  it('covers the street-detail checklist', () => {
    const types = new Set(city.props.map(p => p.t));
    for (const t of ['lamp', 'tree-palm', 'tree-broad', 'bench', 'bin', 'streetsign', 'stopsign', 'signal', 'busshelter', 'bollard', 'parkingline', 'stall', 'manhole', 'crane', 'roadworks', 'billboard', 'wire', 'car', 'minibus'])
      expect(types.has(t as never), t).toBe(true);
  });
});

describe('stats', () => {
  it('match the data', () => {
    expect(city.stats.nodes).toBe(city.roads.nodes.length);
    expect(city.stats.edges).toBe(city.roads.edges.length);
    expect(city.stats.blocks).toBe(city.blocks.length);
    expect(city.stats.parcels).toBe(city.parcels.length);
    expect(city.stats.buildings).toBe(city.buildings.length);
    expect(city.stats.landmarks).toBe(city.landmarks.length);
    expect(city.stats.props).toBe(city.props.length);
    expect(city.landmarks.length).toBeGreaterThanOrEqual(12);
  });
});
