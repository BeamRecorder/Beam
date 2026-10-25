// @vitest-environment node
import { SUPPORTED_LOCALES } from '../../../i18n/locales';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../cli/src/chromium-settings';
import type * as DitheringPanelBrowserHostModule from '../tests/dithering-panel-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('Dithering inspector in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-dither-panel-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'dither-panel-test',
          configureServer(server) {
            server.middlewares.use('/dither-panel-test', (_req, res) => {
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
    await page.setViewport({ width: 1400, height: 950 });
    page.on('pageerror', (error) => console.error(error));
    await page.goto(`http://127.0.0.1:${address.port}/dither-panel-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it.each(SUPPORTED_LOCALES)(
    'keeps full option text visible in %s at three UI scales',
    async (locale) => {
      for (const scale of [0.8, 1, 1.25]) {
        const metrics = await page.evaluate(
          async ({ locale, scale }) => {
            Object.defineProperty(window, 'capture', {
              configurable: true,
              value: {
                getPreferences: async () => ({ extras: {}, accessibility: {} }),
                onPreferencesChanged: () => () => {},
              },
            });
            const load = new Function('path', 'return import(path)') as (
              path: string,
            ) => Promise<typeof DitheringPanelBrowserHostModule>;
            await (
              await load('/apps/desktop/src/components/screenshot/tests/dithering-panel-browser-host.ts')
            ).mountDitheringPanel(locale, scale, scale === 1.25);
            const body = document.querySelector<HTMLElement>('.panel-body')!;
            return {
              overflow: body.scrollWidth - body.clientWidth,
              labels: [...document.querySelectorAll<HTMLElement>('.select-control .select-label')].map((label) => ({
                text: label.textContent?.trim(),
                clipped: label.scrollWidth - label.clientWidth,
                width: label.closest('button')!.getBoundingClientRect().width,
              })),
              text: body.textContent,
              hints: [...body.querySelectorAll('[title]')].map((element) => element.getAttribute('title')),
              navigationDeletes: document.querySelectorAll('.effect-navigation .lucide-trash-2').length,
              footerDeletes: document.querySelectorAll('.effect-footer .lucide-trash-2').length,
            };
          },
          { locale, scale },
        );
        expect(metrics.overflow, JSON.stringify({ locale, scale, metrics })).toBeLessThanOrEqual(1);
        expect(metrics.labels).toHaveLength(2);
        for (const label of metrics.labels) {
          expect(label.width).toBeGreaterThan(230 * scale);
          expect(label.clipped, JSON.stringify({ locale, scale, label })).toBeLessThanOrEqual(1);
        }
        expect(metrics.labels[0]!.text).toBe('Jarvis–Judice–Ninke');
        expect(metrics.text).not.toMatch(/DitheringEffect\.|GradientEffect\.|ColorEffect\./);
        for (const hint of metrics.hints) {
          expect(hint).not.toMatch(/BigSlider\.|DitheringEffect\.|GradientEffect\.|ColorEffect\./);
          if (locale !== 'en') expect(hint).not.toMatch(/Reset to default|Click to edit value directly/);
        }
        expect(metrics.navigationDeletes).toBe(0);
        expect(metrics.footerDeletes).toBe(1);
        if (locale === 'fr' && scale !== 0.8)
          await page.screenshot({ path: '/tmp/beam-dither-panel-' + scale + '.png' });
      }
    },
    30000,
  );

  it('adds, edits and removes custom colors with real controls and switches algorithms from the full menu', async () => {
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof DitheringPanelBrowserHostModule>;
      await (
        await load('/apps/desktop/src/components/screenshot/tests/dithering-panel-browser-host.ts')
      ).mountDitheringPanel('fr', 1);
    });
    await (await page.$$('.gradient-actions button')).at(-1)!.click();
    await page.waitForFunction(() => document.querySelectorAll('.gradient-stop-row').length === 3);
    await page.click('.gradient-stop-row input');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.type('#26a69a');
    await page.keyboard.press('Enter');
    const read = () =>
      page.evaluate(async () => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof DitheringPanelBrowserHostModule>;
        return (
          await load('/apps/desktop/src/components/screenshot/tests/dithering-panel-browser-host.ts')
        ).currentDitheringEffect();
      });
    expect((await read()).recipe.colors).toEqual(['#26a69a', '#808080', '#ffffff']);
    await page.click('.gradient-stop-row > .btn-container button');
    await page.waitForFunction(() => document.querySelectorAll('.gradient-stop-row').length === 2);
    expect((await read()).recipe.colors).toEqual(['#808080', '#ffffff']);
    await page.click('.select-trigger');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"][data-option-index="0"]');
    expect((await read()).recipe.algorithm).toBe('bayer');
    expect(await page.$$eval('.select-trigger', (items) => items.length)).toBe(3);
  }, 30000);
});
