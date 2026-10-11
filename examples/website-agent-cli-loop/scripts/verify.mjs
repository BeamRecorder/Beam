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
    if (url.hostname !== 'agent-cli.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
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
    await page.goto(`https://agent-cli.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = async (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
    const evidence = async () => {
      const parts = [digest(await page.screenshot())];
      const state = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.heading, .terminal, .purpose, .typed, .closing')).map((element) => {
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
    for (const time of [0, 600, 1300, 2200, 2900, 4000, 5600, 7000]) {
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
    await seek(5600);
    const actual = await page.$$eval('.typed', (elements) => elements.map((element) => element.textContent));
    const expected = [
      'beam-cli tools list',
      'beam-cli tools call documents.snapshot @project.json',
      'beam-cli tools call documents.transact @edit.json',
    ];
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Command frontier never reaches the real commands');
    const footer = await page.$eval('.closing', (element) => element.textContent);
    if (!footer.includes('Live edits in Beam. Built-in undo.')) throw new Error('Final message missing');
    await seek(0);
    const first = await evidence();
    await seek(7000);
    const last = await evidence();
    if (first !== last) throw new Error(`Visible ${theme} loop seam`);
    results.push({
      theme,
      reverseSeeks: 8,
      loopSeam: 'identical full-frame pixels and DOM poses',
      completedCommands: actual,
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
