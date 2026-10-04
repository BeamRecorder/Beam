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
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
  };
  page.on('request', (request) => {
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'html-canvas.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
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
    await page.goto(`https://html-canvas.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = async (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
    const evidence = async () => {
      const parts = [digest(await page.screenshot())];
      const state = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.caption, .workspace, .artwork, .orbit, .save-button, .timeline')).map(
          (element) => {
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
          },
        ),
      );
      return JSON.stringify({ parts, state });
    };
    for (const time of [0, 1900, 2900, 3300, 5400, 6900, 9000, 12000]) {
      await seek(time);
      const first = await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) });
      const firstEvidence = await evidence();
      await seek(10000);
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
    const native = await page.evaluate(() => ({
      zooms: document.querySelectorAll('[data-timeline-zoom-id]').length,
      thumbs: document.querySelector('.timeline-content-surface')?.width,
      projection: document.querySelector('.zoom-panel')?.textContent,
    }));
    if (native.zooms !== 2 || !native.thumbs || !native.projection.includes('2D'))
      throw new Error('Native timeline or 2D inspector missing');
    await seek(2900);
    const beforeSave = await page.$eval('h1', (element) => element.textContent);
    await seek(3300);
    const afterSave = await page.$eval('h1', (element) => element.textContent);
    if (beforeSave !== 'Hello, HTML.' || afterSave !== 'Make it yours.')
      throw new Error('HTML title did not answer the save');
    await seek(6900);
    const accent = await page.$eval('.orbit', (element) => getComputedStyle(element).backgroundColor);
    if (accent !== 'rgb(207, 74, 29)') throw new Error('The CSS edit did not update the actual shape');
    await seek(0);
    const first = await evidence();
    await seek(12000);
    const last = await evidence();
    if (first !== last) throw new Error(`Visible ${theme} loop seam`);
    results.push({
      theme,
      reverseSeeks: 8,
      loopSeam: 'identical full-frame pixels and DOM poses',
      titleSave: true,
      cssSave: true,
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify({ durationMs: 12000, samples: results, runtimeErrors: 0, externalRequests: 0 }, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
