// @vitest-environment node
// Real browser verification is opt-in and uses owned Chromium with no system display.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page, type Protocol } from 'puppeteer-core';
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
    // Provide only preferences before importing the actual desktop timeline module graph.
    await page.evaluate(() =>
      Object.defineProperty(window, 'capture', {
        value: {
          getPreferences: async () => ({ extras: {}, accessibility: {} }),
          onPreferencesChanged: () => () => {},
        },
      }),
    );
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
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, scroll, canvas, settle, painted } = await host.mountTimeline(composition, 10000, 10000);
      const first = {
        canvases: document.querySelectorAll('canvas').length,
        painted: painted(),
        width: canvas.width,
        viewport: scroll.clientWidth,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
      scroll.dispatchEvent(new Event('scroll'));
      await settle();
      const last = {
        painted: painted(),
        left: canvas.getBoundingClientRect().left,
        viewportLeft: scroll.getBoundingClientRect().left,
        scroll: scroll.scrollLeft,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      dispose();
      return { first, last };
    }, composition);
    expect(result.first.canvases).toBe(1);
    expect(result.first.painted).toBe(true);
    expect(result.first.width).toBe(result.first.viewport);
    expect(result.first.controls).toBeLessThan(250);
    expect(result.last.controls).toBeLessThan(250);
    expect(result.last.painted).toBe(true);
    expect(result.last.left).toBe(result.last.viewportLeft);
  }, 30000);
  it('keeps canvas coverage during fast diagonal scrolling and paints newly mounted lanes in the first frame', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: `lane-${Math.floor(index / 50)}`,
        order: Math.floor(index / 50),
        timelineStartMs: (index % 50) * 1000,
      })),
    };
    const samples = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, scroll, canvas, frame, painted } = await host.mountTimeline(composition, 50, 2000);
      const samples = [];
      for (const [x, y] of [
        [4000, 3000],
        [1000, 32],
        [12000, 5500],
        [8000, 1000],
        [0, 0],
      ]) {
        scroll.scrollLeft = x!;
        scroll.scrollTop = y!;
        scroll.dispatchEvent(new Event('scroll'));
        const bounds = canvas.getBoundingClientRect(),
          viewport = scroll.getBoundingClientRect();
        const covered =
          bounds.left <= viewport.left &&
          bounds.top <= viewport.top &&
          bounds.right >= viewport.left + scroll.clientWidth &&
          bounds.bottom >= viewport.top + scroll.clientHeight;
        await frame();
        samples.push({
          covered,
          painted: painted(),
          controls: document.querySelectorAll('[data-timeline-clip-id]').length,
        });
      }
      dispose();
      return samples;
    }, composition);
    expect(samples.every((sample) => sample.covered)).toBe(true);
    expect(samples.every((sample) => sample.painted)).toBe(true);
    expect(samples.every((sample) => sample.controls < 250)).toBe(true);
  }, 30000);

  it('moves the playhead without repainting unchanged artwork on a 10000-clip document', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: 'track',
        timelineStartMs: index * 1000,
      })),
    };
    const result = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, state, canvas, scroll, frame, settle, nextTick } = await host.mountTimeline(
        composition,
        10000,
        10000,
      );
      const ctx = canvas.getContext('2d')!,
        clear = ctx.clearRect.bind(ctx);
      let repaints = 0;
      ctx.clearRect = (x, y, width, height) => {
        if (width === scroll.clientWidth && height === scroll.clientHeight) repaints++;
        clear(x, y, width, height);
      };
      state.isPlaying = true;
      await settle();
      repaints = 0;
      const samples: number[] = [];
      for (let i = 1; i <= 60; i++) {
        await frame();
        const start = performance.now();
        state.currentTime = i / 60;
        await nextTick();
        samples.push(performance.now() - start);
      }
      await settle();
      samples.sort((a, b) => a - b);
      const result = { repaints, medianMs: samples[30]!, p95Ms: samples[57]!, scroll: scroll.scrollLeft };
      dispose();
      return result;
    }, composition);
    console.info('Timeline 10000-clip playback updates:', result);
    expect(result.scroll).toBe(0);
    expect(result.repaints).toBe(0);
  }, 30000);

  it('composites the playhead and viewport bitmap without allocating layers for all 10000 clips', async () => {
    const cdp = await page.createCDPSession();
    let layers: Protocol.LayerTree.Layer[] = [];
    cdp.on('LayerTree.layerTreeDidChange', (event) => {
      layers = event.layers ?? [];
    });
    await cdp.send('LayerTree.enable');
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: 'track',
        timelineStartMs: index * 1000,
      })),
    };
    try {
      const geometry = await page.evaluate(async (composition) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        const { state, scroll, settle } = await host.mountTimeline(composition, 10000, 10000);
        state.isPlaying = true;
        state.currentTime = 0.5;
        await settle();
        const playhead = document.querySelector<HTMLElement>('.timeline-playhead')!;
        return {
          width: scroll.clientWidth,
          height: scroll.clientHeight,
          transform: playhead.style.transform,
          left: playhead.style.left,
        };
      }, composition);
      expect(geometry.transform).toMatch(/^translate3d\(/);
      expect(geometry.left).toBe('');
      const { root } = await cdp.send('DOM.getDocument');
      for (const selector of ['.timeline-content-surface', '.timeline-playhead']) {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        const { node } = await cdp.send('DOM.describeNode', { nodeId });
        const layer = layers.find((layer) => layer.backendNodeId === node.backendNodeId);
        expect(layer, selector).toBeDefined();
        const reasons = await cdp.send('LayerTree.compositingReasons', { layerId: layer!.layerId });
        expect(reasons.compositingReasonIds).toContain('WillChangeTransform');
        if (selector === '.timeline-content-surface') {
          expect(layer!.width).toBeLessThanOrEqual(geometry.width);
          expect(layer!.height).toBeLessThanOrEqual(geometry.height);
        }
      }
      console.info('Timeline 10000-clip composited layers:', layers.length);
      expect(layers.length).toBeLessThan(250);
    } finally {
      await page.evaluate(async () => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        host.unmountTimeline();
      });
      await cdp.detach();
    }
  }, 30000);
});
