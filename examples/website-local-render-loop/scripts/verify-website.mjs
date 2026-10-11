import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const output = resolve(root, '.beam/website-proof');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/opt/google/chrome/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);
    await page.goto(`${process.env.BEAM_WEBSITE_URL || 'http://localhost:7000'}/features/ai-html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#local .playback-control button');
    await page.waitForFunction(() => document.querySelector('#local video')?.__vueParentComponent?.isMounted);
    await page.$eval('#local', (element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.waitForFunction(
      (theme) => {
        const video = document.querySelector('#local video');
        return video?.currentSrc.endsWith(`local-render-${theme}.webm`) && video.readyState >= 2 && !video.paused;
      },
      { timeout: 20000 },
      theme,
    );
    await page.click('#local .playback-control button');
    await page.waitForFunction(() => document.querySelector('#local video').paused);
    await page.evaluate(async () => {
      const video = document.querySelector('#local video');
      const sought = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 6.3;
      await sought;
    });
    await (await page.$('#local')).screenshot({ path: resolve(output, `${theme}-desktop.png`) });
    const desktop = await page.$eval('#local video', (video) => ({
      source: video.currentSrc,
      poster: video.poster,
      paused: video.paused,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    }));
    if (desktop.duration !== 8 || desktop.width !== 1280 || desktop.height !== 800)
      throw new Error('Unexpected website video metadata');
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('#local', (element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
    const fits = await page.$eval('#local', (section) => {
      const video = section.querySelector('video').getBoundingClientRect();
      return video.left >= 0 && video.right <= window.innerWidth;
    });
    if (!fits) throw new Error('The mobile media overflows its section');
    await (await page.$('#local')).screenshot({ path: resolve(output, `${theme}-mobile.png`) });
    if (!(await page.$eval('#local video', (video) => video.paused)))
      throw new Error('Manual pause did not survive resize');
    results.push({ theme, ...desktop, mobileFits: fits, manualPause: true });
    await page.close();
  }
  const reduced = await browser.newPage();
  await reduced.setViewport({ width: 1280, height: 900 });
  await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await reduced.goto(`${process.env.BEAM_WEBSITE_URL || 'http://localhost:7000'}/features/ai-html`, {
    waitUntil: 'domcontentloaded',
  });
  await reduced.waitForSelector('#local .playback-control button');
  await reduced.waitForFunction(() => document.querySelector('#local video')?.__vueParentComponent?.isMounted);
  await reduced.$eval('#local', (element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await reduced.waitForFunction(
    () => !!document.querySelector('#local .playback-control button[aria-label="Play animation"]'),
  );
  if (!(await reduced.$eval('#local video', (video) => video.paused)))
    throw new Error('Reduced motion started the animation');
  await reduced.close();
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify({ samples: results, reducedMotionPaused: true }, null, 2) + '\n',
  );
  console.log('Website: light/dark playback, manual pause, mobile fit and reduced motion passed.');
} finally {
  await browser.close();
}
