import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to an installed Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl'] });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warn') errors.push(message.text());
  });
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
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'glass-loop.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  // Chromium can vary a handful of antialias edge pixels on repeated native SVG/border paints.
  const sameFrame = async (first, second) =>
    digest(first) === digest(second) ||
    page.evaluate(
      async (urls) => {
        const pixels = await Promise.all(
          urls.map(async (url) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height).data;
          }),
        );
        let changed = 0,
          maxDelta = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          let different = false;
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(pixels[0][i + c] - pixels[1][i + c]);
            different ||= delta > 0;
            maxDelta = Math.max(maxDelta, delta);
          }
          if (different) changed++;
        }
        return changed <= 64 && maxDelta <= 12;
      },
      [first, second].map((bytes) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')),
    );
  const results = [];
  const seek = (ms) =>
    page.evaluate(async (ms) => {
      await window.beamComposition.seek(ms);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, ms);
  for (const kind of ['glass', 'automatic'])
    for (const theme of ['dark', 'light']) {
      await page.goto(`https://glass-loop.test/${kind}-${theme}/index.html`, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => window.beamComposition.ready);
      const targets = kind === 'glass' ? [
        [1790, 'text:Freehand'], [4040, 'text:Glass appearance'],
        [5090, 'input[aria-label="Refraction"]'], [5890, 'input[aria-label="Refraction"]'],
        [6590, 'input[aria-label="Rim lighting"]'], [7390, 'input[aria-label="Rim lighting"]'],
      ] : [
        [640, 'text:Loupe'], [1190, 'text:Automatic generation'],
        [2090, 'text:Generate Auto Zooms'], [3340, 'text:Regenerate'],
        [7390, 'button[data-target]'], [8040, 'text:3.5×'],
      ];
      for (const [ms, selector] of targets) {
        await seek(ms);
        const hit = await page.evaluate((selector) => {
          const cursor = document.querySelector('.demo-cursor'),
            rect = cursor.getBoundingClientRect(),
            style = getComputedStyle(cursor);
          const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat),
            scale = rect.width / parseFloat(style.width);
          const element = document.elementFromPoint(rect.x + ox * scale, rect.y + oy * scale),
            target = selector.startsWith('text:') ? [...document.querySelectorAll('button')].find(button => button.textContent.trim() === selector.slice(5)) : document.querySelector(selector);
          return !!target && (element === target || target.contains(element));
        }, selector);
        if (!hit) {
          await page.screenshot({ path: resolve(output, `${kind}-${theme}-miss-${ms}.png`) });
          throw new Error(`Cursor missed ${selector} at ${ms}ms (${kind}/${theme})`);
        }
      }
      for (const ms of [0, 1800, 2400, 3000, 3500, 4200, 5500, 7500, 9500, 10000]) {
        await seek(ms);
        const first = await page.screenshot({ path: resolve(output, `${kind}-${theme}-${ms}.png`) });
        await seek(10000);
        await seek(0);
        await seek(ms);
        if (!(await sameFrame(first, await page.screenshot())))
          throw new Error(`Non-deterministic seek at ${ms}ms (${kind}/${theme})`);
      }
      await seek(0);
      const first = await page.screenshot();
      await seek(10000);
      if (!(await sameFrame(first, await page.screenshot()))) throw new Error(`Visible loop seam (${kind}/${theme})`);
      results.push({
        kind,
        theme,
        pointerTargets: targets.length,
        reverseSeeks: 10,
        loopSeam: 'matched within 64 native antialias pixels, channel delta <= 12',
      });
    }
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { durationMs: 10000, samples: results, runtimeErrors: 0, externalRequests: 0 };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
