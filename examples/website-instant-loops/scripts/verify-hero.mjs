import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { root } from './beam-cli.mjs';
import { createHash } from 'node:crypto';

async function rasterEqual(page, a, b, seam = false) {
  if (a.equals(b)) return true;
  return page.evaluate(async ({ urls, seam }) => {
    const pixels = await Promise.all(urls.map(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    }));
    let changed = 0, total = 0, maximum = 0, edgeOutliers = 0;
    for (let index = 0; index < pixels[0].length; index += 4) {
      let delta = 0, pixelMaximum = 0;
      for (let channel = 0; channel < 3; channel++) {
        const value = Math.abs(pixels[0][index + channel] - pixels[1][index + channel]);
        maximum = Math.max(maximum, value);
        pixelMaximum = Math.max(pixelMaximum, value);
        delta += value;
      }
      changed += Number(delta > 0);
      edgeOutliers += Number(pixelMaximum > 6);
      total += delta;
    }
    // Chromium caches rounded SVG/image edges and backdrop surfaces differently
    // after a layer leaves the compositor. Bound both global error and sparse
    // edge outliers. A moved control, different preset or cursor pose exceeds
    // the per-channel ceiling and the 64-pixel outlier limit.
    if (seam) return changed <= 64 && maximum <= 1 && total <= 64;
    return changed <= 16000 && total <= 40000 && maximum <= 64 && edgeOutliers <= 64;
  }, { seam, urls: [a, b].map(buffer => 'data:image/png;base64,' + Buffer.from(buffer).toString('base64')) });
}

const output = resolve(root, '.beam/hero-proof');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/opt/google/chrome/google-chrome', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'hero.test' || !path.startsWith(resolve(root, 'dist') + '/') || !existsSync(path)) {
      errors.push('Missing asset: ' + request.url());
      return void request.abort();
    }
    void request.respond({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  for (const theme of ['dark', 'light']) {
    await page.goto(`https://hero.test/hero-${theme}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.beamComposition !== undefined);
    await page.evaluate(async () => window.beamComposition.ready);
    const frame = page.frames().find(frame => frame.parentFrame());
    const hashes = new Map();
    const captures = new Map();
    for (const time of [0, 800, 1600, 2000, 2800, 3200, 3900, 4400, 4900, 5600, 6200, 7000, 7700, 8500, 9300, 10300, 11600, 12200, 12900, 14100, 15000, 16400, 18000, 19100, 20200, 21000, 22400, 23983, 24000]) {
      await page.evaluate(async (time) => {
        await window.beamComposition.seek(time);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
      const pixels = await page.screenshot({ path: resolve(output, `${theme}-${time}.png`) });
      hashes.set(time, createHash('sha256').update(pixels).digest('hex'));
      captures.set(time, pixels);
    }
    // A glass dock edge can rerasterize by one color level after a native
    // popover closes. Allow at most 64 such pixels; all geometry must match.
    if (hashes.get(0) !== hashes.get(24000) && !(await rasterEqual(page, captures.get(0), captures.get(24000), true))) throw new Error('Opening and closing poses differ: ' + theme);
    for (const time of [21000, 16400, 14100, 11600, 7700, 4900, 3200, 2800, 2000, 0]) {
      await page.evaluate(async time => {
        await window.beamComposition.seek(time);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
      const pixels = await page.screenshot({ path: resolve(output, `${theme}-${time}-reverse.png`) });
      if (!(await rasterEqual(page, captures.get(time), pixels)))
        throw new Error('Non-deterministic reverse seek at ' + time + ': ' + theme);
    }
    await page.evaluate(() => window.beamComposition.seek(3200));
    const geometry = await frame.evaluate(() => [...document.querySelectorAll('button')].map(button => {
      const rect = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label') || button.textContent.trim(), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }));
    await page.evaluate(() => window.beamComposition.seek(21000));
    const chat = await frame.evaluate(() => {
      const viewport = document.querySelector('.thread-viewport').getBoundingClientRect();
      const replies = [...document.querySelectorAll('[data-reply]')].map(reply => ({
        name: reply.getAttribute('data-reply'),
        left: reply.getBoundingClientRect().left,
        top: reply.getBoundingClientRect().top,
        bottom: reply.getBoundingClientRect().bottom,
        opacity: getComputedStyle(reply).opacity,
      }));
      return {
        replies,
        viewport: { top: viewport.top, bottom: viewport.bottom },
        player: !!document.querySelector('.hero-playback, .hero-chat video[controls]'),
        editingHandles: !!document.querySelector('.hero-artwork [data-layer-id]'),
      };
    });
    if (chat.player || chat.editingHandles || chat.replies.length !== 3
      || chat.replies.some((reply, index) => reply.opacity !== '1'
        || reply.left !== chat.replies[0].left
        || reply.top < chat.viewport.top || reply.bottom > chat.viewport.bottom
        || (index > 0 && reply.top <= chat.replies[index - 1].bottom)))
      throw new Error('Chat must show three ordered left-aligned replies and a clean attachment: ' + theme + ' ' + JSON.stringify(chat));
    results.push({ theme, geometry, chat });
  }
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
  if (errors.length) throw new Error('Native hero errors: ' + errors.join('\n'));
} finally { await browser.close(); }
