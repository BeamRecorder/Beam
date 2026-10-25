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
import type * as TimelineContrastBrowserHostModule from './timeline-contrast-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('timeline metadata contrast in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-timeline-contrast-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@lucide/vue'] },
      plugins: [
        {
          name: 'contrast-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-contrast-test', (_req, res) => {
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
    await page.goto(`http://127.0.0.1:${address.port}/beam-contrast-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  async function mount(theme = 'dark', scale = 1, kind: 'screen' | 'video' | 'image' = 'screen') {
    await page.evaluate(
      async ({ theme, scale, kind }) => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof TimelineContrastBrowserHostModule>;
        const host = await load('/apps/desktop/src/components/editor/timeline/tests/timeline-contrast-browser-host.ts');
        await host.mountContrastTimeline(theme, scale, kind);
      },
      { theme, scale, kind },
    );
    await page.waitForFunction(() => {
      const a = document.querySelector('[data-timeline-clip-id="clip-0"] .timeline-overlay-contrast');
      const b = document.querySelector('[data-timeline-clip-id="clip-1"] .timeline-overlay-contrast');
      return (
        a && b && getComputedStyle(a).color === 'rgb(255, 255, 255)' && getComputedStyle(b).color === 'rgb(22, 22, 26)'
      );
    });
  }
  it.each(['light', 'dark'])(
    'puts opposing backgrounds behind both cursor states and names in %s theme',
    async (theme) => {
      await mount(theme);
      const result = await page.$$eval('.canvas-clip-icons', (elements) =>
        elements.map((element) => ({
          ink: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
          width: element.getBoundingClientRect().width,
        })),
      );
      expect(result.map((value) => [value.ink, value.background])).toEqual([
        ['rgb(255, 255, 255)', 'rgb(22, 22, 26)'],
        ['rgb(22, 22, 26)', 'rgb(255, 255, 255)'],
      ]);
      expect(result.every((value) => value.width >= 16)).toBe(true);
      await page.screenshot({ path: `/tmp/beam-timeline-contrast-${theme}.png` });
    },
    30000,
  );
  it('keeps icon backgrounds separated from the title at non-unit UI scale', async () => {
    await mount('dark', 1.25);
    const gap = await page.evaluate(() => {
      const icon = document.querySelector('.canvas-clip-icons')!.getBoundingClientRect();
      const clip = document.querySelector('[data-timeline-clip-id="clip-0"]')!.getBoundingClientRect();
      // The shared metadata layout reserves 21px after the clip's 8px text inset; badge padding is 3px.
      return clip.left + (8 + 21 - 3) * 1.25 - icon.right;
    });
    expect(gap).toBeGreaterThanOrEqual(4);
  });
  it('adapts after actual image artwork changes without sampling its own backgrounds', async () => {
    await mount();
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof TimelineContrastBrowserHostModule>;
      const host = await load('/apps/desktop/src/components/editor/timeline/tests/timeline-contrast-browser-host.ts');
      await host.swapContrastThumbnails();
    });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-timeline-clip-id="clip-0"] .canvas-clip-icons')!).color ===
        'rgb(22, 22, 26)',
    );
    expect(
      await page.$eval(
        '[data-timeline-clip-id="clip-1"] .canvas-clip-icons',
        (element) => getComputedStyle(element).color,
      ),
    ).toBe('rgb(255, 255, 255)');
  });
});
