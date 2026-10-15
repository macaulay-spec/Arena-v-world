/**
 * Point inspector (headless): for a list of mansion-local points prints the collision ground, the
 * terrain height, what the down-ray hits (object name + height) and every collision blocker within
 * reach of a player standing there — the quickest way to answer "what am I stuck on / standing in".
 *
 *   node scripts/game-inspect.mjs "X,Y,Z;X,Y,Z;..." [baseUrl]   (env: QUALITY)
 */
import { launchBrowser, bootGame } from './lib/headless.mjs';

const pts = (process.argv[2] ?? '29.66,3.85,29.99').split(';').map(s => s.split(',').map(Number));
const base = process.argv[3] ?? 'http://localhost:5173/';
const { browser, page } = await launchBrowser();
await bootGame(page, base, process.env.QUALITY ?? 'lite');

const out = await page.evaluate((pts) => {
  const v = window.vora, m = v.mansion, [ox, oy, oz] = m.origin, col = v.collision, THREE = v.THREE;
  const ray = new THREE.Raycaster(); ray.far = 80; const down = new THREE.Vector3(0, -1, 0);
  const world = v.scene.getObjectByName('world');
  const targets = [m.group, world?.getObjectByName('terrain'), ...(world?.children.filter(c => /^(roads|surfaces):/.test(c.name || '')) ?? []), v.household?.group].filter(Boolean);
  const nameOf = (o) => { const parts = []; for (let p = o; p && p !== v.scene; p = p.parent) parts.unshift(p.name || p.type); return parts.join('/'); };
  return pts.map(([X, Y, Z]) => {
    const x = ox + X, y = oy + Y, z = oz + Z;
    ray.set(new THREE.Vector3(x, y + 1.2, z), down);
    const hits = ray.intersectObjects(targets, true).filter(h => h.object.visible).slice(0, 6).map(h => {
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
      return { y: +(h.point.y - oy).toFixed(3), ny: n ? +n.y.toFixed(2) : null, object: nameOf(h.object), tri: h.faceIndex };
    });
    const near = [];
    const r = 0.34, R = 0.6;
    for (const b of col.query(col.cells, x - R, z - R, x + R, z + R, [])) {
      let d;
      if (b.kind === 'seg') { const abx = b.bx - b.ax, abz = b.bz - b.az, l2 = abx * abx + abz * abz || 1; const t = Math.max(0, Math.min(1, ((x - b.ax) * abx + (z - b.az) * abz) / l2)); d = Math.hypot(x - (b.ax + abx * t), z - (b.az + abz * t)); }
      else if (b.kind === 'cyl') d = Math.hypot(x - b.x, z - b.z) - b.r;
      else if (b.kind === 'box') d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
      else d = 0;
      if (d > R) continue;
      const local = (k) => +(k - (k === b.ax || k === b.bx || k === b.x || k === b.minX || k === b.maxX ? ox : oz)).toFixed(2);
      const desc = b.kind === 'seg' ? `seg (${(b.ax - ox).toFixed(2)},${(b.az - oz).toFixed(2)})→(${(b.bx - ox).toFixed(2)},${(b.bz - oz).toFixed(2)})`
        : b.kind === 'cyl' ? `cyl (${(b.x - ox).toFixed(2)},${(b.z - oz).toFixed(2)}) r${b.r}`
        : b.kind === 'box' ? `box [${(b.minX - ox).toFixed(2)},${(b.minZ - oz).toFixed(2)}..${(b.maxX - ox).toFixed(2)},${(b.maxZ - oz).toFixed(2)}]` : `poly`;
      void local;
      near.push({ d: +d.toFixed(3), blocks: d < r && y + 0.42 < b.y1 && y + 1.7 > b.y0, y0: +(b.y0 - oy).toFixed(2), y1: +(b.y1 - oy).toFixed(2), desc });
    }
    near.sort((a, b) => a.d - b.d);
    const surf = col.query(col.surfCells, x, z, x, z, []).filter(s => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ).map(s => ({ y: +(s.y - oy).toFixed(3), rect: [+(s.minX - ox).toFixed(2), +(s.minZ - oz).toFixed(2), +(s.maxX - ox).toFixed(2), +(s.maxZ - oz).toFixed(2)] })).sort((a, b) => b.y - a.y);
    return { point: [X, Y, Z], ground: +(col.groundAt(x, z, y, 0.42) - oy).toFixed(3), terrain: +(col.terrain(x, z) - oy).toFixed(3), room: m.roomAt?.(x, y, z) ?? null, hits, surfaces: surf.slice(0, 5), blockers: near.slice(0, 8) };
  });
}, pts);
console.log(JSON.stringify(out, null, 1));
await browser.close();
