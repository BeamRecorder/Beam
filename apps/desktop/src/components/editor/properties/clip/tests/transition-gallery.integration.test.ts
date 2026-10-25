// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../../cli/src/chromium-settings';
import type * as TransitionGalleryBrowserHostModule from './transition-gallery-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('transition gallery in Chromium', () => {
  const hostPath = '/apps/desktop/src/components/editor/properties/clip/tests/transition-gallery-browser-host.ts';
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string, url: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-transition-gallery-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@lucide/vue'] },
      plugins: [
        {
          name: 'transition-gallery-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-transition-gallery-test', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><html><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test server address.');
    url = `http://127.0.0.1:${address.port}/beam-transition-gallery-test`;
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...environment } = process.env;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      userDataDir: resolve(temporary, 'profile'),
      args: chromiumSettings().args,
      env: { ...environment, TMPDIR: temporary },
    });
    page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  async function mount(theme: string, reduced = false, reset = true) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
    if (reset) {
      await page.goto(url);
      await page.evaluate(() => Object.defineProperty(window, 'capture', { configurable: true, value: {} }));
    }
    await page.evaluate(
      async (path, theme, reset) => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof TransitionGalleryBrowserHostModule>;
        await (await load(path)).mountTransitionGallery(theme, reset);
      },
      hostPath,
      theme,
      reset,
    );
    await page.waitForSelector('[data-transition-category="basics"]');
    await settle();
  }
  async function settle() {
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));
  }
  async function preview(preset: string) {
    return page.evaluate(
      async (path, preset) => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof TransitionGalleryBrowserHostModule>;
        return (await load(path)).galleryPreviewState(preset);
      },
      hostPath,
      preset,
    );
  }

  it.each(['light', 'dark'])(
    'shows neutral previews and remembers the last category in %s theme',
    async (theme) => {
      await mount(theme);
      expect(await page.$$eval('[data-transition-category]', (items) => items.length)).toBe(7);
      expect(await page.$$eval('[data-transition-preset]', (items) => items.length)).toBe(29);
      const fade = await preview('fade');
      expect(fade.visible).toBeGreaterThan(0);
      expect(fade.colorful).toBe(0);
      expect(fade.contrast).toBeGreaterThan(10);
      await page.click('[data-transition-category="zooms"] .accordion-trigger');
      await settle();
      const zoom = await preview('zoom-in');
      expect(zoom.visible).toBeGreaterThan(0);
      expect(zoom.colorful).toBe(0);
      expect(zoom.contrast).toBeGreaterThan(10);
      await mount(theme, false, false);
      expect(
        await page.$eval('[data-transition-category="zooms"] .accordion-trigger', (item) =>
          item.getAttribute('aria-expanded'),
        ),
      ).toBe('true');
      await page.screenshot({ path: `/tmp/beam-transition-gallery-${theme}.png` });
    },
    30000,
  );

  it('stops painting selected previews after their category closes', async () => {
    await mount('dark');
    const start = await preview('fade');
    await settle();
    expect((await preview('fade')).paints).toBeGreaterThan(start.paints);
    await page.click('[data-transition-category="zooms"] .accordion-trigger');
    await settle();
    const closed = await preview('fade');
    await page.hover('[data-transition-preset="zoom-in"]');
    await settle();
    expect((await preview('fade')).paints).toBe(closed.paints);
    const hovered = await preview('zoom-in');
    await settle();
    expect((await preview('zoom-in')).paints).toBeGreaterThan(hovered.paints);
  }, 30000);

  it('paints a stationary neutral preview when reduced motion is enabled', async () => {
    await mount('dark', true);
    const first = await preview('fade');
    await settle();
    expect((await preview('fade')).paints).toBe(first.paints);
    expect(first.visible).toBeGreaterThan(0);
    expect(first.colorful).toBe(0);
    await page.click('[data-transition-category="zooms"] .accordion-trigger');
    await page.hover('[data-transition-preset="zoom-in"]');
    await settle();
    const zoom = await preview('zoom-in');
    await settle();
    expect((await preview('zoom-in')).paints).toBe(zoom.paints);
    expect(zoom.colorful).toBe(0);
  }, 30000);
  it('keeps None full width at compact height without a placeholder duration block', async () => {
    await mount('dark');
    await page.evaluate(async (path) => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof TransitionGalleryBrowserHostModule>;
      await (await load(path)).mountTransitionGallery('dark', true, true);
    }, hostPath);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('.transitions-panel')!.getBoundingClientRect();
      const none = document.querySelector('.none-preset')!.getBoundingClientRect();
      return {
        height: none.height,
        width: none.width,
        panelWidth: panel.width,
        left: none.left - panel.left,
        edges: Array.from(document.querySelectorAll('.edge-selector button')).map(
          (item) => item.getBoundingClientRect().height,
        ),
        duration: !!document.querySelector('.duration-control'),
      };
    });
    expect(result.height).toBeLessThanOrEqual(25);
    expect(result.width).toBeCloseTo(result.panelWidth, 1);
    expect(result.left).toBeCloseTo(0, 1);
    expect(result.edges.every((height) => height <= 25)).toBe(true);
    expect(result.duration).toBe(false);
    await page.screenshot({ path: '/tmp/beam-transitions-empty-compact.png' });
  }, 30000);
});
