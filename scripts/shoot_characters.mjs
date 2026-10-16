/**
 * Headless screenshots of the character viewer (characters.html).
 *
 *   node scripts/shoot_characters.mjs [baseUrl] [outDir]
 *   env: SHOTS=name1,name2 (filter)  SHOT_W/SHOT_H  EXTRA=1 (per-character turntables)
 *
 * Each shot is a URL query against the viewer; the script waits for `window.vwchars.ready`,
 * lets the animation settle, and fails (exit 1) on page/console errors.
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/characters.html';
const outDir = process.argv[3] ?? 'docs/characters';
const W = parseInt(process.env.SHOT_W ?? '1600', 10), H = parseInt(process.env.SHOT_H ?? '900', 10);
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync('public/assets/characters/manifest.json', 'utf8'));
const ids = manifest.characters.map(c => c.id);
const byTag = tag => manifest.characters.filter(c => (c.tags ?? []).includes(tag)).map(c => c.id);
const people = manifest.characters.filter(c => c.role && !(c.tags ?? []).some(t => t === 'reference' || t === 'body'));
const withProps = people.filter(c => (c.props ?? []).length).map(c => c.id);
// a mixed set of dressed characters for the walk cycle: one per role prefix, first come first served
const mixed = []; const seen = new Set();
for (const c of people) { const key = c.id.replace(/_\d+$/, ''); if (seen.has(key)) continue; seen.add(key); mixed.push(c.id); }
const row = (list, n = 10) => `lineup=${list.slice(0, n).join(',')}&cols=${Math.min(n, list.length) || 1}`;

const shots = [
  { name: 'lineup-all', query: `lineup=all&cols=12&clip=idle&rot=0&light=40` },
  { name: 'lineup-bodies', query: `lineup=${byTag('body').join(',') || ids.slice(0, 8).join(',')}&cols=8&clip=idle&rot=0` },
  { name: 'lineup-street', query: `${row(byTag('street'))}&clip=idle&rot=0`, skipIf: () => !byTag('street').length },
  { name: 'lineup-market', query: `${row(byTag('market'))}&clip=idle&rot=0`, skipIf: () => !byTag('market').length },
  { name: 'lineup-props', query: `${row(withProps)}&clip=idle&rot=0`, skipIf: () => !withProps.length },
  { name: 'lineup-mixed', query: `${row(mixed.slice(10, 20))}&clip=idle&rot=0`, skipIf: () => mixed.length < 12 },
  { name: 'lineup-uniforms', query: `${row(byTag('uniform'))}&clip=idle&rot=0`, skipIf: () => !byTag('uniform').length },
  { name: 'lineup-children-elders', query: `${row([...byTag('child'), ...byTag('elder')])}&clip=idle&rot=0`, skipIf: () => !byTag('child').length },
  { name: 'walk-cycle', query: `${row(mixed, 8)}&clip=walk&rot=0` },
  { name: 'face-female', query: `id=${byTag('body')[0] ?? ids[0]}&view=face&clip=idle&rot=0&light=20` },
  { name: 'face-male', query: `id=${byTag('body')[1] ?? ids[1] ?? ids[0]}&view=face&clip=idle&rot=0&light=20` },
  { name: 'hands', query: `id=${ids[0]}&view=hands&clip=idle&rot=0` },
  { name: 'lod-compare', query: `lineup=${mixed[0]},${mixed[0]},${mixed[0]}&cols=3&clip=idle&rot=0&lod=0`, after: async page => { await page.evaluate(() => { const L = window.vwchars.loaded; L.forEach((l, i) => l.lods.forEach((o, k) => (o.visible = k === i))); }); } },
  { name: 'back', query: `lineup=${ids.slice(0, 6).join(',')}&cols=6&clip=idle&rot=0&view=back`, after: async page => { await page.evaluate(() => { const c = window.vwchars; for (const l of c.loaded) l.root.rotation.y = Math.PI; }); } },
];
// ad-hoc shots: SOLO=id1,id2 → full-body turntable frame per character (front ¾), SOLO_VIEW=full|face|hands|back
for (const id of (process.env.SOLO ?? '').split(',').filter(Boolean)) shots.push({ name: `solo-${id}`, query: `id=${id}&view=${process.env.SOLO_VIEW ?? 'full'}&clip=${process.env.SOLO_CLIP ?? 'idle'}&rot=0&light=${process.env.SOLO_LIGHT ?? 35}` });
const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;

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
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.type(); if (t === 'error') errors.push('console.error: ' + m.text()); });
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));

const report = [];
for (const s of shots) {
  if (only && !only.has(s.name)) continue;
  if (s.skipIf && s.skipIf()) { console.log('skip', s.name); continue; }
  const url = `${base}?${s.query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.vwchars && window.vwchars.ready && window.vwchars.loaded.length > 0, { timeout: 240000 });
  if (s.after) await s.after(page);
  // advance a few frames so clips settle and shadows render
  await new Promise(r => setTimeout(r, 1500));
  const file = join(outDir, `${s.name}.png`);
  await page.screenshot({ path: file });
  const stats = await page.evaluate(() => document.getElementById('hud-fps')?.textContent ?? '');
  console.log('shot', file, stats);
  report.push({ shot: s.name, file, stats });
}
await browser.close();
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ when: new Date().toISOString(), shots: report, errors }, null, 2));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('ok');
