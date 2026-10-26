// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../cli/src/chromium-settings';
import type * as QuickSnipSelectionBrowserHostModule from './quick-snip-selection-browser-host';
import type * as LongTextBrowserHostModule from './quick-snip-long-text-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('Vietnamese Quick Capture layout in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-quick-capture-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../', import.meta.url)),
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
  it.each(['studio', 'screenshot'] as const)(
    'fits both Vietnamese capture choices in %s mode',
    async (displayMode) => {
      await page.evaluate(async (displayMode) => {
        const load = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof QuickSnipSelectionBrowserHostModule>;
        const host = await load('/apps/desktop/src/components/quick-snip/quick-snip-selection-browser-host.ts');
        await host.mountVietnameseCaptureBar(displayMode);
      }, displayMode);
      const result = await page.evaluate(() => {
        const bar = document.querySelector('.crop-bar')!.getBoundingClientRect();
        const choices = [...document.querySelectorAll('.capture-modes button')];
        const actions = [...document.querySelectorAll('.crop-bar button')];
        return {
          labels: choices.map((button) => button.textContent!.trim()),
          titles: choices.map((button) => button.getAttribute('title')),
          overflow: actions
            .filter((button) => {
              const b = button.getBoundingClientRect();
              return b.right > bar.right || b.left < bar.left;
            })
            .map((button) => button.getAttribute('aria-label')),
          overlap: actions.flatMap((button, index) => {
            const a = button.getBoundingClientRect();
            return actions
              .slice(index + 1)
              .filter((other) => {
                const b = other.getBoundingClientRect();
                return (
                  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
                );
              })
              .map((other) => [
                button.getAttribute('aria-label'),
                other.getAttribute('aria-label'),
                Math.min(a.right, other.getBoundingClientRect().right) -
                  Math.max(a.left, other.getBoundingClientRect().left),
              ]);
          }),
        };
      });
      expect(result.labels).toEqual(['Ghi hình', 'Chụp ảnh']);
      expect(result.titles).toEqual([null, null]);
      expect(result.overflow).toEqual([]);
      expect(result.overlap).toEqual([]);
    },
    15000,
  );
  it('scrolls long Vietnamese capture settings within the native panel, with edge shadows and intact switches', async () => {
    await page.setViewport({ width: 286, height: 246, deviceScaleFactor: 2 });
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof LongTextBrowserHostModule>;
      const host = await load('/apps/desktop/src/components/quick-snip/quick-snip-long-text-browser-host.ts');
      await host.mountLongCaptureSettings('settings');
    });
    await page.waitForFunction(() => document.querySelector('.select-label')?.classList.contains('is-overflowing'));
    await page.waitForFunction(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof LongTextBrowserHostModule>;
      return (
        (
          await load('/apps/desktop/src/components/quick-snip/quick-snip-long-text-browser-host.ts')
        ).captureSettingsMeasurements().length > 0
      );
    });
    const initial = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof LongTextBrowserHostModule>;
      const host = await load('/apps/desktop/src/components/quick-snip/quick-snip-long-text-browser-host.ts');
      const viewport = document.querySelector<HTMLElement>('.settings-scroll > .scroll-shadow-viewport')!;
      const panel = document.querySelector<HTMLElement>('.quick-settings-window')!;
      return {
        overflowing: viewport.scrollHeight > viewport.clientHeight,
        mask: getComputedStyle(viewport).maskImage,
        horizontalOverflow: panel.scrollWidth - panel.clientWidth,
        fit: host.captureSettingsMeasurements().at(-1),
        contentHeight: document.querySelector<HTMLElement>('.settings-content')!.scrollHeight + 2,
        switches: [...document.querySelectorAll('[role="switch"]')].map((control) => {
          const rect = control.getBoundingClientRect(),
            bounds = panel.getBoundingClientRect();
          return rect.width >= 43 && rect.left >= bounds.left && rect.right <= bounds.right;
        }),
      };
    });
    expect(initial.overflowing).toBe(true);
    expect(initial.mask).toContain('rgba(0, 0, 0, 0)');
    expect(initial.horizontalOverflow).toBe(0);
    expect(initial.fit).toBe(initial.contentHeight);
    expect(initial.switches).toEqual([true, true, true]);
    if (process.env.BEAM_TEST_SCREENSHOT_DIR)
      await page.screenshot({ path: resolve(process.env.BEAM_TEST_SCREENSHOT_DIR, 'beam-long-text-settings.png') });
    await page.hover('.select-trigger');
    await page.waitForFunction(
      () => new DOMMatrix(getComputedStyle(document.querySelector('.select-label .marquee-label')!).transform).m41 < -3,
      { timeout: 6000 },
    );
    await page.evaluate(() => {
      const viewport = document.querySelector('.settings-scroll > .scroll-shadow-viewport')!;
      viewport.scrollTop = viewport.scrollHeight;
    });
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('.settings-scroll > .scroll-shadow-viewport')!).maskImage.includes(
        'rgba(0, 0, 0, 0) 0%',
      ),
    );
  }, 30000);

  it('reads long action and device labels on keyboard focus while respecting reduced motion', async () => {
    await page.setViewport({ width: 600, height: 400 });
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof LongTextBrowserHostModule>;
      await (
        await load('/apps/desktop/src/components/quick-snip/quick-snip-long-text-browser-host.ts')
      ).mountLongCaptureSettings('labels');
    });
    await page.mouse.move(590, 390);
    for (const selector of ['.btn', '.menu-item']) {
      await page.focus(selector);
      await page.waitForFunction(
        (selector) =>
          new DOMMatrix(getComputedStyle(document.querySelector(`${selector} .marquee-label`)!).transform).m41 < -3,
        { timeout: 6000 },
        selector,
      );
      expect(await page.$eval(`${selector} .marquee-text`, (element) => getComputedStyle(element).maskImage)).toContain(
        'rgba(0, 0, 0, 0)',
      );
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.menu-item .marquee-label')!).animationName === 'none',
    );
    expect(await page.$eval('.menu-item .marquee-label', (element) => getComputedStyle(element).transform)).toBe(
      'none',
    );
    await page.emulateMediaFeatures([]);
  }, 30000);
});
