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

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('glass zoom pixels in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-glass-test-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../', import.meta.url)),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'glass-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-glass-test', (_req, res) => {
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
    await page.goto(`http://127.0.0.1:${address.port}/beam-glass-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  const pixels = (freehand: boolean, transform = false) =>
    page.evaluate(
      async ({ freehand, transform }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { renderGlassHighlights, disposeGlassHighlights } = (await load(
          '/packages/runtime/src/rendering/glass-highlight-render.ts',
        )) as typeof import('../rendering/glass-highlight-render');
        const { createManualZoom } = (await load(
          '/packages/engine/src/zoom/manual-zoom.ts',
        )) as typeof import('@beam/engine/zoom/manual-zoom');
        const { createGlassHighlight } = (await load(
          '/packages/engine/src/zoom/glass-highlight.ts',
        )) as typeof import('@beam/engine/zoom/glass-highlight');
        const { normalizeOutputCanvas } = (await load(
          '/packages/engine/src/layout/output-canvas.ts',
        )) as typeof import('@beam/engine/layout/output-canvas');
        const source = new OffscreenCanvas(256, 256),
          sourceCtx = source.getContext('2d')!;
        for (let x = 0; x < 256; x++) {
          sourceCtx.fillStyle = `rgb(${x},${255 - x},80)`;
          sourceCtx.fillRect(x, 0, 1, 256);
        }
        const canvas = new OffscreenCanvas(transform ? 600 : 256, transform ? 600 : 256),
          ctx = canvas.getContext('2d')!;
        if (transform) {
          ctx.translate(40, 60);
          ctx.scale(2, 2);
        }
        ctx.drawImage(source, 0, 0);
        const lens = {
          ...createManualZoom('lens', 0, 1000),
          depth: 4 as const,
          effect: 'glass' as const,
          glass: {
            ...createGlassHighlight(),
            size: 0.5,
            transitionMs: 0,
            refraction: 0,
            rim: 0,
            shadow: 0,
            dispersion: 0,
            shape: freehand ? ('freehand' as const) : ('circle' as const),
            path: freehand
              ? [
                  { x: 0, y: -1 },
                  { x: 1, y: 1 },
                  { x: -1, y: 1 },
                ]
              : [],
          },
        };
        const snapshot = {
          canvas: normalizeOutputCanvas({ preset: 'custom', width: 256, height: 256 }),
          zooms: [lens],
        };
        renderGlassHighlights(ctx, snapshot, 500);
        const read = (x: number, y: number) => [
          ...ctx.getImageData(transform ? 40 + x * 2 : x, transform ? 60 + y * 2 : y, 1, 1).data,
        ];
        const result = {
          outside: read(20, 20),
          center: read(128, 128),
          magnified: read(152, 144),
          corner: read(172, 84),
        };
        // The same authored contour must remain stable across reuse and reverse seeks.
        ctx.clearRect(0, 0, 256, 256);
        ctx.drawImage(source, 0, 0);
        renderGlassHighlights(ctx, snapshot, 0);
        result.center = read(128, 128);
        disposeGlassHighlights();
        return result;
      },
      { freehand, transform },
    );
  it.each([false, true])('magnifies only the authored mask (freehand=%s)', async (freehand) => {
    const result = await pixels(freehand);
    expect(result.outside).toEqual([20, 235, 80, 255]);
    expect(result.center[0]).toBeCloseTo(128, -0.5);
    expect(result.magnified[0]).toBeGreaterThan(135);
    expect(result.magnified[0]).toBeLessThan(143);
    if (freehand) expect(result.corner).toEqual([172, 83, 80, 255]);
  });
  it('preserves logical coordinates under preview translation and device scaling', async () => {
    const plain = await pixels(false),
      transformed = await pixels(false, true);
    expect(transformed.outside).toEqual(plain.outside);
    expect(Math.abs(transformed.magnified[0]! - plain.magnified[0]!)).toBeLessThanOrEqual(1);
  });
  it.each([false, true])(
    'retains original fine text strokes for screenshot and video lenses (freehand=%s)',
    async (freehand) => {
      const result = await page.evaluate(async (freehand) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
          '/packages/runtime/src/rendering/render.ts',
        )) as typeof import('../rendering/render');
        const { drawScreenshot } = (await load(
          '/packages/runtime/src/screenshot/screenshot-render.ts',
        )) as typeof import('../screenshot/screenshot-render');
        const { createRenderDocument } = (await load(
          '/packages/engine/src/document/render-document.ts',
        )) as typeof import('@beam/engine/document/render-document');
        const { createStillDocument } = (await load(
          '/packages/engine/src/screenshot/still-document.ts',
        )) as typeof import('@beam/engine/screenshot/still-document');
        const { createManualZoom } = (await load(
          '/packages/engine/src/zoom/manual-zoom.ts',
        )) as typeof import('@beam/engine/zoom/manual-zoom');
        const { createGlassHighlight } = (await load(
          '/packages/engine/src/zoom/glass-highlight.ts',
        )) as typeof import('@beam/engine/zoom/glass-highlight');
        const { insertScreenshotLayer } = (await load(
          '/packages/engine/src/screenshot/screenshot-layers.ts',
        )) as typeof import('@beam/engine/screenshot/screenshot-layers');
        const source = new OffscreenCanvas(1280, 720),
          sourceCtx = source.getContext('2d')!;
        sourceCtx.fillStyle = 'white';
        sourceCtx.fillRect(0, 0, 1280, 720);
        sourceCtx.fillStyle = 'black';
        for (let x = 0; x < 1280; x += 8) sourceCtx.fillRect(x, 0, 4, 720);
        const lens = {
          ...createManualZoom('lens', 0, 1000),
          depth: 6 as const,
          effect: 'glass' as const,
          glass: {
            ...createGlassHighlight(),
            transitionMs: 0,
            refraction: 0,
            rim: 0,
            shadow: 0,
            dispersion: 0,
            shape: freehand ? ('freehand' as const) : ('circle' as const),
            path: freehand
              ? [
                  { x: -1, y: -1 },
                  { x: 1, y: -1 },
                  { x: 1, y: 1 },
                  { x: -1, y: 1 },
                ]
              : [],
          },
        };
        const snapshot = createRenderDocument(undefined, 256, 144, 30);
        snapshot.canvas.showBackground = true;
        snapshot.canvas.watermark!.enabled = false;
        snapshot.zooms = [lens];
        const video = new OffscreenCanvas(256, 144),
          videoCtx = video.getContext('2d')!;
        renderCompositionFrame(videoCtx, null, snapshot, 0.5, { source, width: 1280, height: 720, preRendered: true });
        const state = createStillDocument('still', 'source.png', 1280, 720).state;
        state.canvas.width = 256;
        state.canvas.height = 144;
        state.canvas.showBackground = false;
        state.canvas.watermark!.enabled = false;
        state.image.appearance.shadowSize = 'none';
        state.image.appearance.cornerRadius = 0;
        state.zooms = [{ ...lens, mode: 'manual', kind: 'zoom', name: 'Lens', enabled: true, endMs: 1 }];
        insertScreenshotLayer(state, 'lens');
        const still = new OffscreenCanvas(256, 144),
          stillCtx = still.getContext('2d')!;
        drawScreenshot(
          stillCtx,
          state,
          { image: source, background: null, logo: null, width: 1280, height: 720 },
          256,
          144,
        );
        const contrast = (ctx: OffscreenCanvasRenderingContext2D) =>
          ctx.getImageData(133, 72, 1, 1).data[0]! - ctx.getImageData(129, 72, 1, 1).data[0]!;
        const result = { video: contrast(videoCtx), still: contrast(stillCtx) };
        disposeCompositionRenderer();
        return result;
      }, freehand);
      expect(result.video).toBeGreaterThan(220);
      expect(result.still).toBeGreaterThan(220);
    },
  );
  it('magnifies the cursor at its authored size in the high-density video scene', async () => {
    const result = await page.evaluate(async () => {
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
      const { emptyComposition } = (await load(
        '/packages/engine/src/shared/composition-types.ts',
      )) as typeof import('@beam/engine/shared/composition-types');
      const { createManualZoom } = (await load(
        '/packages/engine/src/zoom/manual-zoom.ts',
      )) as typeof import('@beam/engine/zoom/manual-zoom');
      const { createGlassHighlight } = (await load(
        '/packages/engine/src/zoom/glass-highlight.ts',
      )) as typeof import('@beam/engine/zoom/glass-highlight');
      const snapshot = createRenderDocument(
        {
          ...emptyComposition(),
          assets: [
            {
              id: 'asset',
              kind: 'video',
              name: 'Screen',
              fileName: null,
              durationMs: 1000,
              width: 200,
              height: 100,
              src: 'file:///test.mp4',
              origin: 'session',
            },
          ],
          clips: [
            {
              id: 'screen',
              kind: 'screen',
              trackId: 'screen-track',
              name: 'Screen',
              assetId: 'asset',
              timelineStartMs: 0,
              timelineDurationMs: 1000,
              sourceInMs: 0,
              sourceDurationMs: 1000,
              playbackRate: 1,
              enabled: true,
              order: 0,
              transitions: { entry: null, exit: null },
              transform: { x: 0, y: 0, width: 1, height: 1 },
              appearance: { ...createDefaultClipAppearance('screen'), shadowSize: 'none' },
              isMirrored: false,
              isMirroredY: false,
            },
          ],
        },
        200,
        100,
      );
      snapshot.canvas.watermark!.enabled = false;
      snapshot.cursor.available = true;
      snapshot.cursor.events = [
        { event: 'move', sessionNs: 0, pixelX: 100, pixelY: 50, normalizedX: 0.5, normalizedY: 0.5, visible: true },
      ];
      snapshot.cursorSettings.enabled = true;
      snapshot.cursorSettings.size = 8;
      snapshot.cursorSettings.shadow.enabled = false;
      snapshot.cursorSettings.motion.motionBlur = 0;
      snapshot.cursorSettings.selection = { packId: 'test', mode: 'fixed', cursorId: 'cursor' };
      snapshot.cursorPack = {
        id: 'test',
        name: 'Test',
        source: 'builtin',
        colorMode: 'original',
        defaultCursorId: 'cursor',
        automaticMap: {},
        cursors: [
          {
            id: 'cursor',
            label: 'Cursor',
            url: 'test.png',
            intrinsicSize: { width: 8, height: 8 },
            nominalSize: 8,
            hotspot: { x: 0, y: 0 },
          },
        ],
      };
      snapshot.zooms = [
        {
          ...createManualZoom('lens', 0, 1000),
          depth: 4,
          effect: 'glass',
          glass: { ...createGlassHighlight(), transitionMs: 0, refraction: 0, rim: 0, shadow: 0, dispersion: 0 },
        },
      ];
      const source = new OffscreenCanvas(200, 100),
        sourceCtx = source.getContext('2d')!;
      sourceCtx.fillStyle = 'white';
      sourceCtx.fillRect(0, 0, 200, 100);
      const cursor = new OffscreenCanvas(8, 8),
        cursorCtx = cursor.getContext('2d')!;
      cursorCtx.fillStyle = '#0000ff';
      cursorCtx.fillRect(0, 0, 8, 8);
      const image = await createImageBitmap(cursor);
      const output = new OffscreenCanvas(200, 100),
        ctx = output.getContext('2d')!;
      renderCompositionFrame(
        ctx,
        { source, width: 200, height: 100 },
        snapshot,
        0.5,
        null,
        new Map([['cursor', image]]),
      );
      const result = [...ctx.getImageData(110, 58, 1, 1).data];
      disposeCompositionRenderer();
      image.close();
      return result;
    });
    expect(result).toEqual([0, 0, 255, 255]);
  });

  it('uses the same shader for screenshot and completed video frames', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { renderCompositionFrame, disposeCompositionRenderer } = (await load(
        '/packages/runtime/src/rendering/render.ts',
      )) as typeof import('../rendering/render');
      const { drawScreenshot } = (await load(
        '/packages/runtime/src/screenshot/screenshot-render.ts',
      )) as typeof import('../screenshot/screenshot-render');
      const { createRenderDocument } = (await load(
        '/packages/engine/src/document/render-document.ts',
      )) as typeof import('@beam/engine/document/render-document');
      const { createStillDocument } = (await load(
        '/packages/engine/src/screenshot/still-document.ts',
      )) as typeof import('@beam/engine/screenshot/still-document');
      const { createManualZoom } = (await load(
        '/packages/engine/src/zoom/manual-zoom.ts',
      )) as typeof import('@beam/engine/zoom/manual-zoom');
      const { createGlassHighlight } = (await load(
        '/packages/engine/src/zoom/glass-highlight.ts',
      )) as typeof import('@beam/engine/zoom/glass-highlight');
      const { insertScreenshotLayer } = (await load(
        '/packages/engine/src/screenshot/screenshot-layers.ts',
      )) as typeof import('@beam/engine/screenshot/screenshot-layers');
      const source = new OffscreenCanvas(256, 144),
        paint = source.getContext('2d')!;
      for (let x = 0; x < 256; x++) {
        paint.fillStyle = `rgb(${x},${255 - x},80)`;
        paint.fillRect(x, 0, 1, 144);
      }
      const zoom = {
        ...createManualZoom('lens', 0, 1000),
        effect: 'glass' as const,
        glass: { ...createGlassHighlight(), transitionMs: 0 },
      };
      const snapshot = createRenderDocument(undefined, 256, 144, 30);
      snapshot.canvas.showBackground = true;
      snapshot.canvas.watermark!.enabled = false;
      snapshot.zooms = [zoom];
      const a = new OffscreenCanvas(256, 144),
        ca = a.getContext('2d')!;
      renderCompositionFrame(ca, null, snapshot, 0.5, { source, width: 256, height: 144, preRendered: true });
      const state = createStillDocument('still', 'source.png', 256, 144).state;
      state.canvas.watermark!.enabled = false;
      state.image.appearance.shadowSize = 'none';
      state.image.appearance.cornerRadius = 0;
      state.zooms = [{ ...zoom, kind: 'zoom', name: 'Lens', enabled: true, mode: 'manual', endMs: 1 }];
      insertScreenshotLayer(state, 'lens');
      const b = new OffscreenCanvas(256, 144),
        cb = b.getContext('2d')!;
      drawScreenshot(cb, state, { image: source, background: null, logo: null, width: 256, height: 144 }, 256, 144);
      const ap = ca.getImageData(0, 0, 256, 144).data,
        bp = cb.getImageData(0, 0, 256, 144).data;
      let differing = 0,
        maximum = 0;
      for (let i = 0; i < ap.length; i++) {
        if (ap[i] !== bp[i]) differing++;
        maximum = Math.max(maximum, Math.abs(ap[i]! - bp[i]!));
      }
      disposeCompositionRenderer();
      return { differing, maximum };
    });
    expect(result).toEqual({ differing: 0, maximum: 0 });
  });
});
