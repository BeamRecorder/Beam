import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './beam-cli.mjs';

const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/opt/google/chrome/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setRequestInterception(true);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.ttf': 'font/ttf',
  };
  page.on('request', (request) => {
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'local-render.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing or external asset: ' + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || 'application/octet-stream',
      body: readFileSync(path),
    });
  });
  const seek = async (time) =>
    page.evaluate(async (ms) => {
      await window.beamComposition.seek(ms);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);
  for (const theme of ['dark', 'light']) {
    await page.goto(`https://local-render.test/${theme}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => window.beamComposition.ready);
    const hashes = [];
    for (const time of [0, 500, 1200, 2100, 3200, 4600, 5600, 6300, 8000]) {
      await seek(time);
      const firstState = await page.$eval('.machine', (element) => ({
        html: element.innerHTML,
        style: getComputedStyle(element).cssText,
      }));
      const first = digest(await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) }));
      await seek(6300);
      await seek(0);
      await seek(time);
      const reverse = digest(await page.screenshot({ path: resolve(output, `${theme}-${time}-reverse.png`) }));
      if (first !== reverse) {
        const reverseState = await page.$eval('.machine', (element) => ({
          html: element.innerHTML,
          style: getComputedStyle(element).cssText,
        }));
        writeFileSync(resolve(output, 'state-first.json'), JSON.stringify(firstState, null, 2));
        writeFileSync(resolve(output, 'state-reverse.json'), JSON.stringify(reverseState, null, 2));
        throw new Error(`Unstable reverse seek at ${theme}/${time}`);
      }
      hashes.push(first);
    }
    if (hashes[0] !== hashes.at(-1)) throw new Error(`Visible ${theme} loop seam`);
    if (new Set(hashes).size < 6) throw new Error('Workflow animation did not advance');
    await seek(5600);
    const finalizing = await page.$eval('.status-line', (element) => element.textContent);
    const hidden = await page.$eval('.saved-file', (element) => getComputedStyle(element).opacity);
    if (!finalizing.includes('Writing the file') || hidden !== '0') throw new Error('File appears before finalization');
    await seek(6300);
    const command = await page.$eval('.typed', (element) => element.textContent);
    const completed = await page.$eval('.status-line', (element) => element.textContent);
    const file = await page.$eval('.saved-file', (element) => ({
      text: element.textContent,
      opacity: Number(getComputedStyle(element).opacity),
    }));
    if (
      command !== 'beam-cli motion scene.json output.mp4' ||
      !completed.includes('Export complete') ||
      !completed.includes('100%') ||
      file.opacity < 0.95 ||
      !file.text.includes('Saved locally')
    )
      throw new Error('Completed export is missing');
    const within = await page.evaluate(() => {
      const box = document.querySelector('.machine').getBoundingClientRect();
      return ['.command-content', '.source-card', '.renderer-card', '.output-card', '.render-status'].every(
        (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom;
        },
      );
    });
    if (!within) throw new Error('Pipeline escaped the machine boundary');
    results.push({
      theme,
      reverseSeeks: 9,
      loopSeam: 'identical full-frame pixels',
      pipelineInsideMachine: true,
      fileAfterFinalization: true,
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify({ durationMs: 8000, samples: results, runtimeErrors: 0, externalRequests: 0 }, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
