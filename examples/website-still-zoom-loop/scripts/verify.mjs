import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl'] });
const errors = [], results = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warn') errors.push(message.text()); });
  await page.setRequestInterception(true);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
  page.on('request', request => {
    if (request.url().startsWith('data:')) return void request.continue();
    const url = new URL(request.url()), path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'still-zoom.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname); return void request.abort();
    }
    void request.respond({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const seek = ms => page.evaluate(async ms => { await window.beamComposition.seek(ms); }, ms);
  async function samePixels(first, second) {
    if (digest(first) === digest(second)) return true;
    // Rounded native inputs vary by a few antialias pixels (observed: ten, delta <= 3).
    return page.evaluate(async sources => {
      const pixels = await Promise.all(sources.map(async source => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = new OffscreenCanvas(1280, 800), context = canvas.getContext('2d');
        context.drawImage(image, 0, 0); return context.getImageData(0, 0, 1280, 800).data;
      }));
      let changed = 0;
      for (let i = 0; i < pixels[0].length; i += 4) {
        let delta = 0;
        for (let channel = 0; channel < 4; channel++) delta = Math.max(delta, Math.abs(pixels[0][i + channel] - pixels[1][i + channel]));
        if (delta > 8 || (delta > 0 && ++changed > 64)) return false;
      }
      return true;
    }, [first, second].map(bytes => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')));
  }
  for (const theme of ['light', 'dark']) {
    await page.goto(`https://still-zoom.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    for (const [ms, selector] of [[2640, 'text:3D Tilt'], [3240, 'text:Tilt left'],
      [5090, 'text:Loupe'], [7190, 'text:Glass appearance'], [7500, 'input[aria-label="Refraction"]'],
      [8050, 'input[aria-label="Refraction"]']]) {
      await seek(ms);
      const hit = await page.evaluate(selector => {
        const cursor = document.querySelector('.demo-cursor'), rect = cursor.getBoundingClientRect(), style = getComputedStyle(cursor);
        const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat), scale = rect.width / parseFloat(style.width);
        const element = document.elementFromPoint(rect.x + ox * scale, rect.y + oy * scale);
        const target = selector.startsWith('text:') ? [...document.querySelectorAll('button')].find(button =>
          (button.getAttribute('aria-label') || button.textContent.trim()) === selector.slice(5)) : document.querySelector(selector);
        return !!target && (element === target || target.contains(element));
      }, selector);
      if (!hit) {
        await page.screenshot({ path: resolve(output, `${theme}-cursor-miss-${ms}.png`) });
        throw new Error(`Cursor missed ${selector} at ${ms} (${theme})`);
      }
    }
    const samples = [];
    for (const [ms, expected] of [[0, '2d'], [1550, '2d'], [2900, '3d'], [3800, '3d'], [5600, 'glass'], [6900, 'glass'], [8100, 'glass'], [9000, '2d']]) {
      await seek(ms);
      const frame = await page.screenshot({ path: resolve(output, `${theme}-${ms}.png`) });
      const state = await page.evaluate(() => ({
        style: document.querySelector('.demo-cursor').dataset.style,
        hasTimeline: Boolean(document.querySelector('.playback-bar, .timeline-canvas, .zoom-timeline')),
        buttons: [...document.querySelectorAll('button')].filter(button => button.offsetHeight > 0).map(button => {
          const r = button.getBoundingClientRect(); return { label: button.getAttribute('aria-label') || button.textContent.trim(),
            x: r.x / 1.25 + r.width / 2.5, y: r.y / 1.25 + r.height / 2.5 };
        }),
        inputs: [...document.querySelectorAll('input')].map(input => {
          const r = input.getBoundingClientRect(); return { label: input.getAttribute('aria-label'), x: r.x / 1.25, y: r.y / 1.25, width: r.width / 1.25 };
        }),
      }));
      if (state.style !== expected || state.hasTimeline) throw new Error(`Wrong Screenshot UI state at ${ms}`);
      await seek(9000); await seek(0); await seek(ms);
      const reversed = await page.screenshot();
      if (!(await samePixels(frame, reversed))) {
        writeFileSync(resolve(output, `${theme}-${ms}-reversed.png`), reversed);
        throw new Error(`Non-deterministic pixels at ${ms} (${theme})`);
      }
      samples.push({ ms, ...state });
    }
    await seek(0); const first = await page.screenshot(); await seek(9000);
    if (!(await samePixels(first, await page.screenshot()))) throw new Error(`Visible loop seam in ${theme}`);
    results.push({ theme, samples, loopSeam: 'matched within 64 native antialias pixels, channel delta <= 8', reverseSeeks: 8 });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ results, runtimeErrors: 0, externalRequests: 0 }, null, 2));
  console.log('Light/dark: eight reversible states, no timeline or runtime errors, matching seam (bounded native antialias allowance).');
} finally { await browser.close(); }
