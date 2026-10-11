import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox'],
});
const output = resolve(root, '.beam/website-verification');
mkdirSync(output, { recursive: true });
const report = [];
try {
  for (const mode of ['2d', '3d'])
    for (const theme of ['light', 'dark']) {
      const section = mode,
        selector = `[id="${section}"] video`;
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1000 });
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'no-preference' },
      ]);
      await page.goto(`${process.env.BEAM_WEBSITE_URL || 'http://127.0.0.1:7000'}/features/zooms`, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
      await page.waitForSelector(selector);
      await page.$eval(`[id="${section}"]`, (element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );
      await page.waitForFunction(
        (selector) => {
          const video = document.querySelector(selector);
          return !video.paused && video.readyState >= 2 && video.currentTime > 0.1;
        },
        { timeout: 20000 },
        selector,
      );
      const before = await page.$eval(selector, (video) => video.currentTime);
      await new Promise((resolve) => setTimeout(resolve, 450));
      const playback = await page.$eval(selector, (video) => ({
        time: video.currentTime,
        src: video.currentSrc,
        poster: video.poster,
        muted: video.muted,
        loop: video.loop,
        duration: video.duration,
      }));
      if (
        !playback.src.endsWith(`zooms-${mode}-${theme}.webm`) ||
        !playback.poster.endsWith(`zooms-${mode}-${theme}.webp`) ||
        playback.time <= before ||
        Math.abs(playback.duration - 8) > 0.05 ||
        !playback.muted ||
        !playback.loop
      )
        throw new Error(`${mode}/${theme} did not play the right themed muted loop.`);
      await page.click(`[id="${section}"] [aria-label="Pause animation"]`);
      await page.emulateMediaFeatures([
        {
          name: 'prefers-color-scheme',
          value: theme === 'light' ? 'dark' : 'light',
        },
      ]);
      await page.waitForFunction(
        ({ selector, expected }) => document.querySelector(selector).src.endsWith(expected),
        {},
        {
          selector,
          expected: `zooms-${mode}-${theme === 'light' ? 'dark' : 'light'}.webm`,
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (!(await page.$eval(selector, (video) => video.paused)))
        throw new Error('A theme change discarded the manual pause.');
      await page.screenshot({ path: resolve(output, `${mode}-${theme}.png`) });
      report.push({
        mode,
        theme,
        ...playback,
        manualPause: true,
        themeChange: true,
      });
      await page.close();
    }
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${process.env.BEAM_WEBSITE_URL || 'http://127.0.0.1:7000'}/features/zooms`, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  for (const section of ['2d', '3d']) {
    await page.$eval(`[id="${section}"]`, (element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await page.$eval(`[id="${section}"] video`, (video) => video.paused)))
      throw new Error('Reduced motion unexpectedly played the animation.');
  }
  report.push({ reducedMotion: 'both static posters' });
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
