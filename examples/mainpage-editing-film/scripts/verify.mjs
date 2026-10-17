import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath) throw new Error('Set BEAM_CHROMIUM_EXECUTABLE to the Chromium executable used by Beam CLI.');
const dist = resolve(root, 'dist'),
  proofs = resolve(root, '.beam/proofs');
await mkdir(proofs, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};
const errors = [];
const server = createServer(async (request, response) => {
  try {
    const path = resolve(dist, '.' + new URL(request.url, 'http://film.test').pathname);
    if (!path.startsWith(dist + '/')) throw new Error('Invalid asset path');
    const bytes = await readFile(path.endsWith('/') ? path + 'index.html' : path);
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const headers = { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    if (range) {
      const start = Number(range[1]),
        end = range[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1;
      response.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': end - start + 1,
      });
      response.end(bytes.subarray(start, end + 1));
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      response.end(bytes);
    }
  } catch (error) {
    errors.push(String(error));
    response.writeHead(404);
    response.end('Unavailable');
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--enable-gpu', '--disable-accelerated-video-decode'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    console.log(message.type(), message.text());
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    await Promise.race([
      window.beamComposition.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Film readiness timeout')), 30000)),
    ]);
  });
  const times = [
    0, 3.49, 4.6, 4.9, 6.5, 7.8, 8.8, 9.4, 10.8, 12.6, 13.3, 14.7, 16.4, 17, 18, 18.5, 19.5, 20.2, 20.6, 21,
    21.4833333333, 21.5, 21.5166666667, 22.5, 23.3,
  ];
  const results = [];
  for (let index = 0; index < times.length; index++) {
    const time = times[index];
    await page.evaluate(async (time) => {
      await window.beamComposition.seek(time * 1000);
    }, time);
    const file = `${String(index).padStart(2, '0')}-${time.toFixed(2)}.png`;
    await page.screenshot({ path: resolve(proofs, file) });
    const state = await page.evaluate(() => ({
      heading: document.querySelector('.film-inspector .panel-title')?.textContent,
      cursor: document.querySelector('.film-cursor')?.getAttribute('src'),
      cursorOpacity: document.querySelector('.film-cursor')?.style.opacity,
      endingOpacity: document.querySelector('.film-ending')?.style.opacity,
      clips: [...document.querySelectorAll('[data-timeline-clip-id]')].map((clip) => ({
        id: clip.getAttribute('data-timeline-clip-id'),
        width: clip.getBoundingClientRect().width,
      })),
      preview: document.querySelector('.film-preview-target')?.getBoundingClientRect().toJSON(),
    }));
    results.push({ time, file, state });
    console.log(`Verified frame ${time.toFixed(2)} s: ${state.heading}`);
  }
  const endingHandoff = await page.evaluate(async () => {
    const pixels = (selector) => {
      const sample = document.createElement('canvas');
      sample.width = 320;
      sample.height = 180;
      const context = sample.getContext('2d');
      context.drawImage(document.querySelector(selector), 0, 0, 320, 180);
      return context.getImageData(0, 0, 320, 180).data;
    };
    // A reverse seek must restore the same first ending frame as the retained dissolve plate.
    await window.beamComposition.seek(19000);
    await window.beamComposition.seek(21500);
    const actual = pixels('.film-canvas:not(.film-ending)'),
      reference = pixels('.film-ending');
    let difference = 0;
    for (let index = 0; index < actual.length; index++) difference += Math.abs(actual[index] - reference[index]);
    return {
      meanDifference: difference / actual.length,
      endingOpacity: document.querySelector('.film-ending').style.opacity,
    };
  });
  if (endingHandoff.meanDifference > 0.05 || endingHandoff.endingOpacity !== '0')
    throw new Error(`Ending handoff does not match its retained plate: ${JSON.stringify(endingHandoff)}`);
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(proofs, 'verification.json'),
    JSON.stringify({ times: results, endingHandoff, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
