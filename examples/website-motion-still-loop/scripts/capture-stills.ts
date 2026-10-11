import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { buildMotionBundle } from '../../../apps/cli/src/motion-bundle';
import { createMotionPage } from '../../../apps/cli/src/motion-page';
import { serveRenderBundle } from '../../../apps/cli/src/bundle-server';
import { root } from './beam-cli.mjs';
import { stillTimeMs } from '../src/scene-state';

// Reuse the exact CLI HTML frame renderer, rather than draw a second artwork.
await mkdir(resolve(root, '.beam'), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE || '/opt/google/chrome/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  for (const theme of ['dark', 'light']) {
    const entry = resolve(root, `dist/artwork/${theme}/scene.html`);
    const files = await buildMotionBundle(entry, resolve(root, `.beam/frame-${theme}`));
    const server = await serveRenderBundle(files, async (_request, _response, next) => next());
    const context = await browser.createBrowserContext();
    const errors: string[] = [];
    try {
      const renderer = await createMotionPage(
        context,
        server.origin,
        { entry, width: 1280, height: 800, assetId: 'motion:html' },
        (error) => errors.push(error.message),
      );
      const png = await renderer.frame(stillTimeMs);
      if (errors.length) throw new Error(errors.join('\n'));
      await writeFile(resolve(root, `assets/still-${theme}.png`), png);
      console.log(`Captured ${theme} PNG from the actual HTML at ${stillTimeMs} ms.`);
    } finally {
      await context.close();
      await server.close();
    }
  }
} finally {
  await browser.close();
}
