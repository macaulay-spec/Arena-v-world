/**
 * Headless smoke test + screenshots of the GAME (index.html): boots through logo → title → creation →
 * wake-up, then walks the player to a few places in JAG House and captures them.
 *
 *   node scripts/game-shot.mjs [baseUrl] [outDir]      (env: QUALITY=lite|standard|high  SHOTS=a,b,c  MOBILE=1)
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? 'docs/screenshots/game';
const W = parseInt(process.env.SHOT_W ?? '1280', 10), H = parseInt(process.env.SHOT_H ?? '720', 10);
mkdirSync(outDir, { recursive: true });

// local mansion coords (x, y, z, yaw) + camera mode + clock; see docs/GAME.md for the room map.
// The world origin of the mansion is read from the live game (window.vora.mansion.origin).
const SHOTS = [
  { name: 'title', title: true },
  { name: 'create', create: true },
  { name: 'wake-up', wake: true },
  { name: 'master-bedroom', at: [21, 3.85, 30.5, Math.PI * 0.75], mode: 'far', minutes: 7 * 60 + 20 },
  { name: 'landing-stairs', at: [33, 3.85, 41, -Math.PI / 2], mode: 'far' },
  { name: 'living-room', at: [24, 0.45, 42, -2.4], mode: 'far', minutes: 9 * 60 },
  { name: 'kitchen', at: [43, 0.45, 30.5, Math.PI - 1.0], mode: 'far' },
  { name: 'dining', at: [40.5, 0.45, 43, -2.2], mode: 'far' },
  { name: 'front-porch', at: [33, 0.45, 46.5, 0], mode: 'far', minutes: 10 * 60 },
  { name: 'forecourt-fountain', at: [33, 0.05, 59, Math.PI], mode: 'far' },
  { name: 'carport', at: [55, 0.05, 61, Math.PI / 2], mode: 'far' },
  { name: 'gate', at: [27, 0.05, 68, 0], mode: 'far' },
  { name: 'pool', at: [41, 0.15, 17, Math.PI], mode: 'far', minutes: 15 * 60 },
  { name: 'roof-terrace', at: [38, 7.25, 44, 0.3], mode: 'far', minutes: 17 * 60 + 30 },
  { name: 'night-living', at: [24, 0.45, 42, -2.4], mode: 'far', minutes: 20 * 60 + 30 },
  { name: 'night-pool', at: [41, 0.15, 17, Math.PI], mode: 'far', minutes: 21 * 60 },
  { name: 'street-outside', at: [27, 0.2, 80, 0.4], mode: 'far', minutes: 11 * 60 },
  { name: 'stair-foot', at: [31.5, 0.45, 42.5, Math.PI], mode: 'far', minutes: 9 * 60 + 30 },
  { name: 'penthouse-door', at: [28.3, 7.25, 30.5, Math.PI], mode: 'far', minutes: 17 * 60 },
  { name: 'pool-steps', at: [51, 0.15, 9, -Math.PI / 2], mode: 'far', minutes: 15 * 60 },
  { name: 'side-gate', at: [22.2, 0.05, 72, 0], mode: 'far', minutes: 11 * 60 },
  { name: 'west-lawn', at: [12, 0.05, 50, Math.PI * 0.8], mode: 'far', minutes: 12 * 60 },
];
const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;
const shots = only ? SHOTS.filter(s => only.has(s.name)) : SHOTS;

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
if (process.env.MOBILE) await page.emulate({ viewport: { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.type(); if (t === 'error') errors.push('console.error: ' + m.text()); else if (t === 'warning' && /three/i.test(m.text())) errors.push('warning: ' + m.text()); else console.log('  [page]', m.text().slice(0, 160)); });
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
page.on('dialog', d => d.accept());

const url = base + (process.env.QUALITY ? (base.includes('?') ? '&' : '?') + 'q=' + process.env.QUALITY : '');
console.log('open', url);
await page.evaluateOnNewDocument((q) => { localStorage.clear(); if (q) localStorage.setItem('voracity.settings.v1', JSON.stringify({ quality: q })); }, process.env.QUALITY ?? 'standard');
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.vora && window.vora.state === 'title' && document.getElementById('screen-title') && !document.getElementById('screen-title').classList.contains('hidden'), { timeout: 400000 });
console.log('title ready');
const frames = async (n) => { const f0 = await page.evaluate(() => window.vora.frame ?? 0); await page.waitForFunction((f0, n) => (window.vora.frame ?? 0) >= f0 + n, { timeout: 120000 }, f0, n); };
const shot = async (name) => { const file = join(outDir, name + '.png'); await page.screenshot({ path: file }); console.log('shot', file); return file; };
const report = [];
let started = false;
for (const s of shots) {
  if (s.title) { await frames(3); report.push({ name: s.name, file: await shot(s.name) }); continue; }
  if (!started) {
    // tap to start → New game
    await page.evaluate(() => document.getElementById('screen-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.click('#btn-new');
    await page.waitForFunction(() => window.vora.state === 'create', { timeout: 60000 });
    await frames(4);
    if (s.create) { report.push({ name: s.name, file: await shot(s.name) }); }
    await page.click('#c-hair-next'); await page.click('#c-outfit-next'); await frames(2);
    await page.click('#c-done');
    await page.waitForFunction(() => window.vora.state === 'cutscene' || window.vora.state === 'game', { timeout: 60000 });
    await frames(3);
    started = true;
    if (s.create) continue;
  }
  if (s.wake) { await frames(4); report.push({ name: s.name, file: await shot(s.name) }); await page.waitForFunction(() => window.vora.state === 'game', { timeout: 60000 }); continue; }
  await page.evaluate((s) => {
    const v = window.vora; const [x, y, z, yaw] = s.at; const O = v.mansion.origin;
    v.player.teleport(O[0] + x, O[1] + y, O[2] + z, yaw); if (v.player.settle) v.player.settle();
    v.chase.mode = s.mode === 'near' ? 'front' : 'near'; v.chase.cycleMode(); if (s.mode === 'far' && v.chase.mode !== 'far') v.chase.cycleMode();
    v.chase.snapBehind(yaw); if (s.minutes !== undefined) v.setClock(s.minutes);
  }, s);
  await frames(8);
  const info = await page.evaluate(() => ({ place: document.getElementById('place')?.textContent, fps: document.getElementById('fps')?.textContent, calls: window.vora.renderer.info.render.calls, tris: window.vora.renderer.info.render.triangles }));
  report.push({ name: s.name, file: await shot(s.name), ...info });
}
const household = await page.evaluate(() => (window.vora.household?.npcs ?? []).map(n => ({ key: n.cast.key, name: n.name, clip: n.curName, pos: [n.pos.x, n.pos.y, n.pos.z].map(v => Math.round(v * 10) / 10) }))).catch(() => []);
console.log('household:', household.map(h => `${h.key}=${h.name}`).join(', '));
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ when: new Date().toISOString(), shots: report, household, errors }, null, 2));
await browser.close();
if (errors.length) { console.error('errors:\n' + errors.join('\n')); process.exit(1); }
console.log('ok');
