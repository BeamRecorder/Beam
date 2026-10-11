import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './beam-cli.mjs';

const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE || '/opt/google/chrome/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
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
    '.png': 'image/png',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
  };
  page.on('request', (request) => {
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    if (url.hostname === 'motion-still.test' && /^\/asset-still-(dark|light)\.png$/.test(url.pathname)) {
      return void request.respond({
        status: 200,
        contentType: 'image/png',
        body: readFileSync(resolve(root, 'assets', url.pathname.slice(7))),
      });
    }
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'motion-still.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
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
    await page.goto(`https://motion-still.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = async (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
    const evidence = async () => {
      const parts = [digest(await page.screenshot())];
      const state = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.heading, .output, .orbit, .clock, .caption')).map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            text: element.textContent,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            transform: style.transform,
            background: style.backgroundColor,
          };
        }),
      );
      return JSON.stringify({ parts, state });
    };
    for (const time of [0, 900, 2400, 2700, 4200, 5600, 6750, 7000]) {
      await seek(time);
      const first = await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) });
      const firstEvidence = await evidence();
      await seek(5600);
      await seek(0);
      await seek(time);
      const second = await page.screenshot({ path: resolve(output, `${theme}-${time}-reverse.png`) });
      const nextEvidence = await evidence();
      if (firstEvidence !== nextEvidence) {
        writeFileSync(resolve(output, 'evidence-first.json'), firstEvidence);
        writeFileSync(resolve(output, 'evidence-reverse.json'), nextEvidence);
        throw new Error(`Non-deterministic ${theme} subject at ${time}`);
      }
    }
    const stills = [];
    const rotations = [];
    for (const at of [900, 2400, 2700, 4200, 5600]) {
      await seek(at);
      const still = await page.$eval('.still-image', (image) => ({
        src: image.src,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
      stills.push(JSON.stringify(still));
      rotations.push(await page.$eval('.orbit', (element) => getComputedStyle(element).transform));
    }
    if (new Set(stills).size !== 1 || !stills[0].includes('1280') || !stills[0].includes('800'))
      throw new Error('The still is not a single unchanged full-resolution raster');
    if (rotations[0] === rotations[3] || rotations[1] !== rotations[2])
      throw new Error('Animated output or exact-frame hold is missing');
    await seek(2400);
    const labels = await page.$$eval('.clock', (elements) => elements.map((element) => element.textContent));
    if (JSON.stringify(labels) !== JSON.stringify(['00:02.40', 'Frame 144']))
      throw new Error('PNG frame label is not the exact source time');
    await seek(0);
    const first = await evidence();
    await seek(7000);
    const last = await evidence();
    if (first !== last) throw new Error(`Visible ${theme} loop seam`);
    await page.goto(`https://motion-still.test/artwork/${theme}/scene.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    await seek(2400);
    const sourcePng = await page.screenshot({ encoding: 'base64' });
    const pixels = await page.evaluate(
      async (theme, sourcePng) => {
        const png = new Image();
        png.src = '/asset-still-' + theme + '.png';
        const source = new Image();
        source.src = 'data:image/png;base64,' + sourcePng;
        await Promise.all([png.decode(), source.decode()]);
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 800;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(png, 0, 0);
        const a = ctx.getImageData(0, 0, 1280, 800).data;
        ctx.clearRect(0, 0, 1280, 800);
        ctx.drawImage(source, 0, 0);
        const b = ctx.getImageData(0, 0, 1280, 800).data;
        let different = 0;
        let totalDifference = 0;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) different++;
          totalDifference += Math.abs(a[i] - b[i]);
        }
        return { width: png.naturalWidth, height: png.naturalHeight, different, mean: totalDifference / a.length };
      },
      theme,
      sourcePng,
    );
    if (pixels.width !== 1280 || pixels.height !== 800 || pixels.different !== 0)
      throw new Error('PNG does not match its actual HTML source frame: ' + JSON.stringify(pixels));
    await page.screenshot({ path: resolve(output, `${theme}-source-frame-144.png`) });
    results.push({
      theme,
      reverseSeeks: 8,
      loopSeam: 'identical full-frame pixels and DOM poses',
      realPng: true,
      movingHtml: true,
      exactFrameHold: true,
      frame: 144,
      sourcePngDifference: pixels,
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify({ durationMs: 7000, samples: results, runtimeErrors: 0, externalRequests: 0 }, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
