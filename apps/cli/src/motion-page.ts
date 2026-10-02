import type { BrowserContext } from 'puppeteer-core';
import type { MotionHost } from './motion-types';
import type { MotionComposition } from '@beam/runtime/frames/motion-contract-types';
import { basename } from 'node:path';

export async function createMotionPage(
  context: BrowserContext,
  origin: string,
  host: MotionHost,
  failed: (error: Error) => void,
) {
  const page = await context.newPage(),
    url = `${origin}/motion/${basename(host.entry)}`;
  await page.setViewport({ width: host.width, height: host.height, deviceScaleFactor: 1 });
  if (process.env.BEAM_DEBUG) page.on('console', (message) => process.stderr.write(`[Motion] ${message.text()}\n`));
  page.on('pageerror', (error) => failed(new Error(`Motion composition: ${String(error)}`)));
  page.on('popup', (popup) => {
    void popup?.close();
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url() !== url) failed(new Error('Unexpected motion navigation.'));
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const composition = (window as Window & { beamComposition?: MotionComposition }).beamComposition;
    if (!composition || typeof composition.seek !== 'function')
      throw new Error('HTML must expose window.beamComposition.seek(timeMs).');
    await composition.ready;
  });
  let queue = Promise.resolve();
  return {
    frame(timeMs: number) {
      const task = queue.then(async () => {
        if (process.env.BEAM_DEBUG) process.stderr.write(`Motion seek ${timeMs} ms\n`);
        await page.bringToFront();
        await page.evaluate(async (timeMs) => {
          const composition = (window as Window & { beamComposition?: MotionComposition }).beamComposition;
          if (!composition) throw new Error('Motion composition was removed.');
          await composition.seek(timeMs);
          console.debug(`Motion evaluated ${timeMs} ms`);
          await document.fonts.ready;
          await Promise.all([...document.images].map((image) => image.decode()));
        }, timeMs);
        const bytes = await page.screenshot({ type: 'png', omitBackground: true, optimizeForSpeed: true });
        if (process.env.BEAM_DEBUG) process.stderr.write(`Motion captured ${timeMs} ms\n`);
        return bytes;
      });
      queue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
}
