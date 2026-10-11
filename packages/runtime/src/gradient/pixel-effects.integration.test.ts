// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../../../apps/cli/src/chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('real pixel effect rendering', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-pixel-effects-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'pixel-test',
          configureServer(server) {
            server.middlewares.use('/pixel-test', (_req, res) => {
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
    page.on('pageerror', (error) => console.error(error));
    await page.goto(`http://127.0.0.1:${address.port}/pixel-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it('preserves fractional alpha and unrelated pixels through every shader and JJN worker', async () => {
    const results = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof import('./tests/pixel-effect-browser-host')>;
      return (await load('/packages/runtime/src/gradient/tests/pixel-effect-browser-host.ts')).renderPixelEffects();
    });
    for (const result of results) {
      expect(result.alphaErrors, JSON.stringify(result)).toBe(0);
      expect(result.changed, JSON.stringify(result)).toBeGreaterThan(0);
      expect(result.other).toEqual([255, 0, 0, 255]);
      expect(result.stable).toBe(true);
    }
  }, 30000);

  it('exports each effect through the shared PNG encoder, including a nested JJN worker', async () => {
    const results = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof import('./tests/pixel-effect-browser-host')>;
      return (await load('/packages/runtime/src/gradient/tests/pixel-effect-browser-host.ts')).exportPixelEffects();
    });
    for (const result of results) {
      expect(result.bytes).toBeGreaterThan(100);
      expect(result.center[3], JSON.stringify(result)).toBeGreaterThan(0);
    }
  }, 30000);
  it.each([0.8, 1, 1.25])(
    'shows scrollbars only for overflow at inspector scale %s',
    async (scale) => {
      await page.setViewport({ width: 1400, height: 800 });
      await page.evaluate(() =>
        Object.defineProperty(window, 'capture', {
          configurable: true,
          value: {
            getPreferences: async () => ({ extras: {}, accessibility: {} }),
            onPreferencesChanged: () => () => {},
          },
        }),
      );
      for (const tall of [false, true]) {
        const metrics = await page.evaluate(
          async ({ scale, tall }) => {
            const load = new Function('path', 'return import(path)') as (
              path: string,
            ) => Promise<
              typeof import('../../../../apps/desktop/src/components/screenshot/tests/screenshot-scroll-browser-host')
            >;
            await (
              await load('/apps/desktop/src/components/screenshot/tests/screenshot-scroll-browser-host.ts')
            ).mountScrollPanels(scale, tall);
            const viewport = document.querySelector<HTMLElement>('.panel-scroll-shadow .scroll-shadow-viewport')!;
            const list = document.querySelector<HTMLElement>('.layer-list')!;
            const style = getComputedStyle(viewport);
            return {
              overflow: viewport.scrollHeight - viewport.clientHeight,
              compositionOverflow: list.scrollHeight - list.clientHeight,
              thumb: getComputedStyle(viewport, '::-webkit-scrollbar-thumb').backgroundColor,
              mask: style.maskImage,
            };
          },
          { scale, tall },
        );
        expect(metrics.compositionOverflow).toBeLessThanOrEqual(1);
        if (tall) {
          expect(metrics.overflow).toBeGreaterThan(100);
          expect(metrics.mask).toContain('linear-gradient(rgb(0, 0, 0)');
        } else expect(metrics.overflow).toBeLessThanOrEqual(1);
        expect(metrics.thumb).not.toBe('rgba(0, 0, 0, 0)');
        if (scale === 1 && !tall) await page.screenshot({ path: '/tmp/beam-effect-inspector.png' });
      }
    },
    30000,
  );
});
