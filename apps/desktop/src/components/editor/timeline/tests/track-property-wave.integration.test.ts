// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';
import type * as TrackPropertyBrowserHostModule from './track-property-browser-host';
import type * as RecordingCursorBrowserHostModule from '../../canvas/tests/recording-cursor-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('track property application wave in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-track-wave-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@lucide/vue'] },
      plugins: [
        {
          name: 'track-wave-page',
          configureServer(server) {
            server.middlewares.use('/beam-track-wave-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><html><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No server');
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...env } = process.env;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      userDataDir: resolve(temporary, 'profile'),
      args: chromiumSettings().args,
      env: { ...env, TMPDIR: temporary },
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-track-wave-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  async function mount(theme = 'dark', reduced = false) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
    await page.evaluate(async (theme) => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof TrackPropertyBrowserHostModule>;
      const host = await load('/apps/desktop/src/components/editor/timeline/tests/track-property-browser-host.ts');
      await host.mountTrackPropertyTimeline(theme);
    }, theme);
    await page.waitForSelector('[role="checkbox"]');
  }
  it.each(['light', 'dark'])(
    'shows a bounded shimmer wave across affected clips in %s theme',
    async (theme) => {
      await mount(theme);
      await page.click('[role="checkbox"]');
      await page.waitForSelector('.track-property-feedback');
      const result = await page.evaluate(() => {
        return Array.from(document.querySelectorAll<HTMLElement>('.track-property-feedback')).map((element) => {
          for (const animation of element.getAnimations({ subtree: true })) {
            animation.pause();
            animation.currentTime = 240;
          }
          return {
            id: element.closest('[data-timeline-clip-id]')!.getAttribute('data-timeline-clip-id'),
            delay: element.style.getPropertyValue('--apply-delay'),
            pointerEvents: getComputedStyle(element).pointerEvents,
            radius: getComputedStyle(element).borderRadius,
          };
        });
      });
      expect(result.map((value) => value.id)).toEqual(['first', 'second', 'third']);
      expect(result.map((value) => value.delay)).toEqual(['0ms', '75ms', '150ms']);
      expect(result.every((value) => value.pointerEvents === 'none' && value.radius !== '0px')).toBe(true);
      await page.screenshot({ path: `/tmp/beam-track-wave-${theme}.png` });
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('.track-property-feedback')) {
          for (const animation of element.getAnimations({ subtree: true })) animation.finish();
        }
      });
      await page.waitForFunction(() => !document.querySelector('.track-property-feedback'));
    },
    30000,
  );
  it('uses a short stationary confirmation with reduced motion', async () => {
    await mount('dark', true);
    await page.click('[role="checkbox"]');
    const result = await page.$eval('.track-property-feedback', (element) => ({
      duration: getComputedStyle(element).animationDuration,
      delay: getComputedStyle(element).animationDelay,
      shimmer: getComputedStyle(element, '::after').display,
    }));
    expect(result).toEqual({ duration: '0.18s', delay: '0s', shimmer: 'none' });
    await page.waitForFunction(() => !document.querySelector('.track-property-feedback'));
  });
  it.each([false, true])(
    'paints independent cursor colors and sizes across cuts and reverse seeks, preview %s',
    async (preview) => {
      const pixels = await page.evaluate(async (preview) => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof RecordingCursorBrowserHostModule>;
        const host = await load('/apps/desktop/src/components/editor/canvas/tests/recording-cursor-browser-host.ts');
        return host.recordingCursorPixels(preview);
      }, preview);
      expect(
        pixels.map((frame) => frame.color),
        JSON.stringify(pixels),
      ).toEqual([
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        [255, 0, 0, 255],
      ]);
      expect(pixels.map((frame) => frame.extent)).toEqual([
        [136, 136, 136, 255],
        [0, 0, 255, 255],
        [136, 136, 136, 255],
      ]);
    },
    30000,
  );
  it('exports a hidden first cursor without hiding the second recording fragment', async () => {
    const pixels = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof RecordingCursorBrowserHostModule>;
      const host = await load('/apps/desktop/src/components/editor/canvas/tests/recording-cursor-browser-host.ts');
      return host.recordingCursorPixels(false, true);
    });
    expect(pixels.map((frame) => frame.color)).toEqual([
      [136, 136, 136, 255],
      [0, 0, 255, 255],
      [136, 136, 136, 255],
    ]);
  }, 30000);
});
