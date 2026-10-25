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
import { SUPPORTED_LOCALES } from '../../../../i18n/locales';
import type { AppLocale } from '../../../../i18n/types';
import type * as PresetPreviewBrowserHostModule from './preset-preview-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('Preset previews in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const mount = async (mode: 'instant' | 'video' | 'screenshot' | 'pixels', locale: AppLocale = 'en', dark = false) => {
    await page.setViewport(mode === 'instant' ? { width: 672, height: 268 } : { width: 960, height: 600 });
    await page.evaluate(
      async ({ mode, locale, dark }) => {
        if (!window.capture)
          Object.defineProperty(window, 'capture', {
            configurable: true,
            value: {
              getPreferences: async () => ({ extras: {}, accessibility: {} }),
              onPreferencesChanged: () => () => {},
            },
          });
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof PresetPreviewBrowserHostModule>;
        await (
          await load('/apps/desktop/src/components/editor/presets/tests/preset-preview-browser-host.ts')
        ).mountPresetPreview(mode, locale, dark);
      },
      { mode, locale, dark },
    );
    if (mode === 'instant' || mode === 'pixels')
      await page.waitForSelector('.preset-preview[aria-busy="false"] canvas:not([style*="display: none"])');
  };
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-preset-preview-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'preset-preview-test',
          configureServer(server) {
            server.middlewares.use('/preset-preview-test', (_req, res) => {
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
    await page.goto(`http://127.0.0.1:${address.port}/preset-preview-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it.each(['instant', 'video', 'screenshot'] as const)(
    'shows real thumbnails in the %s menu in all 15 languages',
    async (mode) => {
      for (const locale of SUPPORTED_LOCALES) {
        await mount(mode, locale, locale === 'fr');
        if (mode !== 'instant') await page.click('.preset-trigger');
        await page.click('.select-trigger');
        await page.waitForSelector(
          '[role="option"] .preset-preview[aria-busy="false"] canvas:not([style*="display: none"])',
        );
        const metrics = await page.evaluate(() => {
          const menu = document.querySelector<HTMLElement>('.select-menu')!;
          const rect = menu.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            overflow: menu.scrollWidth - menu.clientWidth,
            canvases: [...menu.querySelectorAll<HTMLCanvasElement>('canvas')].map((canvas) => ({
              width: canvas.width,
              height: canvas.height,
              pixels: canvas
                .getContext('2d')!
                .getImageData(0, 0, canvas.width, canvas.height)
                .data.some((value) => value > 0),
            })),
            labels: [...document.querySelectorAll('.preset-preview')].map((preview) =>
              preview.getAttribute('aria-label'),
            ),
          };
        });
        expect(metrics.canvases.length).toBeGreaterThan(1);
        expect(metrics.canvases.some((canvas) => canvas.pixels)).toBe(true);
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        expect(metrics.left).toBeGreaterThanOrEqual(0);
        expect(metrics.right).toBeLessThanOrEqual(mode === 'instant' ? 672 : 960);
        expect(metrics.top).toBeGreaterThanOrEqual(0);
        expect(metrics.bottom).toBeLessThanOrEqual(mode === 'instant' ? 268 : 600);
        expect(metrics.labels.every((label) => label && !label.includes('EditorPresetControls.'))).toBe(true);
        if (locale === 'fr') await page.screenshot({ path: `/tmp/beam-preset-${mode}.png` });
      }
    },
    60000,
  );

  it('does not apply on hover and commits a keyboard selection after scrolling', async () => {
    await mount('instant');
    await page.click('.select-trigger');
    await page.hover('[data-option-index="1"]');
    const selection = async () =>
      page.evaluate(async () => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof PresetPreviewBrowserHostModule>;
        return (
          await load('/apps/desktop/src/components/editor/presets/tests/preset-preview-browser-host.ts')
        ).committedPreset();
      });
    expect(await selection()).toEqual({ id: 'default', commits: 0 });
    await page.focus('[data-option-index="0"]');
    for (let index = 0; index < 11; index++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[role="option"]'));
    expect(await selection()).toEqual({ id: 'preset-11', commits: 1 });
  });

  it('paints colored backgrounds, keeps transparency and decodes a real video background', async () => {
    await mount('pixels');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.preset-preview')].every(
          (preview) => preview.getAttribute('aria-busy') === 'false',
        ),
      { timeout: 20000 },
    );
    const pixels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLCanvasElement>('canvas')].map((canvas) => ({
        error: canvas.parentElement?.getAttribute('aria-label'),
        corner: [...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data],
        center: [
          ...canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
            .data,
        ],
      })),
    );
    expect(pixels[0]!.corner).toEqual([255, 0, 0, 255]);
    expect(pixels[1]!.corner).toEqual([0, 0, 0, 0]);
    expect(pixels[2]!.error).toBe('Preset preview');
    expect(pixels[2]!.corner[3]).toBe(255);
    expect(pixels.every((pixel) => pixel.center[3] === 255)).toBe(true);
  }, 30000);
});
