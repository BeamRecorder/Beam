import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath)) throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-gpu'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) {
      void request.continue();
      return;
    }
    const url = new URL(request.url()),
      path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'beam-templates.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + request.url());
      void request.abort();
      return;
    }
    void request.respond({
      status: 200,
      contentType:
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
        }[extname(path)] ?? 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  await page.goto('https://beam-templates.test/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => window.beamComposition.ready);
  const seek = (time) =>
    page.evaluate(async (timeMs) => {
      window.beamComposition.seek(timeMs);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const times = [600, 1500, 2500, 3550, 5500, 7500, 9800, 11000];
  for (const time of times) {
    await seek(time);
    const frame = await page.screenshot({ path: resolve(output, `${time}.png`) });
    await seek(12000);
    await seek(0);
    await seek(time);
    if (digest(frame) !== digest(await page.screenshot())) throw new Error('Non-deterministic reverse seek at ' + time);
  }
  const result = await page.evaluate(() => {
    for (let frame = 0; frame < 360; frame++) window.beamComposition.seek((frame * 1000) / 30);
    return { frames: 360, seekable: typeof window.beamComposition.seek === 'function' };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { ...result, samples: times.length, runtimeErrors: 0, externalRequests: 0 };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
