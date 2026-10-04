import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { root } from './beam-cli.mjs';

const output = resolve(root, '.beam/artwork-frames');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/opt/google/chrome/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 313, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
    console.error(String(error));
  });
  await page.setRequestInterception(true);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
  };
  page.on('request', (request) => {
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'html-canvas.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path))
      return void request.abort();
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  await page.goto('https://html-canvas.test/dark/index.html?artifact', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.beamComposition.ready);
  for (let n = 0; n < 60; n++) {
    await page.evaluate(async (ms) => {
      await window.beamComposition.seek(ms);
    }, n * 200);
    await page.screenshot({
      path: resolve(output, String(n).padStart(3, '0') + '.png'),
      clip: { x: 0, y: 0, width: 500, height: 312 },
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
const result = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    '5',
    '-i',
    resolve(output, '%03d.png'),
    '-c:v',
    'libopenh264',
    '-b:v',
    '600k',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    resolve(root, 'assets/html-source.mp4'),
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0) throw new Error('HTML thumbnail source export failed');

const thumbnails = resolve(root, 'assets/thumbnails');
mkdirSync(thumbnails, { recursive: true });
for (const index of [0, 10, 20, 30, 40, 50]) {
  const name = String(index).padStart(3, '0') + '.png';
  copyFileSync(resolve(output, name), resolve(thumbnails, name));
}
