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
  };
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'recorder-loop.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  const results = [];
  for (const theme of ['dark', 'light']) {
    await page.goto(`https://recorder-loop.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    if (errors.length) throw new Error(errors.join('\n'));
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
    for (const [time, label] of [
      [850, 'Full screen'],
      [2050, 'Region'],
      [3300, 'Window'],
      [4500, 'Screenshot'],
      [5350, 'Instant'],
      [6200, 'Recorder'],
      [7050, 'Window'],
      [8250, 'Resume recording'],
      [9050, 'Pause recording'],
      [10000, 'Stop recording'],
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
    for (const time of [0, 1000, 2300, 3500, 4700, 5600, 6500, 7800, 8600, 9300, 10500, 12000]) {
      await seek(time);
      const first = await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) });
      await seek(12000);
      await seek(0);
      await seek(time);
      if (digest(first) !== digest(await page.screenshot()))
        throw new Error(`Non-deterministic ${theme} seek at ${time}ms.`);
    }
    await seek(0);
    const first = await page.screenshot();
    await seek(12000);
    if (digest(first) !== digest(await page.screenshot())) throw new Error(`Visible ${theme} loop seam.`);
    results.push({ theme, pointerTargets: 10, reverseSeeks: 12, loopSeam: 'identical pixels' });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { durationMs: 12000, samples: results, runtimeErrors: 0, externalRequests: 0 };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
