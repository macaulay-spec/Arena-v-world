/**
 * Headless behaviour verification of the GAME with real browser events (touch emulation), not
 * scripted positioning: creator morphs + rapid appearance switching, joystick drag/release/cancel,
 * jump timing, pause/resume render gating, and a frame-time benchmark at fixed spots.
 *
 *   node scripts/game-verify.mjs [baseUrl] [outJson]   (env: QUALITY=lite|standard|high  BENCH_ONLY=1  BENCH_SECONDS=30)
 *
 * Measurements are taken under SwiftShader (software GL) — they compare code paths, they are not
 * Android frame rates.
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outJson = process.argv[3] ?? 'docs/screenshots/game/verify.json';
const QUALITY = process.env.QUALITY ?? 'standard';
const BENCH_ONLY = !!process.env.BENCH_ONLY;
const BENCH_SECONDS = +(process.env.BENCH_SECONDS ?? 30);
const W = 960, H = 540;
mkdirSync(dirname(outJson), { recursive: true });

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
const errors = [], log = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.type(); if (t === 'error') errors.push('console.error: ' + m.text()); else log.push(m.text().slice(0, 200)); });
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
page.on('dialog', d => d.accept());

const SHOTS_DIR = process.env.SHOTS_DIR ?? 'docs/screenshots/game/verify';
mkdirSync(SHOTS_DIR, { recursive: true });
const shot = async (name) => { if (BENCH_ONLY) return; const file = `${SHOTS_DIR}/${name}.png`; await page.screenshot({ path: file }); console.log('shot', file); results.shots = [...(results.shots ?? []), file]; };
const results = { quality: QUALITY, renderer: 'SwiftShader (headless, software GL)', when: new Date().toISOString(), checks: {}, bench: {} };
const check = (name, ok, detail) => { results.checks[name] = { ok: !!ok, ...(detail !== undefined ? { detail } : {}) }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`); };
const frames = async (n) => { const f0 = await page.evaluate(() => window.vora.frame ?? 0); await page.waitForFunction((f0, n) => (window.vora.frame ?? 0) >= f0 + n, { timeout: 180000 }, f0, n); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await page.evaluateOnNewDocument((q) => { localStorage.clear(); localStorage.setItem('voracity.settings.v1', JSON.stringify({ quality: q })); }, QUALITY);
console.log('open', base, 'quality', QUALITY);
const t0 = Date.now();
await page.goto(base, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.vora && window.vora.state === 'title' && !document.getElementById('screen-title').classList.contains('hidden'), { timeout: 600000 });
console.log('title ready after', ((Date.now() - t0) / 1000).toFixed(0), 's');

// ---- creator ---------------------------------------------------------------------------------
await page.evaluate(() => document.getElementById('screen-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await page.click('#btn-new');
await page.waitForFunction(() => window.vora.state === 'create', { timeout: 60000 });
await frames(3);
if (!BENCH_ONLY) {
  const tabs = await page.evaluate(() => ({
    body: !document.querySelector('#c-tab [data-v="body"]').classList.contains('hidden'),
    face: !document.querySelector('#c-tab [data-v="face"]').classList.contains('hidden'),
    faceSliders: [...document.querySelectorAll('#c-tab-face label')].filter(l => !l.classList.contains('hidden')).length,
  }));
  check('creator shows Body and Face tabs backed by kit morphs', tabs.body && tabs.face && tabs.faceSliders === 9, tabs);

  // morph influences reach the rendered meshes (+ repeatable visual captures of the variants)
  const setSlider = async (id, v) => page.evaluate((id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
  const setFace = async (vals) => { for (const [k, v] of Object.entries(vals)) await setSlider(`c-face-${k}`, v); };
  const FACE_KEYS = ['jaw', 'chin', 'nose_width', 'nose_length', 'eye_spacing', 'eye_size', 'lips', 'mouth_width', 'cheeks'];
  const zeroFace = Object.fromEntries(FACE_KEYS.map(k => [k, 0]));
  for (const sex of ['m', 'f']) {
    await page.click('#c-tab [data-v="look"]'); await page.click(`#c-sex [data-v="${sex}"]`);
    await page.waitForFunction(sx => window.vora.avatar.applied && window.vora.avatar.applied.sex === sx, { timeout: 180000 }, sex);
    await page.click('#c-tab [data-v="look"]'); await setSlider('c-height', 0.5);
    await page.click('#c-tab [data-v="body"]'); await setSlider('c-build', 0.5); await setSlider('c-muscle', 0.5);
    await page.click('#c-tab [data-v="face"]'); await setFace(zeroFace);
    await page.click('#c-tab [data-v="body"]'); await frames(4); await shot(`creator-${sex}-default`);
    await setSlider('c-build', 1); await setSlider('c-muscle', 1); await frames(3); await shot(`creator-${sex}-heavy-muscular`);
    await setSlider('c-build', 0); await setSlider('c-muscle', 0); await frames(3); await shot(`creator-${sex}-slim-soft`);
    await setSlider('c-build', 0.5); await setSlider('c-muscle', 0.5);
    await page.click('#c-tab [data-v="face"]'); await frames(8); await shot(`creator-${sex}-face-default`);
    await setFace({ jaw: 1, chin: 1, nose_width: 1, nose_length: 1, eye_spacing: 1, eye_size: 1, lips: 1, mouth_width: 1, cheeks: 1 }); await frames(3); await shot(`creator-${sex}-face-plus`);
    await setFace({ jaw: -1, chin: -1, nose_width: -1, nose_length: -1, eye_spacing: -1, eye_size: -1, lips: -1, mouth_width: -1, cheeks: -1 }); await frames(3); await shot(`creator-${sex}-face-minus`);
    await setFace(zeroFace);
  }
  await page.click('#c-tab [data-v="look"]'); await page.click('#c-sex [data-v="m"]');
  await page.waitForFunction(() => window.vora.avatar.applied && window.vora.avatar.applied.sex === 'm', { timeout: 180000 });
  await page.click('#c-tab [data-v="body"]'); await setSlider('c-build', 1);
  await page.click('#c-tab [data-v="face"]'); await setSlider('c-face-nose_width', -1); await setSlider('c-face-lips', 0.5);
  await frames(3);
  const infl = await page.evaluate(() => {
    const out = {}; const av = window.vora.avatar;
    av.root.traverse(o => { if (o.isSkinnedMesh && o.morphTargetDictionary && o.visible && o.parent?.visible !== false) {
      const d = o.morphTargetDictionary, w = o.morphTargetInfluences; const node = o.parent?.name ?? o.name;
      out[node] = { weight_hi: w[d.shape_weight_hi], nose_neg: d.face_nose_width_neg !== undefined ? w[d.face_nose_width_neg] : null, lips_pos: d.face_lips_pos !== undefined ? w[d.face_lips_pos] : null };
    } });
    return out;
  });
  const lod0 = Object.entries(infl).find(([k]) => /LOD0/.test(k))?.[1];
  const outfit = Object.entries(infl).find(([k]) => /OUTFIT/.test(k))?.[1];
  check('build slider drives shape_weight_hi on body AND outfit meshes', lod0 && outfit && lod0.weight_hi > 1 && outfit.weight_hi > 1, infl);
  check('face sliders drive face morphs on the body mesh only', lod0 && Math.abs(lod0.nose_neg - 1) < 1e-6 && Math.abs(lod0.lips_pos - 0.5) < 1e-6 && outfit && outfit.nose_neg === null, { lod0, outfit });

  // rapid appearance switching: m/f/m/f + hair/outfit spam → exactly one model, matching the last choice
  await page.click('#c-tab [data-v="look"]');
  for (let i = 0; i < 6; i++) { await page.click(`#c-sex [data-v="${i % 2 ? 'm' : 'f'}"]`); await page.click('#c-hair-next'); await page.click('#c-outfit-next'); }
  await page.click('#c-sex [data-v="f"]'); await page.click('#c-outfit-next');
  const finalName = await page.evaluate(() => document.getElementById('c-outfit').textContent);
  // wait for the serialised queue to drain: the applied appearance must be the female kit
  await page.waitForFunction(() => window.vora.avatar.applied && window.vora.avatar.applied.sex === 'f', { timeout: 120000 }).catch(() => {});
  await frames(4);
  const race = await page.evaluate(() => {
    const av = window.vora.avatar; const visOutfits = [], visHair = []; let skinned = 0;
    // GLTFLoader names the primitives of a multi-material node `<node>_1`, `<node>_2`…: only the kit nodes themselves are toggled
    const isNode = (o, prefix) => o.name.startsWith(prefix) && !/_\d+$/.test(o.name);
    av.root.traverse(o => { if (isNode(o, 'OUTFIT_') && o.visible) visOutfits.push(o.name); if (isNode(o, 'HAIR_') && o.visible) visHair.push(o.name); if (o.isSkinnedMesh) skinned++; });
    return { children: av.root.children.length, applied: av.applied, visOutfits, visHair, skinned, outfitLabel: document.getElementById('c-outfit').textContent };
  });
  const consistent = race.children === 1 && race.applied?.sex === 'f' && race.visOutfits.length === 1 && race.visOutfits[0] === `OUTFIT_${race.applied.outfit}` && race.visHair.length <= 1 && race.outfitLabel === finalName;
  check('rapid sex/hair/outfit switching leaves one model of the last selection', consistent, race);
}

// ---- into the game -----------------------------------------------------------------------------
await page.click('#c-done');
await page.waitForFunction(() => window.vora.state === 'game', { timeout: 120000 });
await frames(3);

if (!BENCH_ONLY) {
  // joystick: real touch on the visible stick overlay
  const stickBox = await page.evaluate(() => { const r = document.getElementById('stick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const posBefore = await page.evaluate(() => ({ x: window.vora.player.pos.x, z: window.vora.player.pos.z }));
  await page.touchscreen.touchStart(stickBox.x, stickBox.y);
  await page.touchscreen.touchMove(stickBox.x, stickBox.y - 50);
  await frames(2);
  const moving = await page.evaluate(() => ({ speed: window.vora.player.speed, mag: window.vora.input.state.moveMag, stick: window.vora.input.active.stick }));
  await frames(20);
  const posMoved = await page.evaluate(() => ({ x: window.vora.player.pos.x, z: window.vora.player.pos.z }));
  await page.touchscreen.touchEnd();
  await frames(25);
  const posStop1 = await page.evaluate(() => ({ x: window.vora.player.pos.x, z: window.vora.player.pos.z, speed: window.vora.player.speed, stick: window.vora.input.active.stick }));
  await frames(5);
  const posStop2 = await page.evaluate(() => ({ x: window.vora.player.pos.x, z: window.vora.player.pos.z }));
  const dist = Math.hypot(posMoved.x - posBefore.x, posMoved.z - posBefore.z);
  check('touching the visible stick moves the player', moving.stick && moving.mag > 0.5 && dist > 0.5, { moving, dist: +dist.toFixed(2) });
  check('releasing the stick stops the player', !posStop1.stick && posStop1.speed === 0 && Math.hypot(posStop2.x - posStop1.x, posStop2.z - posStop1.z) < 1e-6, posStop1);

  // cancellation: start a drag, then fire pointercancel for that pointer → no stuck movement
  await page.touchscreen.touchStart(stickBox.x, stickBox.y);
  await page.touchscreen.touchMove(stickBox.x + 50, stickBox.y);
  await frames(3);
  const beforeCancel = await page.evaluate(() => window.vora.input.state.moveMag);
  await page.evaluate(() => { const ids = window.vora.input.pointers ? [...window.vora.input.pointers.keys()] : []; for (const id of ids) window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true })); });
  await frames(25);
  const afterCancel = await page.evaluate(() => ({ mag: window.vora.input.state.moveMag, speed: window.vora.player.speed, stick: window.vora.input.active.stick }));
  await page.touchscreen.touchEnd().catch(() => {});
  check('pointercancel during a drag cannot leave the player moving', beforeCancel > 0.5 && afterCancel.mag === 0 && afterCancel.speed === 0 && !afterCancel.stick, { beforeCancel, afterCancel });

  // jump: upward velocity on the very next simulation update
  const jump = await page.evaluate(async () => {
    const v = window.vora; const f0 = v.frame; const y0 = v.player.pos.y;
    document.getElementById('btn-jump').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'touch', bubbles: true }));
    await new Promise(r => { const t = () => (v.frame > f0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    return { vy: v.player.vy, dy: v.player.pos.y - y0, grounded: v.player.grounded, framesLater: v.frame - f0 };
  });
  check('jump impulse is applied in the first update after the press', jump.framesLater === 1 && jump.vy > 3.5 && !jump.grounded && jump.dy > 0, jump);
  await frames(4); await shot('game-mid-jump');
  // the clamped 50 ms simulation step at SwiftShader frame rates makes a 0.9 s jump take many real seconds
  await page.waitForFunction(() => window.vora.player.grounded, { timeout: 600000 });
  check('jump lands again', true);
  // mid-walk frame for deformation inspection (real touch drag)
  await page.touchscreen.touchStart(stickBox.x, stickBox.y); await page.touchscreen.touchMove(stickBox.x, stickBox.y - 55);
  await frames(6); await shot('game-mid-walk');
  await page.touchscreen.touchEnd(); await frames(3);

  // pause: frames keep ticking for the UI but nothing is rendered; resume continues
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.vora.state === 'paused', { timeout: 10000 });
  await frames(2);
  const r0 = await page.evaluate(() => ({ frame: window.vora.frame, rendered: window.vora.renderer.info.render.frame, bench: window.vora.bench.frames }));
  await frames(10);
  const r1 = await page.evaluate(() => ({ frame: window.vora.frame, rendered: window.vora.renderer.info.render.frame, bench: window.vora.bench.frames }));
  check('paused: loop runs but no GPU frames and no simulation', r1.frame - r0.frame >= 10 && r1.rendered === r0.rendered && r1.bench === r0.bench, { r0, r1 });
  await page.click('#btn-resume');
  await page.waitForFunction(() => window.vora.state === 'game', { timeout: 10000 });
  await frames(3);
  const r2 = await page.evaluate(() => ({ rendered: window.vora.renderer.info.render.frame, speed: window.vora.player.speed, mag: window.vora.input.state.moveMag }));
  check('resume renders again with no stale input', r2.rendered > r1.rendered && r2.speed === 0 && r2.mag === 0, r2);
}

// ---- benchmark -------------------------------------------------------------------------------
const O = [-374.1, 24.3, -411.9];
const SPOTS = [
  { name: 'living-room', at: [24, 0.45, 42, -2.4], minutes: 9 * 60 },
  { name: 'street-outside', at: [27, -0.1, 80, 0.4], minutes: 11 * 60 },
];
for (const s of SPOTS) {
  await page.evaluate((s, O) => {
    const v = window.vora; const [x, y, z, yaw] = s.at;
    v.player.teleport(O[0] + x, O[1] + y, O[2] + z, yaw);
    if (v.chase.mode !== 'far') { v.chase.cycleMode(); if (v.chase.mode !== 'far') v.chase.cycleMode(); }
    v.chase.snapBehind(yaw); v.setClock(s.minutes);
  }, s, O);
  await frames(6);
  const b0 = await page.evaluate(() => ({ t: performance.now(), frame: window.vora.frame, cpu: window.vora.bench ? { ...window.vora.bench } : null }));
  await sleep(BENCH_SECONDS * 1000);
  const b1 = await page.evaluate(() => ({ t: performance.now(), frame: window.vora.frame, cpu: window.vora.bench ? { ...window.vora.bench } : null, calls: window.vora.renderer.info.render.calls, tris: window.vora.renderer.info.render.triangles, programs: window.vora.renderer.info.programs?.length, geometries: window.vora.renderer.info.memory.geometries, textures: window.vora.renderer.info.memory.textures }));
  const nf = b1.frame - b0.frame, secs = (b1.t - b0.t) / 1000;
  const cpuMs = b1.cpu && b0.cpu && b1.cpu.frames > b0.cpu.frames ? (b1.cpu.ms - b0.cpu.ms) / (b1.cpu.frames - b0.cpu.frames) : null;
  results.bench[s.name] = { frames: nf, seconds: +secs.toFixed(1), fps: +(nf / secs).toFixed(2), msPerFrame: +((secs * 1000) / nf).toFixed(0), cpuMsPerFrame: cpuMs === null ? null : +cpuMs.toFixed(1), calls: b1.calls, tris: b1.tris, programs: b1.programs, geometries: b1.geometries, textures: b1.textures };
  console.log('bench', s.name, results.bench[s.name]);
}
results.errors = errors;
writeFileSync(outJson, JSON.stringify(results, null, 2));
await browser.close();
const failed = Object.entries(results.checks).filter(([, c]) => !c.ok).map(([k]) => k);
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
if (failed.length) { console.error('FAILED checks: ' + failed.join('; ')); process.exit(1); }
console.log('ok');
