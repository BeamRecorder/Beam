import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, process.env.BEAM_COMPOSITION_BUILD || 'dist');
const frames = resolve(root, '.beam/frames');
mkdirSync(frames, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to your installed Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setRequestInterception(true);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  page.on('request', request => {
    const url = new URL(request.url());
    const path = resolve(directory, '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'ai-native.test' || !path.startsWith(directory + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      void request.abort();
      return;
    }
    void request.respond({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  await page.goto('https://ai-native.test/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => window.beamComposition.ready);
  const sampleTimes = [0, 1350, 2800, 4800, 6400, 8600, 10300, 12800, 14850];
  const results = [];
  for (const time of sampleTimes) {
    await page.evaluate(async time => {
      window.beamComposition.seek(time);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);
    const first = await page.screenshot({ path: resolve(frames, `${time}.png`) });
    await page.evaluate(time => {
      window.beamComposition.seek(time === 15000 ? 0 : 15000);
      window.beamComposition.seek(time);
    }, time);
    const second = await page.screenshot();
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    if (digest(first) !== digest(second)) throw new Error(`Non-deterministic frame at ${time}ms.`);
    results.push({ timeMs: time, deterministic: true });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ frames: results, runtimeErrors: errors, externalRequests: 0 }, null, 2));
} finally {
  await browser.close();
}
