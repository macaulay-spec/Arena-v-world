/**
 * Runtime audit probe (headless Chromium + SwiftShader): boots the game, starts a new game and then
 * inspects the live state through window.vora — ground height vs. geometry along the exit routes,
 * scene triangle composition per group (city / mansion / household / crowd / player), and the CPU
 * cost of door / gate interactions. Prints JSON; no screenshots.
 *
 *   node scripts/game-audit.mjs [baseUrl]   (env: QUALITY=lite|standard|high)
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const base = process.argv[2] ?? 'http://localhost:5173/';
const QUALITY = process.env.QUALITY ?? 'lite';
const W = 960, H = 540;

const executablePath = await chromium.executablePath();
if (!process.env.LD_LIBRARY_PATH?.includes('/tmp/al2023/lib')) {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const lambdafs = req('@sparticuz/chromium/build/lambdafs.js').default;
  const binDir = req.resolve('@sparticuz/chromium/package.json').replace(/package\.json$/, 'bin');
  await lambdafs.inflate(`${binDir}/al2023.tar.br`);
  process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
const browser = await puppeteer.launch({
  executablePath, env: { ...process.env },
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, headless: true,
});
const page = await browser.newPage();
await page.emulate({ viewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
const frames = async (n) => { const f0 = await page.evaluate(() => window.vora.frame ?? 0); await page.waitForFunction((f0, n) => (window.vora.frame ?? 0) >= f0 + n, { timeout: 180000 }, f0, n); };

await page.evaluateOnNewDocument((q) => { localStorage.clear(); localStorage.setItem('voracity.settings.v1', JSON.stringify({ quality: q })); }, QUALITY);
const t0 = Date.now();
await page.goto(base, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.vora && window.vora.state === 'title' && !document.getElementById('screen-title').classList.contains('hidden'), { timeout: 600000 });
console.error('title ready after', ((Date.now() - t0) / 1000).toFixed(0), 's');
await page.evaluate(() => document.getElementById('screen-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await page.click('#btn-new');
await page.waitForFunction(() => window.vora.state === 'create', { timeout: 60000 });
await frames(2);
await page.click('#c-done');
await page.waitForFunction(() => window.vora.state === 'game', { timeout: 120000 });
await frames(3);

const out = await page.evaluate(() => {
  const v = window.vora; const m = v.mansion; const [ox, oy, oz] = m.origin; const col = v.collision;
  // 1. ground along exit routes (local coords) — terrain vs. walkable ground vs. the geometry level the compound was built at (0)
  const probe = (X, Z, yFrom) => { const x = ox + X, z = oz + Z; return { X, Z, terrain: +(col.terrain(x, z) - oy).toFixed(2), ground: +(col.groundAt(x, z, oy + yFrom, 0.42) - oy).toFixed(2) }; };
  const routes = {
    frontDoorToGate: [[33, 45.5, 0.45], [33, 47.2, 0.45], [33, 48.2, 0], [33, 52, 0], [33, 60, 0], [27, 68, 0], [27, 73, 0], [27, 75.7, 0], [27, 77, 0], [27, 80, 0], [27, 84, 0]],
    westLawn: [[3, 10, 0], [3, 30, 0], [3, 50, 0], [3, 70, 0], [10, 26, 0]],
    backDeck: [[20, 2, 0.15], [40, 3, 0.15], [60, 10, 0], [62, 40, 0]],
    carport: [[56, 61.5, 0], [60, 70, 0], [64, 74, 0]],
  };
  const ground = Object.fromEntries(Object.entries(routes).map(([k, pts]) => [k, pts.map(p => probe(...p))]));
  // 2. scene composition: visible triangles / draw calls by top-level group (renderer.info after a render)
  const r = v.renderer, scene = v.scene, cam = v.camera;
  const groups = { world: scene.children.find(c => c.name === 'world'), mansion: m.group, household: v.household.group, crowd: v.crowd?.group, avatar: v.avatar.root };
  const all = () => { r.info.reset(); r.render(scene, cam); return { calls: r.info.render.calls, tris: r.info.render.triangles }; };
  const total = all();
  const composition = {};
  for (const [name, g] of Object.entries(groups)) { if (!g) continue; const was = g.visible; g.visible = false; const without = all(); g.visible = was; composition[name] = { calls: total.calls - without.calls, tris: total.tris - without.tris }; }
  // world sub-meshes by name prefix
  const world = groups.world; const byKind = {};
  if (world) { for (const c of world.children) { const k = (c.name || c.type).split(':')[0]; const was = c.visible; if (!was) continue; c.visible = false; const w = all(); c.visible = true; const e = byKind[k] ?? (byKind[k] = { calls: 0, tris: 0, meshes: 0 }); e.calls += total.calls - w.calls; e.tris += total.tris - w.tris; e.meshes++; } }
  // 3. collision index size + door toggle cost
  const sizes = { blockers: col.blockers.length, surfaces: col.surfaces.length, cells: col.cells?.size ?? null, surfCells: col.surfCells?.size ?? null };
  const door = m.doors[0]; const slider = m.sliders[0];
  const time = (fn, n) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(3); };
  const doorStep = time(() => { door.toggle(); door.update(1 / 60); }, 40);
  const gateStep = time(() => { slider.toggle(); slider.update(1 / 60); }, 40);
  const resolveCost = time(() => col.resolve(v.player.pos.x + 0.1, v.player.pos.z, v.player.pos.y, 0.34, 1.7, [0, 0]), 200);
  const groundCost = time(() => col.groundAt(v.player.pos.x, v.player.pos.z, v.player.pos.y, 0.42), 200);
  return { quality: v.quality, total, composition, byKind, sizes, msPerDoorAnimFrame: doorStep, msPerGateAnimFrame: gateStep, msResolve: resolveCost, msGroundAt: groundCost, ground, memory: performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) } : null, info: { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length } };
});
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
