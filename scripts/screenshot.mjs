/**
 * Headless screenshot + runtime smoke test.
 * Uses @sparticuz/chromium (bundled Chromium + SwiftShader software GL) via puppeteer-core.
 *
 *   node scripts/screenshot.mjs [baseUrl] [outDir]
 *
 * Captures the configured views into docs/screenshots and fails (exit 1) if the page logs errors
 * or the viewer does not report ready.
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? 'docs/screenshots';
const W = parseInt(process.env.SHOT_W ?? '1280', 10), H = parseInt(process.env.SHOT_H ?? '720', 10);
mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { name: 'overview-central', pos: [260, 230, 420], target: [20, 10, 20], hour: 10 },
  { name: 'unity-square', landmark: 'city-square', hour: 10 },
  { name: 'meridian-tower', landmark: 'landmark-office', hour: 16 },
  { name: 'grand-market', landmark: 'market-complex', hour: 11 },
  { name: 'old-town-street', pos: [-520, 24, 120], target: [-470, 12, 60], hour: 9 },
  { name: 'north-heights', pos: [-180, 70, -380], target: [-120, 25, -470], hour: 15 },
  { name: 'unity-bridge', landmark: 'bridge', hour: 17.5 },
  { name: 'industrial', pos: [520, 80, -380], target: [620, 20, -470], hour: 12 },
  { name: 'green-estates', pos: [60, 60, -300], target: [120, 25, -400], hour: 14 },
  { name: 'stadium', landmark: 'stadium', hour: 13 },
  { name: 'night-central', pos: [200, 120, 300], target: [40, 20, 40], hour: 20.5 },
  { name: 'walk-market-quarter', walk: [-60, 240], yaw: 0.6, hour: 10 },
];

// optional filters: VIEWS=name1,name2  QUALITY=low|medium|high  (defaults: all views, medium)
const only = process.env.VIEWS ? new Set(process.env.VIEWS.split(',')) : null;
const views = only ? VIEWS.filter(v => only.has(v.name)) : VIEWS;
const quality = process.env.QUALITY ?? 'medium';

const executablePath = await chromium.executablePath();
// the bundled binary needs the NSS libraries shipped in the package (normally only extracted on AWS Lambda)
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
  executablePath,
  env: { ...process.env },
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  headless: true,
});
const page = await browser.newPage();
if (process.env.SHOT_MOBILE) await page.emulate({ viewport: { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.type(); if (t === 'error') errors.push('console.error: ' + m.text()); else if (t === 'warning' && /three/i.test(m.text())) errors.push('warning: ' + m.text()); });
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));

const url = base + (base.includes('?') ? '&' : '?') + 'q=' + quality;
console.log('open', url);
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.vworld, { timeout: 240000 });
// wait for the loading overlay to go and a couple of frames to render
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 60000 });
const info = await page.evaluate(() => ({ buildings: window.vworld.city.stats.buildings, edges: window.vworld.city.stats.edges, props: window.vworld.city.stats.props }));
console.log('viewer ready', info);

const report = [];
for (const v of views) {
  await page.evaluate((v) => {
    const { controls, setHour, city } = window.vworld;
    setHour(v.hour);
    if (v.landmark) { const l = city.landmarks.find(x => x.role === v.landmark); if (l) controls.lookAt(l.view.pos, l.view.target); }
    else if (v.walk) { controls.setMode('walk'); controls.walkPos.set(v.walk[0], 0, v.walk[1]); controls.yaw = v.yaw ?? 0; controls.pitch = 0.02; }
    else controls.lookAt(v.pos, v.target);
  }, v);
  // let a few frames render (software GL is slow: wait for the frame counter, not the clock)
  const f0 = await page.evaluate(() => window.vworld.frame);
  await page.waitForFunction((f0) => window.vworld.frame >= f0 + 4, { timeout: 120000 }, f0);
  const fps = await page.evaluate(() => document.getElementById('hud-fps')?.textContent ?? '');
  const file = join(outDir, v.name + '.png');
  await page.screenshot({ path: file });
  report.push({ view: v.name, file, stats: fps });
  console.log('shot', file, fps);
  await page.evaluate(() => { const { controls } = window.vworld; if (controls.mode === 'walk') controls.setMode('orbit'); });
}
// a filtered run (VIEWS=...) updates only its own entries in an existing report instead of replacing it
const reportPath = join(outDir, 'report.json');
let reportViews = report;
if (only && existsSync(reportPath)) {
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8'));
    const fresh = new Set(report.map(r => r.view));
    reportViews = [...(prev.views ?? []).filter(v => !fresh.has(v.view)), ...report];
    reportViews.sort((a, b) => VIEWS.findIndex(v => v.name === a.view) - VIEWS.findIndex(v => v.name === b.view));
  } catch { /* unreadable previous report: overwrite */ }
}
writeFileSync(reportPath, JSON.stringify({ when: new Date().toISOString(), info, views: reportViews, errors }, null, 2));
await browser.close();
if (errors.length) { console.error('errors:\n' + errors.join('\n')); process.exit(1); }
console.log('ok');
