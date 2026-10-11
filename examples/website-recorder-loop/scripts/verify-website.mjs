import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  for (const theme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await page.goto(`${process.env.BEAM_WEBSITE_URL || 'http://localhost:7000'}/features/recording`, {
      waitUntil: 'networkidle0',
    });
    await page.$eval('#sources', (element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(
      (theme) => {
        const video = document.querySelector('#sources video');
        return video?.currentSrc.endsWith(`recording-sources-${theme}.webm`) && video.readyState >= 2 && !video.paused;
      },
      { timeout: 10000 },
      theme,
    );
    await page.screenshot({ path: resolve(output, `website-${theme}.png`) });
    await page.$eval('#sources [aria-label="Pause animation"]', (button) => button.click());
    await page.waitForFunction(() => document.querySelector('#sources video')?.paused);
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.$eval('#sources', (element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const reduced = await page.$eval('#sources video', (video) => video.paused && !!video.poster);
  if (!reduced) throw new Error('The reduced-motion poster did not stay paused.');
  console.log(
    JSON.stringify({
      themes: ['light', 'dark'],
      playback: 'actual videos decoded',
      manualPause: true,
      reducedMotion: 'static poster',
    }),
  );
} finally {
  await browser.close();
}
