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
    0, 3.49, 4.6, 4.9, 5.87, 5.98, 6.7, 7.6, 8.25, 8.6, 9.6, 11.3, 11.9, 13.4, 15.1, 15.7, 17.1, 18.9, 19.5, 20.4, 21,
    22, 22.65, 23.1, 23.5, 23.9333333333, 23.95, 23.9666666667, 24.95, 25.8,
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
      background: document.querySelector('.media-tile.active')?.dataset.filmWallpaper,
      blurPercent: document.querySelector('.film-inspector .big-slider-input')?.value,
      cursorScale: new DOMMatrix(getComputedStyle(document.querySelector('.film-cursor')).transform).a,
      cursorSize: document.querySelector('.film-cursor')?.dataset.nominalSize,
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
    await window.beamComposition.seek(21000);
    await window.beamComposition.seek(23950);
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
  const appearance = await page.evaluate(async () => {
    const samples = [];
    for (const time of [7.6, 8.6, 9.6]) {
      await window.beamComposition.seek(time * 1000);
      const canvas = document.querySelector('.film-canvas:not(.film-ending)');
      const width = 1880,
        height = 60;
      const { data } = canvas.getContext('2d').getImageData(20, 1000, width, height);
      let energy = 0;
      for (let y = 0; y < height; y++)
        for (let x = 1; x < width; x++) {
          const index = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel++)
            energy += Math.abs(data[index + channel] - data[index + channel - 4]);
        }
      samples.push({
        time,
        blur: Number(document.querySelector('.film-inspector .big-slider-input').value),
        energy: energy / ((width - 1) * height * 3),
      });
    }
    return samples;
  });
  if (
    appearance.map((sample) => sample.blur).join(',') !== '0,20,65' ||
    appearance[2].energy >= appearance[0].energy * 0.7
  )
    throw new Error(`The background blur must visibly soften the real rendered photo: ${JSON.stringify(appearance)}`);
  if (
    new Set(results.filter(({ time }) => [5.87, 6.7, 7.6].includes(time)).map(({ state }) => state.background)).size !==
    3
  )
    throw new Error('Three distinct selected backgrounds must be visible.');
  if (
    results.find(({ time }) => time === 5.87).state.cursorScale >= 0.85 ||
    results.find(({ time }) => time === 5.98).state.cursorScale <= 1.05 ||
    results.find(({ time }) => time === 5.98).state.cursorSize !== '64'
  )
    throw new Error('The enlarged cursor must compress and spring back after a click.');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(proofs, 'verification.json'),
    JSON.stringify({ times: results, appearance, endingHandoff, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
