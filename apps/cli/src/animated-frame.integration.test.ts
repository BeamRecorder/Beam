// @vitest-environment node
// BEAM_HEADLESS_TEST=1 opts into completed WebGL/Canvas pixels in displayless Chromium.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import { snapshot as renderSnapshot } from '../../../packages/runtime/src/rendering/tests/render.test-support';
import { isVisualClip } from '@beam/engine/shared/composition-types';
import { ANIMATED_FRAME_PRESETS } from '@beam/engine/shared/animated-frame-schema';

const controlsEntry = `
import {createApp, h, reactive} from 'vue';
import {createI18n} from 'vue-i18n';
import messages from '/apps/desktop/src/i18n/en/core.json';
import BorderAndFrameControls from '/apps/desktop/src/components/editor/properties/clip/BorderAndFrameControls.vue';
import '/apps/desktop/src/style.css';
const state = reactive({frame:'safari',frameColor:'#c0c0c0'});
window.frameControlsState = state;
document.documentElement.classList.add('dark', 'editor-window-root');
createApp({setup:()=>()=>h(BorderAndFrameControls,{...state,onUpdate:patch=>Object.assign(state,patch)})})
.use(createI18n({legacy:false,locale:'en',messages:{en:messages}})).mount('#inspector');
`;

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('animated frame completed pixels', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const browserErrors: string[] = [];
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(tmpdir(), 'beam-animated-frame-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      server: { host: '127.0.0.1', port: 0 },
      logLevel: 'silent',
      optimizeDeps: { include: ['vue', 'vue-i18n', '@lucide/vue', '@vueuse/core'] },
      plugins: [
        {
          name: 'animated-frame-test',
          resolveId(id) {
            if (id === '/frame-controls-entry.ts') return '\0frame-controls-entry';
          },
          load(id) {
            if (id === '\0frame-controls-entry') return controlsEntry;
          },
          configureServer(server) {
            server.middlewares.use('/html/frame-controls.html', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                '<!doctype html><title>Frame controls</title><body style="margin:0;background:#151517"><div id="inspector" style="width:280px;padding:16px"></div><script type="module" src="/frame-controls-entry.ts"></script>',
              );
            });
            server.middlewares.use('/frame-test', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><title>Frame verification</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test server port.');
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      args: chromiumSettings().args,
      userDataDir: resolve(temporary, 'profile'),
      pipe: true,
    });
    page = await browser.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', (error) => browserErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${address.port}/frame-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it.each(ANIMATED_FRAME_PRESETS)(
    'renders %s as a transparent overlay with deterministic moving pixels',
    async (preset) => {
      const result = await page.evaluate(async (preset) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { AnimatedFrameRenderer } = (await load(
          '/packages/runtime/src/composition/appearance/animated-frame-renderer.ts',
        )) as typeof import('@beam/runtime/composition/appearance/animated-frame-renderer');
        const renderer = new AnimatedFrameRenderer();
        const render = (timeMs: number, speed = 1) => {
          const { canvas, padding } = renderer.render({
            rect: { x: 0, y: 0, width: 200, height: 120 },
            radius: 24,
            settings: { preset, width: 3, speed },
            appearanceScale: 1,
            pixelScale: 1,
            timeMs,
          });
          const target = new OffscreenCanvas(canvas.width, canvas.height);
          const ctx = target.getContext('2d')!;
          ctx.drawImage(canvas, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            padding,
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        };
        const first = render(700),
          later = render(2100),
          reverse = render(700),
          frozenA = render(700, 0),
          frozenB = render(2100, 0);
        const alpha = (x: number, y: number) => first.data[(Math.floor(y) * first.width + Math.floor(x)) * 4 + 3]!;
        const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, i) => value === b[i]);
        const value = {
          center: alpha(first.width / 2, first.height / 2),
          outsideEdge: alpha(first.width / 2, first.padding - 2),
          farOutside: alpha(first.width / 2, 0),
          roundedInside: alpha(first.padding + 20, first.padding + 20),
          different: !same(first.data, later.data),
          repeat: same(first.data, reverse.data),
          frozen: same(frozenA.data, frozenB.data),
          nonempty: first.data.some((value, i) => i % 4 === 3 && value > 100),
        };
        renderer.dispose();
        return value;
      }, preset);
      expect(result).toMatchObject({
        center: 0,
        farOutside: 0,
        roundedInside: 0,
        different: true,
        repeat: true,
        frozen: true,
        nonempty: true,
      });
      expect(result.outsideEdge).toBeGreaterThan(80);
    },
  );

  it.each(['circle', 'squircle'] as const)(
    'matches the real %s media mask without coloring the interior',
    async (mask) => {
      const result = await page.evaluate(async (mask) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { drawDecoratedMedia } = (await load(
          '/packages/runtime/src/composition/appearance/render-decorated-media.ts',
        )) as typeof import('@beam/runtime/composition/appearance/render-decorated-media');
        const { createDefaultClipAppearance } = (await load(
          '/packages/engine/src/shared/composition-defaults.ts',
        )) as typeof import('@beam/engine/shared/composition-defaults');
        const { disposeAnimatedFrameRenderer } = (await load(
          '/packages/runtime/src/composition/appearance/animated-frame.ts',
        )) as typeof import('@beam/runtime/composition/appearance/animated-frame');
        const target = new OffscreenCanvas(400, 400),
          source = new OffscreenCanvas(100, 100);
        const pixels = source.getContext('2d')!;
        pixels.fillStyle = '#336699';
        pixels.fillRect(0, 0, 100, 100);
        const ctx = target.getContext('2d')!;
        drawDecoratedMedia(ctx, {
          source,
          rect: { x: 100, y: 100, width: 200, height: 200 },
          mask,
          title: '',
          timeMs: 500,
          appearance: {
            ...createDefaultClipAppearance('webcam'),
            frame: 'animated',
            shadowSize: 'none',
            cornerRadius: 32,
          },
        });
        const sample = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        const value = { center: sample(200, 200), edge: sample(200, 98), corner: sample(103, 103) };
        disposeAnimatedFrameRenderer();
        return value;
      }, mask);
      expect(result.center).toEqual([51, 102, 153, 255]);
      expect(result.edge[3]).toBeGreaterThan(80);
      expect(result.corner[3]).toBeLessThan(100);
    },
  );

  it.each(['screen', 'webcam', 'video', 'image'] as const)(
    'keeps completed %s preview/export frames equal after seeking',
    async (kind) => {
      const value = renderSnapshot();
      const base = value.composition.clips[0]!;
      if (!isVisualClip(base)) throw new Error('Visual fixture unavailable.');
      const clip = {
        ...base,
        kind,
        timelineDurationMs: 10000,
        sourceDurationMs: 10000,
        transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
        cameraFramingPreset: 'circle' as const,
        appearance: {
          ...base.appearance,
          frame: 'animated' as const,
          cornerRadius: 24,
          animatedFrame: { preset: 'electric' as const, width: 3, speed: 1 },
        },
      };
      value.composition.clips = [clip];
      value.canvas.width = 300;
      value.canvas.height = 180;
      value.cursorSettings.enabled = false;
      const result = await page.evaluate(
        async ({ value, kind }) => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
            '/packages/runtime/src/rendering/render.ts',
          )) as typeof import('@beam/runtime/rendering/render');
          const source = new OffscreenCanvas(200, 100),
            ctx = source.getContext('2d')!;
          ctx.fillStyle = '#336699';
          ctx.fillRect(0, 0, 200, 100);
          const media = { source, width: 200, height: 100 },
            visuals = new Map([[value.composition.clips[0]!.id, media]]);
          const preview = document.createElement('canvas');
          preview.width = 300;
          preview.height = 180;
          const output = new OffscreenCanvas(300, 180);
          const a = preview.getContext('2d')!,
            b = output.getContext('2d')!;
          const frames: Uint8ClampedArray[] = [];
          let equal = true;
          for (const time of [0.7, 2.1, 0.7]) {
            renderCompositionFrame(a, kind === 'screen' ? media : null, value, time, null, undefined, visuals);
            renderCompositionFrame(b, kind === 'screen' ? media : null, value, time, null, undefined, visuals);
            const first = a.getImageData(0, 0, 300, 180).data,
              second = b.getImageData(0, 0, 300, 180).data;
            equal = equal && first.every((value, i) => value === second[i]);
            frames.push(first);
          }
          const repeat = frames[0]!.every((value, i) => value === frames[2]![i]);
          const moves = frames[0]!.some((value, i) => value !== frames[1]![i]);
          disposeCompositionRenderer();
          return { equal, repeat, moves };
        },
        { value, kind },
      );
      expect(result).toEqual({ equal: true, repeat: true, moves: true });
    },
    20000,
  );

  it('selects frame styles and five illustrated presets with keyboard focus and loaded thumbnails', async () => {
    const url = page.url().replace('/frame-test', '/html/frame-controls.html');
    await page.goto(url);
    await page.waitForSelector('[data-clip-section="frame"] .accordion-trigger', { timeout: 15000 });
    await page.click('[data-clip-section="frame"] .accordion-trigger');
    await page.click('[aria-label="Frame style"]');
    await page.waitForSelector('[role="option"]');
    expect(
      await page.$$eval('[role="option"]', (options) => options.map((option) => option.textContent!.trim())),
    ).toEqual(['Safari', 'Windows 95', 'Animated border', 'iPhone 16 Pro Max', 'Pixel 9 Pro']);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>('[role="option"] img')).every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    await page.focus('[role="option"][data-option-index="0"]');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-option-index') === '1', {
      timeout: 5000,
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-option-index') === '2', {
      timeout: 5000,
    });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[aria-label="Preset"]', { timeout: 5000 });
    expect(await page.$eval('[aria-label="Frame style"]', (el) => el.textContent!.trim())).toBe('Animated border');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Frame style');
    await page.waitForSelector('[role="listbox"]', { hidden: true });
    await page.click('[aria-label="Preset"]');
    await page.waitForFunction(() => document.querySelector('[role="option"]')?.textContent?.trim() === 'Purple Haze');
    expect(
      await page.$$eval('[role="option"]', (options) => options.map((option) => option.textContent!.trim())),
    ).toEqual(['Purple Haze', 'Neon Duo', 'Aurora', 'Ember', 'Electric']);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>('[role="option"] img')).every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    const bounds = await page.$eval('[role="listbox"]', (el) => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: innerHeight };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
    await page.screenshot({ path: resolve(process.env.BEAM_FRAME_ARTIFACT_DIR ?? temporary, 'frame-controls.png') });
    await page.focus('[role="option"][data-option-index="0"]');
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-option-index') === '4');
    await page.keyboard.press('Enter');
    expect(await page.$eval('[aria-label="Preset"]', (el) => el.textContent!.trim())).toBe('Electric');
    expect(browserErrors).toEqual([]);
    await page.goto(url.replace('/html/frame-controls.html', '/frame-test'));
  }, 30000);
});
