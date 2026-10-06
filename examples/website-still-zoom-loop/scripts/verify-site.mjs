import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.beam/website');
const base = process.argv[2] || 'http://localhost:7000';
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true, args: ['--no-sandbox'],
});
const reports = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);
    await page.goto(`${base}/features/zooms#still-lenses`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#still-lenses video');
    await page.evaluate(() => document.querySelector('#still-lenses').scrollIntoView({ block: 'center' }));
    await page.waitForFunction(theme => {
      const video = document.querySelector('#still-lenses video');
      return video?.readyState >= 2 && !video.paused && video.currentTime > 0
        && video.currentSrc.endsWith(`/zooms-still-${theme}.webm`);
    }, { timeout: 30000 }, theme);
    const state = await page.evaluate(() => {
      const section = document.querySelector('#still-lenses'), video = section.querySelector('video');
      return { title: section.querySelector('h2').textContent, source: video.currentSrc,
        poster: video.poster, duration: video.duration, width: video.videoWidth, height: video.videoHeight,
        muted: video.muted, loop: video.loop, missing: Boolean(section.querySelector('.missing-media')) };
    });
    if (state.duration !== 9 || state.width !== 1280 || state.height !== 800
      || !state.loop || !state.muted || state.missing || !state.poster.endsWith(`zooms-still-${theme}.webp`)) {
      throw new Error(`Incorrect ${theme} media: ${JSON.stringify(state)}`);
    }
    await page.click('#still-lenses button[aria-label="Pause animation"]');
    await page.waitForFunction(() => document.querySelector('#still-lenses video').paused);
    const section = await page.$('#still-lenses');
    await section.screenshot({ path: resolve(output, `${theme}.png`) });
    await page.click('#still-lenses button[aria-label="Play animation"]');
    await page.waitForFunction(() => !document.querySelector('#still-lenses video').paused);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => document.querySelector('#still-lenses video').paused);
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.evaluate(() => document.querySelector('#still-lenses').scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => {
      const rect = document.querySelector('#still-lenses video').getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0;
    });
    const reduced = await page.evaluate(() => document.querySelector('#still-lenses video').paused);
    if (!reduced) throw new Error('Reduced motion autoplayed');
    reports.push({ theme, ...state, pause: true, resume: true, offscreenPause: true, reducedMotion: true });
  }
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('Website: both themes, metadata, autoplay, pause/resume, offscreen pause and reduced motion passed.');
} finally { await browser.close(); }
