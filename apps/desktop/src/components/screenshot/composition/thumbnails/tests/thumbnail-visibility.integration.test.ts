// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../../cli/src/chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('screenshot thumbnail viewport in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-thumbnail-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'thumbnail-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-thumbnail-test', (_req, res) => {
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
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-thumbnail-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it('renders only the visible 500-layer panel plus overscan and reuses ready thumbnails on return', async () => {
    const result = await page.evaluate(async () => {
      Object.defineProperty(window, 'capture', {
        configurable: true,
        value: {
          getPreferences: async () => ({ extras: {}, accessibility: {} }),
          onPreferencesChanged: () => () => {},
        },
      });
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { mountThumbnails } = (await load(
        '/apps/desktop/src/components/screenshot/composition/thumbnails/tests/thumbnail-browser-host.ts',
      )) as typeof import('./thumbnail-browser-host');
      const requests: string[] = [],
        realPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (message && typeof message === 'object' && 'id' in message) requests.push(String(message.id));
        realPost.call(this, message, Array.isArray(options) ? { transfer: options } : options);
      };
      const start = performance.now();
      const { dispose } = mountThumbnails();
      const waitFor = async (check: () => boolean) => {
        for (let i = 0; i < 500; i++) {
          if (check()) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(
          'Thumbnail viewport did not settle: ' +
            JSON.stringify({
              requests,
              loaded: document.querySelectorAll('.layer-thumbnail img.loaded').length,
              errors: [...document.querySelectorAll('.layer-thumbnail svg')].map((item) => item.getAttribute('title')),
              rows: document.querySelectorAll('[data-layer-id]').length,
              list: document.querySelector('.layer-list')?.getBoundingClientRect().toJSON(),
              panel: document.querySelector('.screenshot-composition')?.outerHTML.slice(0, 500),
            }),
        );
      };
      await waitFor(() => document.querySelectorAll('.layer-thumbnail img.loaded').length > 0);
      const firstReadyMs = performance.now() - start;
      const list = document.querySelector<HTMLElement>('.layer-list')!;
      await waitFor(
        () =>
          document.querySelectorAll('.layer-thumbnail[aria-busy="true"]').length +
            document.querySelectorAll('.layer-thumbnail img.loaded').length >=
          500,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      const firstRequests = requests.length,
        firstUrl = document.querySelector<HTMLImageElement>('.layer-thumbnail img.loaded')!.src;
      list.scrollTop = list.scrollHeight / 2;
      await waitFor(() => requests.length > firstRequests);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const middleRequests = requests.length;
      list.scrollTop = 0;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const result = {
        eagerRequests: 500,
        firstRequests,
        middleRequests,
        afterReturn: requests.length,
        firstReadyMs,
        retained: [...document.querySelectorAll<HTMLImageElement>('.layer-thumbnail img.loaded')].some(
          (image) => image.src === firstUrl,
        ),
        rows: document.querySelectorAll('[data-layer-id]').length,
        viewportHeight: list.clientHeight,
      };
      dispose();
      Worker.prototype.postMessage = realPost;
      return result;
    });
    await writeFile('/tmp/beam-thumbnail-viewport.json', JSON.stringify(result));
    console.info('Screenshot thumbnail viewport:', result);
    expect(result.rows).toBeGreaterThanOrEqual(500);
    expect(result.firstRequests).toBeGreaterThan(0);
    expect(result.firstRequests).toBeLessThan(40);
    expect(result.middleRequests).toBeGreaterThan(result.firstRequests);
    expect(result.middleRequests).toBeLessThan(80);
    expect(result.afterReturn).toBe(result.middleRequests);
    expect(result.retained).toBe(true);
  }, 30000);
});
