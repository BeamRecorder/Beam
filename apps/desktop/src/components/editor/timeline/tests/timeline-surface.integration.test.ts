// @vitest-environment node
// Real browser verification is opt-in and uses owned Chromium with no system display.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';
import type { ClipComposition } from '@beam/engine';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('timeline surface in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const root = fileURLToPath(new URL('../../../../../../../', import.meta.url));
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-timeline-'));
    server = await createServer({
      root,
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'timeline-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-timeline-test', (_req, res) => {
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
    await page.setViewport({ width: 1200, height: 600 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-timeline-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it('draws 10000 clips on one bounded canvas, retains semantic controls and repaints far scrolling', async () => {
    const clips = Array.from({ length: 10000 }, (_, index) => ({
      ...colorClip(String(index)),
      trackId: 'track',
      timelineStartMs: index * 1000,
    }));
    const composition: ClipComposition = { schemaVersion: 14, assets: [], clips, keyboardCaptionSessions: [] };
    const result = await page.evaluate(async (composition) => {
      // The page hosts the actual Vue component; only desktop service discovery is injected for this isolated editor view.
      document.body.innerHTML = '<div id="test" style="width:1000px;height:300px"></div>';
      Object.defineProperty(window, 'capture', {
        value: {
          getPreferences: async () => ({ extras: {}, accessibility: {} }),
          onPreferencesChanged: () => () => {},
        },
      });
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const vue = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { createPinia, i18n, Timeline } = vue;
      const state = vue.reactive({
        currentTime: 0,
        duration: 10000,
        isPlaying: false,
        zoomLevel: 10000,
        zoomElements: [],
        selectedZoomId: null,
        selectedClipId: null,
        composition,
      });
      const app = vue.createApp({ render: () => vue.h(Timeline, state) });
      app.use(createPinia());
      app.use(i18n);
      app.mount('#test');
      await vue.nextTick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const scroll = document.querySelector<HTMLDivElement>('.timeline-tracks-container')!,
        canvas = document.querySelector<HTMLCanvasElement>('.timeline-content-surface')!;
      const painted = () =>
        canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, index) => index % 4 === 3 && value > 0);
      const first = {
        canvases: document.querySelectorAll('canvas').length,
        painted: painted(),
        width: canvas.width,
        viewport: scroll.clientWidth,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
      scroll.dispatchEvent(new Event('scroll'));
      await vue.nextTick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const last = {
        painted: painted(),
        left: canvas.style.left,
        scroll: scroll.scrollLeft,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      app.unmount();
      return { first, last };
    }, composition);
    expect(result.first.canvases).toBe(1);
    expect(result.first.painted).toBe(true);
    expect(result.first.width).toBe(result.first.viewport);
    expect(result.first.controls).toBeLessThan(250);
    expect(result.last.controls).toBeLessThan(250);
    expect(result.last.painted).toBe(true);
    expect(result.last.left).toBe(`${result.last.scroll}px`);
  }, 30000);
});
