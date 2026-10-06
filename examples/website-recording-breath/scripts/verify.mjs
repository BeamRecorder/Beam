import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distribution = resolve(root, process.env.BEAM_DEMO_DIST || 'dist');
const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to an installed Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
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
    '.webm': 'video/webm',
  };
  page.on('request', (request) => {
    if (request.url().startsWith('data:') || request.url().startsWith('blob:')) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(distribution, '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'breath-loop.test' || !path.startsWith(distribution + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  const samePixels = async (first, second) => {
    if (digest(first) === digest(second)) return true;
    const difference = await page.evaluate(
      async (encoded) => {
        const frames = await Promise.all(
          encoded.map(async (source) => {
            const blob = await (await fetch('data:image/png;base64,' + source)).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            bitmap.close();
            return pixels;
          }),
        );
        let changed = 0,
          maximum = 0;
        for (let i = 0; i < frames[0].length; i += 4) {
          const delta = Math.max(
            ...[0, 1, 2, 3].map((channel) => Math.abs(frames[0][i + channel] - frames[1][i + channel])),
          );
          if (delta) changed++;
          maximum = Math.max(maximum, delta);
        }
        return { changed, maximum };
      },
      [Buffer.from(first).toString('base64'), Buffer.from(second).toString('base64')],
    );
    // Chromium can change a handful of rounded clip/SVG edge pixels slightly when a
    // transformed native button enters/leaves the compositor cache.
    return difference.changed <= 64 && difference.maximum <= 12;
  };
  const results = [];
  for (const theme of ['dark', 'light']) {
    await page.goto(`https://breath-loop.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    if (errors.length) throw new Error(errors.join('\n'));
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
    for (const [time, label] of [
      [1200, 'Resume recording'],
      [4650, 'Pause recording'],
    ]) {
      await seek(time);
      const hit = await page.evaluate((label) => {
        const cursor = document.querySelector('.demo-cursor');
        const style = getComputedStyle(cursor);
        const rect = cursor.getBoundingClientRect();
        const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
        const scale = rect.width / parseFloat(style.width);
        const point = document.elementFromPoint(rect.x + ox * scale, rect.y + oy * scale);
        const target = document.querySelector(`button[aria-label="${label}"]`);
        return !!target && (target === point || target.contains(point));
      }, label);
      if (!hit) {
        await page.screenshot({ path: resolve(output, `${theme}-miss-${time}.png`) });
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll('button')].map((button) => {
              const r = button.getBoundingClientRect();
              return { label: button.getAttribute('aria-label'), x: r.x, y: r.y, width: r.width, height: r.height };
            }),
          ),
        );
        throw new Error(`${theme} cursor missed ${label} at ${time}ms.`);
      }
    }
    for (const time of [0, 1200, 2300, 4000, 4650, 5600, 8500, 9800, 10000]) {
      await seek(time);
      const first = await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) });
      await seek(10000);
      await seek(0);
      await seek(time);
      const second = await page.screenshot({ path: resolve(output, `${theme}-${time}-repeat.png`) });
      if (!(await samePixels(first, second))) throw new Error(`Non-deterministic ${theme} seek at ${time}ms.`);
    }
    await seek(0);
    const first = await page.screenshot();
    await seek(10000);
    if (!(await samePixels(first, await page.screenshot()))) throw new Error(`Visible ${theme} loop seam.`);
    results.push({ theme, pointerTargets: 2, reverseSeeks: 9, loopSeam: 'matched within SVG edge tolerance' });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { durationMs: 10000, samples: results, runtimeErrors: 0, externalRequests: 0 };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
