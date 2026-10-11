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
  const details = ['glass', 'automatic'];
  for (const theme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await page.goto(`${process.env.BEAM_WEBSITE_URL || 'http://localhost:7000'}/features/zooms`, {
      waitUntil: 'networkidle0',
    });
    for (const id of details) {
      await page.$eval(`#${id}`, (element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForFunction(
        (id, theme) => {
          const video = document.querySelector(`#${id} video`);
          const name = `zooms-${id}-${theme}.webm`;
          return video?.currentSrc.endsWith(name) && video.readyState >= 2 && !video.paused;
        },
        { timeout: 10000 },
        id,
        theme,
      );
      await page.screenshot({ path: resolve(output, `website-${id}-${theme}.png`) });
      await page.$eval(`#${id} [aria-label="Pause animation"]`, (button) => button.click());
      await page.waitForFunction((id) => document.querySelector(`#${id} video`)?.paused, {}, id);
    }
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.reload({ waitUntil: 'networkidle0' });
  for (const id of details) {
    await page.$eval(`#${id}`, (element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const reduced = await page.$eval(`#${id} video`, (video) => video.paused && !!video.poster);
    if (!reduced) throw new Error(`${id} did not show a paused reduced-motion poster.`);
  }
  console.log(
    JSON.stringify({ details, themes: ['light', 'dark'], decoded: true, manualPause: true, reducedMotion: true }),
  );
} finally {
  await browser.close();
}
