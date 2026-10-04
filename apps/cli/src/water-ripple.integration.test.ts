// @vitest-environment node
// BEAM_HEADLESS_TEST=1 validates real refraction pixels in displayless Chromium.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import { snapshot } from '../../../packages/runtime/src/rendering/tests/render.test-support';
import { isVisualClip } from '@beam/engine/shared/composition-types';

const controlsEntry = `
import {createApp,h,reactive} from 'vue';
import {createPinia} from 'pinia';
import {createI18n} from 'vue-i18n';
import messages from '/apps/desktop/src/i18n/en/core.json';
import CursorPanel from '/apps/desktop/src/components/editor/properties/cursor/CursorPanel.vue';
import {MACOS_CURSOR_PACK} from '/apps/desktop/src/components/editor/properties/cursor/cursor-packs.ts';
import {createDefaultCursorPresentation} from '/packages/engine/src/capture/cursor-presentation.ts';
import '/apps/desktop/src/style.css';
const defaults=createDefaultCursorPresentation();
const state=reactive({clickEffects:defaults.clickEffects});
window.clickControlsState=state;
document.documentElement.classList.add('dark','editor-window-root');
createApp({setup:()=>()=>h(CursorPanel,{selection:defaults.selection,packs:[MACOS_CURSOR_PACK],
 cursorSize:45,cursorColor:'#000000',enableShadow:true,shadowBlur:6,shadowColor:'#000000',shadowDirection:'bottom',
 motion:defaults.motion,autoHide:defaults.autoHide,clickEffects:state.clickEffects,
 'onUpdate:clickEffects':value=>state.clickEffects=value})})
.use(createPinia()).use(createI18n({legacy:false,locale:'en',messages:{en:messages}})).mount('#inspector');
`;

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('water ripple completed pixels', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const errors: string[] = [];
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(tmpdir(), 'beam-water-ripple-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: ['vue', 'vue-i18n', '@lucide/vue', '@vueuse/core', 'pinia'] },
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'water-ripple-test',
          resolveId(id) {
            if (id === '/cursor-controls-entry.ts') return '\0cursor-controls-entry';
          },
          load(id) {
            if (id === '\0cursor-controls-entry') return controlsEntry;
          },
          configureServer(server) {
            server.middlewares.use('/html/cursor-controls.html', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                '<!doctype html><title>Cursor click controls</title><body style="margin:0"><div id="inspector" style="width:300px;padding:16px"></div><script>window.capture={};</script><script type="module" src="/cursor-controls-entry.ts"></script>',
              );
            });
            server.middlewares.use('/water-test', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><title>Water ripple verification</title>');
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
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${address.port}/water-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it('refracts live screen pixels, leaves distant pixels intact and repeats frames after seeking', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { WaterRippleGpu } = (await load(
        '/packages/runtime/src/cursor/water-ripple-gpu.ts',
      )) as typeof import('@beam/runtime/cursor/water-ripple-gpu');
      const source = new OffscreenCanvas(400, 240),
        target = new OffscreenCanvas(400, 240);
      const ctx = source.getContext('2d')!,
        output = target.getContext('2d')!;
      const pixels = ctx.createImageData(400, 240);
      for (let y = 0; y < 240; y++)
        for (let x = 0; x < 400; x++) {
          const i = (y * 400 + x) * 4;
          pixels.data.set([x % 256, y, (Math.floor(x / 10) + Math.floor(y / 10)) % 2 ? 220 : 30, 255], i);
        }
      ctx.putImageData(pixels, 0, 0);
      const gpu = new WaterRippleGpu();
      const render = (ageSeconds: number) => {
        output.clearRect(0, 0, 400, 240);
        output.drawImage(
          gpu.render({ source, width: 400, height: 240 }, [
            { x: 0.3, y: 0.6, ageSeconds, spread: 30, intensity: 65, durationSeconds: 0.9, width: 4 },
          ]),
          0,
          0,
        );
        return output.getImageData(0, 0, 400, 240).data;
      };
      const zero = render(0),
        first = render(0.3),
        later = render(0.6),
        repeat = render(0.3);
      const sampleAt = (data: Uint8ClampedArray, x: number, y: number) =>
        Array.from(data.slice((y * 400 + x) * 4, (y * 400 + x) * 4 + 4));
      const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.filter((value, i) => value !== b[i]).length;
      // Updating the same canvas identity must upload its new pixels.
      ctx.fillStyle = '#112233';
      ctx.fillRect(0, 0, 400, 240);
      const updated = render(0.3);
      const result = {
        zeroEqual: changed(zero, pixels.data) === 0,
        changed: changed(first, zero),
        movement: changed(first, later),
        repeat: changed(first, repeat) === 0,
        distant: sampleAt(first, 399, 0),
        originalDistant: sampleAt(zero, 399, 0),
        updated: sampleAt(updated, 399, 0),
        opaque: Array.from(first)
          .filter((_, i) => i % 4 === 3)
          .every((v) => v === 255),
      };
      gpu.dispose();
      return result;
    });
    expect(result.zeroEqual).toBe(true);
    expect(result.changed).toBeGreaterThan(500);
    expect(result.movement).toBeGreaterThan(500);
    expect(result.repeat).toBe(true);
    expect(result.distant).toEqual(result.originalDistant);
    expect(result.updated).toEqual([17, 34, 51, 255]);
    expect(result.opaque).toBe(true);
  }, 20000);

  it('scales intensity down to zero, bounds a small wave and varies duration and softness', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { WaterRippleGpu } = (await load(
        '/packages/runtime/src/cursor/water-ripple-gpu.ts',
      )) as typeof import('@beam/runtime/cursor/water-ripple-gpu');
      const source = new OffscreenCanvas(400, 240),
        ctx = source.getContext('2d')!;
      for (let x = 0; x < 400; x += 4) {
        ctx.fillStyle = x % 8 ? '#eee' : '#222';
        ctx.fillRect(x, 0, 4, 240);
      }
      const output = new OffscreenCanvas(400, 240),
        target = output.getContext('2d')!;
      const gpu = new WaterRippleGpu();
      const wave = { x: 0.5, y: 0.5, ageSeconds: 0.3, spread: 30, intensity: 65, durationSeconds: 0.9, width: 4 };
      const render = (patch: Partial<typeof wave>) => {
        target.clearRect(0, 0, 400, 240);
        target.drawImage(gpu.render({ source, width: 400, height: 240 }, [{ ...wave, ...patch }]), 0, 0);
        return target.getImageData(0, 0, 400, 240).data;
      };
      const original = ctx.getImageData(0, 0, 400, 240).data;
      const zero = render({ intensity: 0 }),
        tiny = render({ intensity: 1 }),
        strong = render({ intensity: 100 });
      const error = (data: Uint8ClampedArray) => data.reduce((sum, v, i) => sum + Math.abs(v - zero[i]!), 0);
      const small = render({ spread: 1, width: 1 }),
        soft = render({ width: 12 }),
        slow = render({ durationSeconds: 2.4 });
      const far = (data: Uint8ClampedArray) => Array.from(data.slice((120 * 400 + 300) * 4, (120 * 400 + 300) * 4 + 4));
      const result = {
        zero: zero.every((v, i) => v === original[i]),
        tiny: error(tiny),
        strong: error(strong),
        smallFar: far(small),
        originalFar: far(zero),
        softness: soft.some((v, i) => v !== strong[i]),
        duration: slow.some((v, i) => v !== strong[i]),
      };
      gpu.dispose();
      return result;
    });
    expect(result.zero).toBe(true);
    expect(result.tiny).toBeLessThan(result.strong);
    expect(result.smallFar).toEqual(result.originalFar);
    expect(result.softness).toBe(true);
    expect(result.duration).toBe(true);
  }, 20000);

  it('preserves transparent source pixels and combines overlapping click waves', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { WaterRippleGpu } = (await load(
        '/packages/runtime/src/cursor/water-ripple-gpu.ts',
      )) as typeof import('@beam/runtime/cursor/water-ripple-gpu');
      const source = new OffscreenCanvas(300, 180),
        target = new OffscreenCanvas(300, 180);
      const ctx = source.getContext('2d')!,
        output = target.getContext('2d')!;
      for (let x = 0; x < 300; x += 8) {
        ctx.fillStyle = x % 16 ? '#335577' : '#88ccdd';
        ctx.fillRect(x, 30, 8, 120);
      }
      const gpu = new WaterRippleGpu();
      const wave = { x: 0.45, y: 0.5, ageSeconds: 0.3, spread: 40, intensity: 65, durationSeconds: 0.9, width: 4 };
      const render = (samples: (typeof wave)[]) => {
        output.clearRect(0, 0, 300, 180);
        output.drawImage(gpu.render({ source, width: 300, height: 180 }, samples), 0, 0);
        return output.getImageData(0, 0, 300, 180).data;
      };
      const single = render([wave]),
        double = render([wave, { ...wave, x: 0.55, ageSeconds: 0.2 }]);
      const result = {
        overlap: single.some((value, i) => value !== double[i]),
        clearTop: Array.from(double.slice(0, 300 * 4)).every((v) => v === 0),
        centerAlpha: double[(90 * 300 + 150) * 4 + 3],
      };
      gpu.dispose();
      return result;
    });
    expect(result).toEqual({ overlap: true, clearTop: true, centerAlpha: 255 });
  });

  it.each(['none', 'safari', 'animated'] as const)(
    'matches preview/export with %s framing, crop/mirror/rotation and session timing',
    async (frame) => {
      const value = snapshot();
      const clip = value.composition.clips[0]!;
      if (!isVisualClip(clip)) throw new Error('No visual fixture.');
      value.canvas.width = 400;
      value.canvas.height = 240;
      value.duration = 4;
      value.composition.assets[0]!.sessionStartMs = 3000;
      clip.timelineDurationMs = 4000;
      clip.sourceDurationMs = 8000;
      clip.sourceInMs = 1000;
      clip.playbackRate = 2;
      clip.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      clip.isMirrored = true;
      clip.rotation = 8;
      clip.transform = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
      clip.appearance = { ...clip.appearance, frame, cornerRadius: 24 };
      value.cursor.available = true;
      value.cursor.events = [
        { event: 'button', sessionNs: 4_200_000_000, button: 1, pressed: true, normalizedX: 0.3, normalizedY: 0.6 },
      ];
      value.cursorSettings.clickEffects.left = {
        ...value.cursorSettings.clickEffects.left,
        rippleStyle: 'water',
        rippleEnabled: true,
      };
      value.zoomMotionBlur = { enabled: false, intensity: 0 };
      const result = await page.evaluate(
        async ({ value, frame }) => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
            '/packages/runtime/src/rendering/render.ts',
          )) as typeof import('@beam/runtime/rendering/render');
          const source = new OffscreenCanvas(400, 240),
            sourceCtx = source.getContext('2d')!;
          for (let x = 0; x < 400; x += 8) {
            sourceCtx.fillStyle = x % 16 ? '#447799' : '#eeaacc';
            sourceCtx.fillRect(x, 0, 8, 240);
          }
          const target = (preview: boolean) => {
            const canvas = preview ? document.createElement('canvas') : new OffscreenCanvas(400, 240);
            canvas.width = 400;
            canvas.height = 240;
            const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
            context.imageSmoothingQuality = 'high';
            return context;
          };
          const bitmap = await createImageBitmap(source);
          const media = { source: bitmap, width: 400, height: 240 },
            frames: Uint8ClampedArray<ArrayBuffer>[] = [];
          let equal = true;
          const diagnostics: unknown[] = [];
          for (const time of [0.3, 0.45, 1.2, 0.3]) {
            // Fresh targets avoid Chromium's readback-triggered canvas backend migration.
            // Both production hosts use high-quality media resampling.
            const a = target(true),
              b = target(false);
            renderCompositionFrame(a, media, value, time);
            renderCompositionFrame(b, media, value, time);
            const first = a.getImageData(0, 0, 400, 240).data,
              second = b.getImageData(0, 0, 400, 240).data;
            equal = equal && first.every((v, i) => v === second[i]);
            const mismatch = first.findIndex((v, i) => v !== second[i]);
            if (mismatch >= 0)
              diagnostics.push({
                time,
                transforms: [a.getTransform().toString(), b.getTransform().toString()],
                count: first.filter((v, i) => v !== second[i]).length,
                max: first.reduce((maximum, v, i) => Math.max(maximum, Math.abs(v - second[i]!)), 0),
                pixel: Math.floor(mismatch / 4),
                values: Array.from(first.slice(mismatch - (mismatch % 4), mismatch - (mismatch % 4) + 4)),
                other: Array.from(second.slice(mismatch - (mismatch % 4), mismatch - (mismatch % 4) + 4)),
              });
            frames.push(first);
          }
          const repeating = frames[0]!.every((v, i) => v === frames[3]![i]);
          const moving = frames[0]!.some((v, i) => v !== frames[1]![i]);
          // Expired waves restore the unrefracted source at the same composition time.
          value.cursorSettings.clickEffects.left.rippleEnabled = false;
          const a = target(true);
          renderCompositionFrame(a, media, value, 1.2);
          const clean = a.getImageData(0, 0, 400, 240).data;
          const expiredEqual = frames[2]!.every((v, i) => v === clean[i]);
          if (frame === 'none') {
            const artifact = document.createElement('canvas');
            artifact.width = 800;
            artifact.height = 240;
            const ctx = artifact.getContext('2d')!;
            ctx.putImageData(new ImageData(frames[0]!, 400, 240), 0, 0);
            ctx.putImageData(new ImageData(clean, 400, 240), 400, 0);
            document.body.appendChild(artifact);
          }
          disposeCompositionRenderer();
          bitmap.close();
          return { equal, repeating, moving, expiredEqual, diagnostics };
        },
        { value, frame },
      );
      expect(result, JSON.stringify(result.diagnostics)).toMatchObject({
        equal: true,
        repeating: true,
        moving: true,
        expiredEqual: true,
      });
      expect(errors).toEqual([]);
      if (frame === 'none' && process.env.BEAM_FRAME_ARTIFACT_DIR)
        await page.screenshot({ path: resolve(process.env.BEAM_FRAME_ARTIFACT_DIR, 'water-ripple.png') });
    },
    20000,
  );
  it('shows real cursor/effect thumbnails and lets the keyboard select Water Drop', async () => {
    const url = page.url().replace('/water-test', '/html/cursor-controls.html');
    await page.setViewport({ width: 800, height: 1100 });
    await page.goto(url);
    await page.waitForSelector('[data-cursor-section="left"] .accordion-trigger', { timeout: 15000 });
    await page.click('[data-cursor-section="left"] .accordion-trigger');
    expect(await page.$('[aria-label="Ripple style"]')).toBeNull();
    await page.click('[data-cursor-section="left"] [aria-label="Click Ripple Effect"]');
    await page.waitForSelector('[aria-label="Ripple style"]');
    await page.click('[aria-label="Ripple style"]');
    await page.waitForSelector('[role="option"]');
    expect(
      await page.$$eval('[role="option"]', (options) => options.map((option) => option.textContent!.trim())),
    ).toEqual(['Single Ring', 'Double Wave', 'Burst', 'Water drop']);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>('[role="option"] img')).every(
        (img) => img.complete && img.naturalWidth === 240 && img.naturalHeight === 150,
      ),
    );
    if (process.env.BEAM_FRAME_ARTIFACT_DIR)
      await page.screenshot({ path: resolve(process.env.BEAM_FRAME_ARTIFACT_DIR, 'click-controls.png') });
    await page.focus('[role="option"][data-option-index="0"]');
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-option-index') === '3');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const state = (
        window as unknown as {
          clickControlsState: { clickEffects: { left: { rippleStyle: string }; right: { rippleStyle: string } } };
        }
      ).clickControlsState;
      return state.clickEffects.left.rippleStyle === 'water' && state.clickEffects.right.rippleStyle === 'single';
    });
    expect(errors).toEqual([]);
  }, 30000);
});
