// @vitest-environment node
// BEAM_HEADLESS_TEST=1: actual MP4 decoding, WebGL readback, worker transfer and cursor evaluation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';

function recording(kind: string) {
  const width = 384,
    height = 216,
    count = 120;
  const dense = kind === 'dense-hover',
    rowHeight = dense ? 5 : 12;
  const pixels = Buffer.alloc(width * height * 3 * count, 35);
  const rect = (frame: number, x: number, y: number, w: number, h: number, value: number) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row++)
      pixels.fill(value, ((frame * height + row) * width + x) * 3, ((frame * height + row) * width + x + w) * 3);
  };
  for (let frame = 0; frame < count; frame++) {
    for (let row = 0; row < 12; row++) {
      const y = 24 + row * rowHeight;
      rect(
        frame,
        40,
        y,
        200,
        rowHeight - 1,
        (kind === 'hover' || dense) && row === Math.floor(frame / 3) % 12 ? 220 : 65,
      );
      rect(frame, 50, y + 2, 80, 1, 120);
    }
    if (kind === 'scroll')
      for (let y = 0; y < height; y++) {
        rect(frame, 0, y, width, 1, (y + frame * 4) % 12 < 6 ? 40 : 200);
      }
    if (kind === 'animation') rect(frame, 280, 50, 80, 90, frame % 2 ? 200 : 70);
  }
  return execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgb24',
      '-video_size',
      `${width}x${height}`,
      '-framerate',
      '60',
      '-i',
      'pipe:0',
      '-an',
      '-c:v',
      'libopenh264',
      '-b:v',
      '3000000',
      ...(dense ? ['-vf', 'scale=1920:1080:flags=neighbor'] : []),
      '-pix_fmt',
      'yuv420p',
      '-bf',
      '0',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ],
    { input: pixels, maxBuffer: 8 * 1024 * 1024 },
  );
}

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('cursor synchronization from actual recorded pixels', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(tmpdir(), 'beam-hover-'));
    const fixtures = new Map(
      ['hover', 'dense-hover', 'static', 'scroll', 'animation'].map((kind) => [`/${kind}.mp4`, recording(kind)]),
    );
    const delayed = resolve(temporary, 'delayed-hover.mp4');
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-c',
        'copy',
        '-output_ts_offset',
        '0.125',
        '-movflags',
        '+faststart',
        delayed,
      ],
      { input: fixtures.get('/hover.mp4') },
    );
    fixtures.set('/delayed-hover.mp4', await readFile(delayed));
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'hover-fixtures',
          configureServer(server) {
            server.middlewares.use((request, response, next) => {
              const fixture = fixtures.get(request.url ?? '');
              if (fixture) {
                response.setHeader('Content-Type', 'video/mp4');
                response.setHeader('Content-Length', fixture.length);
                response.end(fixture);
              } else if (request.url === '/hover-test') {
                response.setHeader('Content-Type', 'text/html');
                response.end('<!doctype html><title>Hover synchronization test</title>');
              } else next();
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port.');
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      args: chromiumSettings().args,
      userDataDir: resolve(temporary, 'profile'),
      pipe: true,
    });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/hover-test`);
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it('keeps the GPU grid aligned with the top of the original source', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { HoverDifferenceGpu } = (await load(
        '/packages/runtime/src/cursor/hover/hover-difference-gpu.ts',
      )) as typeof import('@beam/runtime/cursor/hover/hover-difference-gpu');
      const canvas = new OffscreenCanvas(384, 216),
        ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 384, 216);
      const gpu = new HoverDifferenceGpu(384, 216);
      gpu.sample(canvas);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 100, 12);
      const grid = gpu.sample(canvas)!;
      const row = (y: number) =>
        Array.from({ length: grid.width }, (_, x) => grid.pixels[(y * grid.width + x) * 4]).reduce((a, b) => a + b!, 0);
      gpu.dispose();
      return { top: row(0), bottom: row(grid.height - 1) };
    });
    expect(result.top).toBeGreaterThan(0);
    expect(result.bottom).toBe(0);
  });
  it('keeps pause/resume segments on their original clocks', async () => {
    const sync = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { analyzeCursorHoversInBackground } = (await load(
        '/packages/runtime/src/cursor/hover/hover-analysis-browser.ts',
      )) as typeof import('@beam/runtime/cursor/hover/hover-analysis-browser');
      const { packHoverPath } = (await load(
        '/packages/runtime/src/cursor/hover/hover-path.ts',
      )) as typeof import('@beam/runtime/cursor/hover/hover-path');
      const events = [5, 10].flatMap((start) =>
        Array.from({ length: 120 }, (_, frame) => ({
          event: 'move' as const,
          sessionNs: (start + frame / 60) * 1e9,
          normalizedX: 100 / 384,
          normalizedY: (30 + (Math.floor(frame / 3) % 12) * 12) / 216,
          pixelX: 100,
          pixelY: 30,
          visible: true,
        })),
      );
      const sources = [5, 10].map((start) => ({
        id: `segment-${start}`,
        src: `${location.origin}/hover.mp4`,
        startSeconds: start,
        durationSeconds: 2,
      }));
      return analyzeCursorHoversInBackground({ sources, path: packHoverPath(events) }, new AbortController().signal);
    });
    expect(sync.ranges).toHaveLength(2);
    expect(sync.ranges[0]!.startSeconds).toBeGreaterThanOrEqual(5);
    expect(sync.ranges[0]!.endSeconds).toBeLessThanOrEqual(7);
    expect(sync.ranges[1]!.startSeconds).toBeGreaterThanOrEqual(10);
    expect(sync.ranges[1]!.endSeconds).toBeLessThanOrEqual(12);
  }, 30_000);

  it.each([0, 5])(
    'analyzes positive first-frame timestamps on a segment starting at %s seconds',
    async (start) => {
      const result = await page.evaluate(async (start) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { analyzeCursorHoversInBackground } = (await load(
          '/packages/runtime/src/cursor/hover/hover-analysis-browser.ts',
        )) as typeof import('@beam/runtime/cursor/hover/hover-analysis-browser');
        const { packHoverPath } = (await load(
          '/packages/runtime/src/cursor/hover/hover-path.ts',
        )) as typeof import('@beam/runtime/cursor/hover/hover-path');
        const { openMediaInput } = (await load(
          '/packages/runtime/src/shared/media-input.ts',
        )) as typeof import('@beam/runtime/shared/media-input');
        const { mediaSourceDescriptor } = (await load(
          '/packages/runtime/src/shared/media-source.ts',
        )) as typeof import('@beam/runtime/shared/media-source');
        const src = `${location.origin}/delayed-hover.mp4`;
        const opened = await openMediaInput(
          mediaSourceDescriptor({ id: 'delayed', name: 'delayed', kind: 'video', src }),
        );
        let first: number;
        try {
          first = await (await opened.input.getPrimaryVideoTrack())!.getFirstTimestamp();
        } finally {
          opened.dispose();
        }
        const events = Array.from({ length: 120 }, (_, frame) => ({
          event: 'move' as const,
          sessionNs: (start + first + frame / 60) * 1e9,
          normalizedX: 100 / 384,
          normalizedY: (30 + (Math.floor(frame / 3) % 12) * 12) / 216,
          pixelX: 100,
          pixelY: 30,
          visible: true,
        }));
        const sync = await analyzeCursorHoversInBackground(
          {
            sources: [{ id: `delayed-${start}`, src, startSeconds: start, durationSeconds: first + 2 }],
            path: packHoverPath(events),
          },
          new AbortController().signal,
        );
        return { first, sync };
      }, start);
      expect(result.first).toBeCloseTo(0.125, 6);
      expect(result.sync.ranges.length).toBeGreaterThan(0);
      expect(result.sync.ranges[0]!.startSeconds).toBeGreaterThanOrEqual(start + result.first);
      expect(result.sync.ranges.at(-1)!.endSeconds).toBeLessThanOrEqual(start + result.first + 2);
    },
    30_000,
  );

  it.each(['hover', 'dense-hover', 'static', 'scroll', 'animation'])(
    'analyzes the %s MP4 in a real worker and checks row alignment',
    async (kind) => {
      const result = await page.evaluate(async (kind) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { analyzeCursorHoversInBackground } = (await load(
          '/packages/runtime/src/cursor/hover/hover-analysis-browser.ts',
        )) as typeof import('@beam/runtime/cursor/hover/hover-analysis-browser');
        const { packHoverPath } = (await load(
          '/packages/runtime/src/cursor/hover/hover-path.ts',
        )) as typeof import('@beam/runtime/cursor/hover/hover-path');
        const { createCursorMotionPlayer } = (await load(
          '/packages/engine/src/cursor/cursor-motion.ts',
        )) as typeof import('@beam/engine/cursor/cursor-motion');
        const { createDefaultCursorMotionSettings } = (await load(
          '/packages/engine/src/capture/cursor-settings.ts',
        )) as typeof import('@beam/engine/capture/cursor-settings');
        const events = Array.from({ length: 120 }, (_, frame) => ({
          event: 'move' as const,
          sessionNs: (frame / 60) * 1e9,
          normalizedX: 100 / 384,
          normalizedY:
            (24 + (kind === 'dense-hover' ? 2 : 6) + (Math.floor(frame / 3) % 12) * (kind === 'dense-hover' ? 5 : 12)) /
            216,
          pixelX: 100,
          pixelY: 30,
          visible: true,
        }));
        const sources = [{ id: kind, src: `${location.origin}/${kind}.mp4`, startSeconds: 0, durationSeconds: 2 }];
        const sync = await analyzeCursorHoversInBackground(
          { sources, path: packHoverPath(events) },
          new AbortController().signal,
        );
        const settings = { ...createDefaultCursorMotionSettings(), smoothing: 1 };
        const motion = createCursorMotionPlayer(events, settings, 384, 216, sync);
        let errorPixels = 0;
        for (const event of events.slice(6, 114)) {
          const raw = {
            x: event.normalizedX,
            y: event.normalizedY,
            visible: true,
            cursorId: null,
            shapeId: null,
            cursorKind: null,
            hotspot: { x: 0, y: 0 },
          };
          errorPixels = Math.max(
            errorPixels,
            Math.abs(motion.sample(event.sessionNs / 1e9, raw)!.y - event.normalizedY) * 216,
          );
        }
        const cached = await analyzeCursorHoversInBackground(
          { sources, path: packHoverPath(events) },
          new AbortController().signal,
        );
        return { sync, errorPixels, cachedEqual: JSON.stringify(sync) === JSON.stringify(cached) };
      }, kind);
      if (kind === 'hover' || kind === 'dense-hover') {
        expect(result.sync.ranges.length).toBeGreaterThan(0);
        expect(result.errorPixels).toBeLessThan(0.01);
      } else expect(result.sync.ranges).toEqual([]);
      expect(result.cachedEqual).toBe(true);
    },
    30_000,
  );
});
