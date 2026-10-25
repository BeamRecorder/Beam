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
});
