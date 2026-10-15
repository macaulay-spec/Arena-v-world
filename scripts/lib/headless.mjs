/**
 * Shared headless-Chromium (SwiftShader) boot for the runtime probes: launches the browser, loads the
 * game with a chosen quality preset, starts a new game with the default protagonist and resolves when
 * the simulation is running (window.vora.state === 'game').
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export const VIEW = { W: 960, H: 540 };

export async function launchBrowser({ W = VIEW.W, H = VIEW.H } = {}) {
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
  return { browser, page, errors };
}

/** wait for n more rendered game frames (each is seconds of real time under SwiftShader) */
export const frames = async (page, n) => {
  const f0 = await page.evaluate(() => window.vora.frame ?? 0);
  await page.waitForFunction((f0, n) => (window.vora.frame ?? 0) >= f0 + n, { timeout: 180000 }, f0, n);
};

/** title → new game → default character → playing */
export async function bootGame(page, base, quality, log = console.error) {
  await page.evaluateOnNewDocument((q) => { localStorage.clear(); localStorage.setItem('voracity.settings.v1', JSON.stringify({ quality: q })); }, quality);
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.vora && window.vora.state === 'title' && !document.getElementById('screen-title').classList.contains('hidden'), { timeout: 600000 });
  log('title ready after', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await page.evaluate(() => document.getElementById('screen-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.click('#btn-new');
  await page.waitForFunction(() => window.vora.state === 'create', { timeout: 60000 });
  await frames(page, 2);
  await page.click('#c-done');
  await page.waitForFunction(() => window.vora.state === 'game', { timeout: 120000 });
  await frames(page, 3);
  log('in game after', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
