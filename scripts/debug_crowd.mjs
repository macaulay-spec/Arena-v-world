import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const W = 1400, H = 800;
const executablePath = await chromium.executablePath();
if (!process.env.LD_LIBRARY_PATH?.includes('/tmp/al2023/lib')) {
  const { createRequire } = await import('node:module'); const req = createRequire(import.meta.url);
  const lambdafs = req('@sparticuz/chromium/build/lambdafs.js').default;
  const binDir = req.resolve('@sparticuz/chromium/package.json').replace(/package\.json$/, 'bin');
  await lambdafs.inflate(`${binDir}/al2023.tar.br`);
  process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
const browser = await puppeteer.launch({ executablePath, env: { ...process.env }, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, headless: true });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(process.argv[2] ?? 'http://localhost:5173/?q=medium&crowd=low', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.vworld && document.getElementById('loading')?.classList.contains('hidden'), { timeout: 240000 });
await page.waitForFunction(() => window.vworld.crowd && window.vworld.crowd.progress >= 1, { timeout: 300000 });
if (process.env.WALK) { const [x, z, yaw] = process.env.WALK.split(',').map(Number); await page.evaluate((x, z, yaw) => { const c = window.vworld.controls; c.setMode('walk'); c.walkPos.set(x, 0, z); c.yaw = yaw; c.pitch = 0.02; }, x, z, yaw); }
let f0 = await page.evaluate(() => window.vworld.frame);
await page.waitForFunction((f0) => window.vworld.frame >= f0 + 16, { timeout: 300000 }, f0);
console.log(await page.evaluate(() => { const c = window.vworld.crowd; const f = window.vworld.controls.focus(); const ds = c.agents.map(a => Math.hypot(a.pos.x - f.x, a.pos.z - f.z)); return JSON.stringify({ focus: f.toArray(), mode: window.vworld.controls.mode, camPos: window.vworld.camera.position.toArray(), minD: Math.min(...ds), maxD: Math.max(...ds), alive: c.agents.filter(a => a.alive).length, rootVisible: c.agents.filter(a => a.root.visible).length, stats: c.stats, groupVisible: c.group.visible, recycleTimer: c.recycleTimer, lanes: c.lanes.length }); }));
const dbg = await page.evaluate(() => {
  const c = window.vworld.crowd; const ag = c.agents;
  const out = { n: ag.length, alive: ag.filter(a => a.alive).length, visible: ag.filter(a => a.root.visible).length, groupVisible: c.group.visible, cast: c.cast.length, stats: c.stats };
  const a = ag.find(a => a.alive) ?? ag[0];
  if (a) {
    a.root.updateWorldMatrix(true, true);
    const THREE_Box = a.root.children[0]?.constructor; void THREE_Box;
    let minY = 1e9, maxY = -1e9, meshes = 0, vis = 0;
    a.root.traverse(o => { if (o.isMesh) { meshes++; if (o.visible && o.parent.visible) vis++; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; minY = Math.min(minY, b.min.y); maxY = Math.max(maxY, b.max.y); } });
    out.agent = { id: a.member.entry.id, pos: a.pos.toArray(), rootPos: a.root.position.toArray(), scale: a.root.scale.toArray(), lod: a.lod, lods: a.lods.map(l => l.name + ':' + l.visible), meshes, vis, geomY: [minY, maxY], state: a.state, hasAction: !!a.current, parent: a.root.parent?.name, inScene: !!a.root.parent?.parent };
  }
  return out;
});
console.log(JSON.stringify(dbg, null, 1));
// look at that agent from 7 m
if (!process.env.WALK) await page.evaluate(() => { const c = window.vworld.crowd; const a = c.agents.find(a => a.alive); const p = a.pos; window.vworld.controls.lookAt([p.x + 5, p.y + 2.2, p.z + 5], [p.x, p.y + 1, p.z]); });
f0 = await page.evaluate(() => window.vworld.frame);
await page.waitForFunction((f0) => window.vworld.frame >= f0 + 6, { timeout: 300000 }, f0);
await page.screenshot({ path: '/tmp/cityshots/debug-agent.png' });
console.log(await page.evaluate(() => document.getElementById('hud-fps')?.textContent));
await browser.close();
