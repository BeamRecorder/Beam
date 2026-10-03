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
  throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to Beam’s installed Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-gpu', '--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setRequestInterception(true);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
  };
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) {
      void request.continue();
      return;
    }
    const url = new URL(request.url()),
      path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'ai-native-zaro.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      void request.abort();
      return;
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  await page.goto('https://ai-native-zaro.test/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => window.beamComposition.ready);
  const referenceFrames = JSON.parse(readFileSync(resolve(root, 'references/frames/index.json'), 'utf8'));
  const selected = process.env.BEAM_VERIFY_TIMES?.split(',').map(Number);
  const samples = selected ? selected.map((timeMs) => ({ timeMs, frame: Math.round(timeMs * 0.03) })) : referenceFrames;
  const results = [];
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  for (const { timeMs, frame } of samples) {
    await page.evaluate(async (time) => {
      window.beamComposition.seek(time);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, timeMs);
    const first = await page.screenshot({ path: resolve(output, `frame-${String(frame).padStart(4, '0')}.png`) });
    await page.evaluate(async (time) => {
      window.beamComposition.seek(68000);
      window.beamComposition.seek(0);
      window.beamComposition.seek(time);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, timeMs);
    const second = await page.screenshot();
    if (digest(first) !== digest(second)) {
      writeFileSync(resolve(output, `reverse-${frame}.png`), second);
      throw new Error('Non-deterministic seek at ' + timeMs + 'ms.');
    }
    results.push({ frame, timeMs, deterministic: true });
  }
  const sweep = await page.evaluate(() => {
    const frames = [];
    for (let frame = 0; frame < 2058; frame++) {
      window.beamComposition.seek((frame * 1000) / 30);
      const visible = Array.from(document.querySelectorAll('.scene')).filter(
        (scene) => scene.style.visibility !== 'hidden',
      );
      if (visible.length !== 1)
        throw new Error('Expected one visible scene at output frame ' + frame + ', got ' + visible.length);
      frames.push(visible[0].id);
    }
    return { frames: frames.length, scenes: new Set(frames).size };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { ...sweep, samples: results, runtimeErrors: errors, externalRequests: 0 };
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { frames: sweep.frames, scenes: sweep.scenes, samples: results.length, runtimeErrors: 0, externalRequests: 0 },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
