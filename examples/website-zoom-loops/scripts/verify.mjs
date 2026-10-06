import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './beam-cli.mjs';
const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const errors = [],
  results = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
  };
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) return void request.continue();
    const url = new URL(request.url()),
      path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'zoom-loop.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  async function samePixels(first, second) {
    if (hash(first) === hash(second)) return true;
    // Chromium's rounded native borders can vary by a handful of antialias pixels.
    // Keep the allowance to 128 of 1,024,000 pixels and 8/255 per channel.
    return page.evaluate(
      async (sources) => {
        const pixels = await Promise.all(
          sources.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = new OffscreenCanvas(1280, 800),
              context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, 1280, 800).data;
          }),
        );
        let changed = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          let delta = 0;
          for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(pixels[0][i + c] - pixels[1][i + c]));
          if (delta > 8) return false;
          if (delta && ++changed > 128) return false;
        }
        return true;
      },
      [first, second].map((bytes) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')),
    );
  }
  for (const mode of ['2d', '3d'])
    for (const theme of ['light', 'dark']) {
      await page.goto(`https://zoom-loop.test/${mode}-${theme}/index.html`);
      await page.evaluate(async () => {
        await window.beamComposition.ready;
      });
      const seek = (ms) =>
        page.evaluate(async (ms) => {
          await window.beamComposition.seek(ms);
        }, ms);
      const frames = new Map();
      for (const ms of [0, 800, 2100, 2500, 3400, 4500, 6400, 8000]) {
        await seek(ms);
        const bytes = await page.screenshot();
        frames.set(ms, bytes);
        writeFileSync(resolve(output, `${mode}-${theme}-${ms}.png`), bytes);
      }
      assert(await samePixels(frames.get(0), frames.get(8000)), `${mode}/${theme}: seamless loop`);
      for (const ms of [4500, 2500, 2100, 0]) {
        await seek(ms);
        assert(await samePixels(await page.screenshot(), frames.get(ms)), `${mode}/${theme}: reverse seek ${ms}`);
      }
      const layout = await page.evaluate(() => {
        const selectors = ['.editor-card', '.composition-preview', '.inspector-body', '.demo-cursor'];
        const boxes = Object.fromEntries(
          selectors.map((selector) => {
            const b = document.querySelector(selector).getBoundingClientRect();
            return [selector, { x: b.x, y: b.y, width: b.width, height: b.height }];
          }),
        );
        const targets = Object.fromEntries(
          [...document.querySelectorAll('[data-target],[data-tilt-preset]')].map((el) => {
            const b = el.getBoundingClientRect();
            return [
              el.dataset.target || el.dataset.tiltPreset,
              { x: (b.x + b.width / 2) / 2, y: (b.y + b.height / 2) / 2 },
            ];
          }),
        );
        const clicks = [...document.querySelectorAll('[data-click-target]')].map((el) => ({
          target: el.dataset.clickTarget,
          x: Number(el.dataset.clickX),
          y: Number(el.dataset.clickY),
        }));
        return { boxes, targets, clicks };
      });
      for (const [selector, b] of Object.entries(layout.boxes)) {
        assert(
          b.x >= 0 && b.y >= 0 && b.x + b.width <= 1281 && b.y + b.height <= 801,
          `${selector} stays inside frame`,
        );
      }
      for (const click of layout.clicks) {
        const target = layout.targets[click.target];
        assert(
          target && Math.hypot(target.x - click.x, target.y - click.y) < 0.1,
          'Cursor hotspot matches native target center',
        );
      }
      assert.notEqual(hash(frames.get(2100)), hash(frames.get(4500)), 'Different focus/perspective frames');
      results.push({ mode, theme, seamless: true, reverseSeek: true, ...layout });
    }
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(
    JSON.stringify({ passed: true, variants: results.length, seamless: true, reverseSeek: true, cursorTargets: true }),
  );
} finally {
  await browser.close();
}
