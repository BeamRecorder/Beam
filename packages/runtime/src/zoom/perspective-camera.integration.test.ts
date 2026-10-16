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

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('complete 3D camera planes in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-camera-plane-test-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../', import.meta.url)),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'camera-plane-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-camera-plane-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Beam glass test</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...env } = process.env;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      env: { ...env, TMPDIR: temp },
      userDataDir: resolve(temp, 'profile'),
      args: chromiumSettings().args,
    });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/beam-camera-plane-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  it.each([3, 5])(
    'matches a linear CPU reference for %s moving poses, transparent pixels and soft shadow halos',
    async (count) => {
      const result = await page.evaluate(async (count) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { WebGlPerspectiveProjector } = (await load(
          '/packages/runtime/src/zoom/webgl-perspective-projector.ts',
        )) as typeof import('./webgl-perspective-projector');
        const { cameraPlaneGeometry } = (await load(
          '/packages/engine/src/zoom/camera-plane.ts',
        )) as typeof import('@beam/engine/zoom/camera-plane');
        const { drawDecoratedMedia } = (await load(
          '/packages/runtime/src/composition/appearance/render-decorated-media.ts',
        )) as typeof import('../composition/appearance/render-decorated-media');
        const { createDefaultClipAppearance } = (await load(
          '/packages/engine/src/shared/composition-defaults.ts',
        )) as typeof import('@beam/engine/shared/composition-defaults');
        const { orbitCameraPose } = (await load(
          '/packages/engine/src/zoom/orbit-camera.ts',
        )) as typeof import('@beam/engine/zoom/orbit-camera');
        const { ORBIT_PRESETS } = (await load(
          '/packages/engine/src/zoom/orbit-settings.ts',
        )) as typeof import('@beam/engine/zoom/orbit-settings');
        const bounds = { x: 0, y: 0, width: 400, height: 240 },
          sourceBounds = { x: -120, y: -120, width: 640, height: 480 };
        const source = new OffscreenCanvas(800, 480),
          paint = source.getContext('2d')!;
        const gradient = paint.createLinearGradient(0, 0, 800, 480);
        gradient.addColorStop(0, '#f44c8a');
        gradient.addColorStop(1, '#27a4de');
        paint.fillStyle = gradient;
        paint.globalAlpha = 0.7;
        paint.fillRect(0, 0, 800, 480);
        paint.globalAlpha = 1;
        paint.clearRect(360, 100, 120, 60);
        paint.fillStyle = '#ffffff';
        paint.font = '32px monospace';
        paint.fillText('0123456789', 220, 240);
        const appearance = {
          ...createDefaultClipAppearance('screen'),
          frame: 'none' as const,
          shadowSize: 'custom' as const,
          shadowBlur: 24,
          shadowColor: '#300545',
          shadowDirection: 'bottom' as const,
          cornerRadius: 18,
        };
        const draw = (ctx: OffscreenCanvasRenderingContext2D) => {
          const matrix = ctx.getTransform();
          drawDecoratedMedia(ctx, {
            source,
            rect: { x: 40, y: 25, width: 320, height: 190 },
            appearance,
            title: 'Screen',
            shadowPixelRatio: Math.hypot(matrix.a, matrix.b),
          });
        };
        const samples = Array.from({ length: count }, (_, i) => {
          const scale = 1.25 + i * 0.006;
          return {
            camera: { scale, focusX: 0.49 + i * 0.003, focusY: 0.5 - i * 0.001 },
            transform: {
              tiltX: 0,
              tiltY: 0,
              orbit: orbitCameraPose({
                timeMs: 5000 + i * 3,
                weight: 1,
                intensity: 1,
                scale,
                settings: ORBIT_PRESETS[2]!.settings,
                pointAt: () => ({ cx: 0.3 + i * 0.003, cy: 0.65 }),
              }),
            },
            weight: (i + 1) / ((count * (count + 1)) / 2),
          };
        });
        // One frozen scene plane isolates exposure math from per-pose rasterization phases.
        const plane = new OffscreenCanvas(1280, 960),
          planeContext = plane.getContext('2d')!;
        planeContext.setTransform(2, 0, 0, 2, 240, 240);
        draw(planeContext);
        const projector = new WebGlPerspectiveProjector(),
          accumulated = new Float64Array(400 * 240 * 4);
        const projected = samples.map((sample) => ({
          positions: cameraPlaneGeometry(bounds.width, bounds.height, sample.transform, sample.camera, sourceBounds)
            .positions,
          weight: sample.weight,
        }));
        const size = { width: plane.width, height: plane.height };
        for (const sample of projected) {
          const canvas = new OffscreenCanvas(400, 240),
            ctx = canvas.getContext('2d')!;
          ctx.drawImage(projector.renderGeometry(plane, 400, 240, sample.positions, size), 0, 0);
          const pixels = ctx.getImageData(0, 0, 400, 240).data;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3]! / 255;
            for (let c = 0; c < 3; c++) accumulated[i + c] += pixels[i + c]! * alpha * sample.weight;
            accumulated[i + 3] += pixels[i + 3]! * sample.weight;
          }
        }
        const output = new OffscreenCanvas(400, 240),
          ctx = output.getContext('2d')!;
        ctx.drawImage(projector.renderSamples(plane, 400, 240, projected, size), 0, 0);
        const pixels = ctx.getImageData(0, 0, 400, 240).data;
        let total = 0,
          maximum = 0;
        for (let i = 0; i < pixels.length; i += 4)
          for (let c = 0; c < 4; c++) {
            const actual = c === 3 ? pixels[i + c]! : (pixels[i + c]! * pixels[i + 3]!) / 255;
            const delta = Math.abs(actual - accumulated[i + c]!);
            total += delta;
            maximum = Math.max(maximum, delta);
          }
        projector.dispose();
        plane.width = plane.height = 0;
        return { mean: total / pixels.length, maximum };
      }, count);
      expect(result.mean).toBeLessThan(1.5);
      expect(result.maximum).toBeLessThanOrEqual(4);
    },
  );

  it.each([false, true])(
    'keeps soft shadow opacity with one, three and five poses / camera-dependent webcam %s',
    async (webcam) => {
      const result = await page.evaluate(async (webcam) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
          '/packages/runtime/src/rendering/render.ts',
        )) as typeof import('../rendering/render');
        const { createRenderDocument } = (await load(
          '/packages/engine/src/document/render-document.ts',
        )) as typeof import('@beam/engine/document/render-document');
        const { createDefaultClipAppearance } = (await load(
          '/packages/engine/src/shared/composition-defaults.ts',
        )) as typeof import('@beam/engine/shared/composition-defaults');
        const { createCameraMotionBlurPlan } = (await load(
          '/packages/engine/src/zoom/zoom-motion-blur.ts',
        )) as typeof import('@beam/engine/zoom/zoom-motion-blur');
        const snapshot = createRenderDocument(undefined, 400, 240, 60);
        snapshot.duration = 10;
        snapshot.canvas.showBackground = true;
        snapshot.canvas.watermark!.enabled = false;
        snapshot.background = { kind: 'color', color: '#ffffff' };
        snapshot.composition.assets = [
          {
            id: 'screen',
            kind: 'video',
            name: 'Screen',
            fileName: 'video.mp4',
            src: 'source',
            origin: 'project',
            durationMs: 10000,
            width: 400,
            height: 240,
          },
        ];
        snapshot.composition.clips = [
          {
            id: 'screen',
            kind: 'screen',
            name: 'Screen',
            assetId: 'screen',
            timelineStartMs: 0,
            timelineDurationMs: 10000,
            sourceInMs: 0,
            sourceDurationMs: 10000,
            playbackRate: 1,
            order: 0,
            enabled: true,
            transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
            appearance: {
              ...createDefaultClipAppearance('screen'),
              frame: 'none',
              shadowSize: 'custom',
              shadowBlur: 20,
              shadowColor: '#000000',
              shadowDirection: 'all',
              cornerRadius: 12,
            },
            isMirrored: false,
            isMirroredY: false,
          },
        ];
        if (webcam)
          snapshot.composition.clips.push({
            ...snapshot.composition.clips[0]!,
            id: 'camera',
            kind: 'webcam',
            transform: { x: 0.75, y: 0.7, width: 0.18, height: 0.2 },
          } as import('@beam/engine/shared/composition-types').VisualClip);
        const image = new OffscreenCanvas(400, 240),
          paint = image.getContext('2d')!;
        paint.fillStyle = '#eeeeee';
        paint.fillRect(0, 0, 400, 240);
        const counts: number[] = [],
          errors: number[] = [];
        let reference: Uint8ClampedArray | undefined;
        for (const speed of [0, 0.002, 0.02]) {
          const sample = (timeMs: number) => ({
            focus: { cx: 0.5, cy: 0.5 },
            scale: 1,
            tiltX: 0,
            tiltY: 0,
            orbit: {
              azimuth: 0,
              elevation: 0,
              maxAzimuth: 0,
              maxElevation: 0,
              roll: 0,
              distance: 100 + timeMs * speed,
              framingDistance: 100,
              zoomScale: 1,
              strength: 1,
            },
          });
          snapshot.zoomMotionBlur = { enabled: true, intensity: 1 };
          counts.push(
            createCameraMotionBlurPlan({
              sampleAt: sample,
              timeMs: 5000,
              intensity: 1,
              viewportWidth: 400,
              viewportHeight: 240,
            }).length,
          );
          const canvas = new OffscreenCanvas(400, 240),
            ctx = canvas.getContext('2d')!;
          renderCompositionFrame(
            ctx,
            { source: image, width: 400, height: 240 },
            snapshot,
            5,
            null,
            undefined,
            webcam ? new Map([['camera', { source: image, width: 400, height: 240 }]]) : undefined,
            undefined,
            { sample, invalidate() {} },
          );
          const actual = ctx.getImageData(0, 0, 400, 240).data;
          if (reference) {
            let error = 0;
            for (let i = 0; i < actual.length; i++) error = Math.max(error, Math.abs(actual[i]! - reference[i]!));
            errors.push(error);
          } else reference = actual;
        }
        disposeCompositionRenderer();
        return { counts, errors };
      }, webcam);
      expect(result.counts).toEqual([1, 3, 5]);
      expect(
        result.errors.every((error) => error <= 3),
        JSON.stringify(result),
      ).toBe(true);
    },
  );

  it.each([
    { depth: 1, tiltIntensity: 1 },
    { depth: 5, tiltIntensity: 1 },
    { depth: 1, tiltIntensity: 0 },
  ] as const)(
    'preserves small number detail at depth $depth / intensity $tiltIntensity without an undersized raster',
    async (cameraOptions) => {
      const result = await page.evaluate(async ({ depth, tiltIntensity }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { drawScreenshot } = (await load(
          '/packages/runtime/src/screenshot/screenshot-render.ts',
        )) as typeof import('../screenshot/screenshot-render');
        const { createStillDocument } = (await load(
          '/packages/engine/src/screenshot/still-document.ts',
        )) as typeof import('@beam/engine/screenshot/still-document');
        const { insertScreenshotLayer } = (await load(
          '/packages/engine/src/screenshot/screenshot-layers.ts',
        )) as typeof import('@beam/engine/screenshot/screenshot-layers');
        const { DEFAULT_ORBIT_SETTINGS } = (await load(
          '/packages/engine/src/zoom/orbit-settings.ts',
        )) as typeof import('@beam/engine/zoom/orbit-settings');
        const { createManualZoom, manualCameraZoom } = (await load(
          '/packages/engine/src/zoom/manual-zoom.ts',
        )) as typeof import('@beam/engine/zoom/manual-zoom');
        const image = new OffscreenCanvas(1600, 960),
          paint = image.getContext('2d')!;
        paint.fillStyle = '#ffffff';
        paint.fillRect(0, 0, 1600, 960);
        paint.fillStyle = '#000000';
        paint.font = '16px monospace';
        for (let y = 20; y < 960; y += 32) for (let x = 0; x < 1600; x += 70) paint.fillText('012345', x, y);
        const state = createStillDocument('numbers', 'numbers.png', 400, 240).state;
        state.canvas.watermark!.enabled = false;
        state.image.appearance = { ...state.image.appearance, frame: 'none', cornerRadius: 0, shadowSize: 'none' };
        const zoom = {
          ...createManualZoom('camera', 0, 1),
          kind: 'zoom' as const,
          name: '3D',
          enabled: true,
          mode: 'manual' as const,
          projection: 'orbit' as const,
          depth,
          tiltIntensity,
          orbitSettings: { ...DEFAULT_ORBIT_SETTINGS, yaw: 0, pitch: 0, roll: 0, horizontal: 0, vertical: 0 },
        };
        state.zooms = [zoom];
        insertScreenshotLayer(state, 'camera');
        const assets = { image, background: null, logo: null, width: 1600, height: 960 };
        const output = new OffscreenCanvas(400, 240),
          ctx = output.getContext('2d')!;
        drawScreenshot(ctx, state, assets, 400, 240);
        const reference = new OffscreenCanvas(400, 240),
          referenceCtx = reference.getContext('2d')!,
          camera = manualCameraZoom(zoom);
        referenceCtx.translate(200, 120);
        referenceCtx.scale(camera.scale, camera.scale);
        referenceCtx.translate(-200, -120);
        drawScreenshot(referenceCtx, state, assets, 400, 240, undefined, undefined, 'camera');
        const actual = ctx.getImageData(0, 0, 400, 240).data,
          expected = referenceCtx.getImageData(0, 0, 400, 240).data;
        let error = 0;
        const energy = (rgba: Uint8ClampedArray) => {
          let total = 0;
          for (let y = 1; y < 239; y++)
            for (let x = 1; x < 399; x++) {
              const i = (y * 400 + x) * 4;
              total += Math.abs(rgba[i]! - rgba[i - 4]!) + Math.abs(rgba[i]! - rgba[i - 1600]!);
            }
          return total;
        };
        for (let i = 0; i < actual.length; i += 4) error += Math.abs(actual[i]! - expected[i]!);
        return { meanError: error / (400 * 240), detail: energy(actual) / energy(expected) };
      }, cameraOptions);
      expect(result.detail).toBeGreaterThan(0.9);
      expect(result.meanError).toBeLessThan(8);
    },
  );

  it.each([
    ['video', 'none', 100],
    ['video', 'safari', 100],
    ['video', 'safari', 60],
    ['screenshot', 'none', 100],
    ['screenshot', 'safari', 100],
    ['screenshot', 'safari', 60],
  ] as const)('preserves all source edges, frame and shadow in %s / %s / %s', async (host, frame, opacity) => {
    const result = await page.evaluate(
      async ({ host, frame, opacity }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { drawScreenshot } = (await load(
          '/packages/runtime/src/screenshot/screenshot-render.ts',
        )) as typeof import('../screenshot/screenshot-render');
        const { createStillDocument } = (await load(
          '/packages/engine/src/screenshot/still-document.ts',
        )) as typeof import('@beam/engine/screenshot/still-document');
        const { insertScreenshotLayer, updateScreenshotLayer } = (await load(
          '/packages/engine/src/screenshot/screenshot-layers.ts',
        )) as typeof import('@beam/engine/screenshot/screenshot-layers');
        const { applyOrbitPreset, ORBIT_PRESETS } = (await load(
          '/packages/engine/src/zoom/orbit-settings.ts',
        )) as typeof import('@beam/engine/zoom/orbit-settings');
        const { createManualZoom } = (await load(
          '/packages/engine/src/zoom/manual-zoom.ts',
        )) as typeof import('@beam/engine/zoom/manual-zoom');
        const { createRenderDocument } = (await load(
          '/packages/engine/src/document/render-document.ts',
        )) as typeof import('@beam/engine/document/render-document');
        const { createDefaultClipAppearance } = (await load(
          '/packages/engine/src/shared/composition-defaults.ts',
        )) as typeof import('@beam/engine/shared/composition-defaults');
        const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
          '/packages/runtime/src/rendering/render.ts',
        )) as typeof import('../rendering/render');
        const image = new OffscreenCanvas(400, 240),
          paint = image.getContext('2d')!;
        paint.fillStyle = '#eeeeee';
        paint.fillRect(0, 0, 400, 240);
        paint.fillStyle = '#ff0000';
        paint.fillRect(0, 0, 12, 240);
        paint.fillStyle = '#00ff00';
        paint.fillRect(388, 0, 12, 240);
        paint.fillStyle = '#0000ff';
        paint.fillRect(0, 0, 400, 12);
        paint.fillStyle = '#ffff00';
        paint.fillRect(0, 228, 400, 12);
        const appearance = {
          ...createDefaultClipAppearance('screen'),
          frame,
          cornerRadius: 18,
          shadowSize: 'custom' as const,
          shadowBlur: 24,
          shadowColor: '#ff00ff',
          shadowDirection: 'all' as const,
          frameColor: '#cccccc',
          frameShowMenu: false,
          frameShowScrollbars: false,
        };
        const zoom = applyOrbitPreset(
          { ...createManualZoom('camera', 3000, 9000), depth: 1 },
          ORBIT_PRESETS.find((p) => p.id === 'isometric')!,
        );
        zoom.orbitSettings = { ...zoom.orbitSettings!, pullback: 0.45 };
        const output = new OffscreenCanvas(400, 240),
          ctx = output.getContext('2d')!;
        let opacityError = 0,
          actualPixels: Uint8ClampedArray | undefined;
        if (host === 'screenshot') {
          const state = createStillDocument('still', 'source.png', 400, 240).state;
          state.canvas.watermark!.enabled = false;
          state.image.appearance = appearance;
          state.zooms = [{ ...zoom, kind: 'zoom', name: '3D', enabled: true, mode: 'manual', startMs: 0, endMs: 1 }];
          insertScreenshotLayer(state, 'camera');
          updateScreenshotLayer(state, state.image.id, { opacity });
          drawScreenshot(ctx, state, { image, background: null, logo: null, width: 400, height: 240 }, 400, 240);
          if (opacity !== 100) {
            actualPixels = ctx.getImageData(0, 0, 400, 240).data;
            updateScreenshotLayer(state, state.image.id, { opacity: 100 });
            const reference = new OffscreenCanvas(400, 240),
              referenceCtx = reference.getContext('2d')!;
            drawScreenshot(
              referenceCtx,
              state,
              { image, background: null, logo: null, width: 400, height: 240 },
              400,
              240,
            );
            const full = referenceCtx.getImageData(0, 0, 400, 240).data;
            for (let i = 3; i < full.length; i += 4)
              opacityError = Math.max(opacityError, Math.abs(actualPixels[i]! - (full[i]! * opacity) / 100));
          }
        } else {
          const snapshot = createRenderDocument(undefined, 400, 240, 60);
          snapshot.canvas.watermark!.enabled = false;
          snapshot.duration = 10;
          snapshot.background = { kind: 'color', color: '#ffffff' };
          snapshot.composition.assets = [
            {
              id: 'source',
              kind: 'video',
              name: 'Recording',
              fileName: 'video.mp4',
              src: 'source',
              origin: 'project',
              durationMs: 10000,
              width: 400,
              height: 240,
            },
          ];
          snapshot.composition.clips = [
            {
              id: 'screen',
              kind: 'screen',
              name: 'Recording',
              assetId: 'source',
              timelineStartMs: 0,
              timelineDurationMs: 10000,
              sourceInMs: 0,
              sourceDurationMs: 10000,
              playbackRate: 1,
              order: 0,
              enabled: true,
              transform: { x: 0, y: 0, width: 1, height: 1 },
              appearance,
              isMirrored: false,
              isMirroredY: false,
            },
          ];
          if (opacity !== 100)
            snapshot.composition.scene = {
              version: 1,
              roots: ['g'],
              groups: [
                {
                  id: 'g',
                  children: ['screen'],
                  opacity: opacity / 100,
                  blendMode: 'source-over',
                  space: 'scene',
                  transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
                },
              ],
            };
          snapshot.zooms = [zoom];
          snapshot.zoomMotionBlur = { enabled: false, intensity: 0 };
          renderCompositionFrame(ctx, { source: image, width: 400, height: 240 }, snapshot, 5);
        }
        const rgba = actualPixels ?? ctx.getImageData(0, 0, 400, 240).data;
        const counts = { left: 0, right: 0, top: 0, bottom: 0, shadow: 0 };
        for (let i = 0; i < rgba.length; i += 4) {
          const r = rgba[i]!,
            g = rgba[i + 1]!,
            b = rgba[i + 2]!,
            a = rgba[i + 3]!;
          if (a < 8) continue;
          if (r > 150 && g < 120 && b < 120) counts.left++;
          if (g > 150 && r < 120 && b < 120) counts.right++;
          if (b > 150 && r < 120 && g < 120) counts.top++;
          if (r > 150 && g > 150 && b < 120) counts.bottom++;
          if (r > 150 && b > 150 && g < 220) counts.shadow++;
        }
        disposeCompositionRenderer();
        return { counts, opacityError };
      },
      { host, frame, opacity },
    );
    for (const [part, count] of Object.entries(result.counts)) expect(count, part).toBeGreaterThan(20);
    expect(result.opacityError).toBeLessThanOrEqual(2);
  });
});
