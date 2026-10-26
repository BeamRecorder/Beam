// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../apps/cli/src/chromium-settings';
import type * as ShapeRendererModule from '../render-shape-clip';
import type * as ArrowModule from '@beam/engine/shared/shape-vector-presets';
import type * as ShapeStyleModule from '@beam/engine/shared/shape-layer-style';
import type { ShapeClip } from '@beam/engine/shared/composition-types';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('arrow borders in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-arrow-border-test-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../', import.meta.url)),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'arrow-border-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-arrow-border-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Beam arrow border test</title>');
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
    await page.goto(`http://127.0.0.1:${address.port}/beam-arrow-border-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  it('closes unmarked tails with and without fill, after rotation and output scaling', async () => {
    const samples = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { drawShapeClip } = (await load(
        '/packages/runtime/src/composition/shape/render-shape-clip.ts',
      )) as typeof ShapeRendererModule;
      const { arrowVector } = (await load('/packages/engine/src/shared/shape-vector-presets.ts')) as typeof ArrowModule;
      const { DEFAULT_SHAPE_LAYER_STYLE } = (await load(
        '/packages/engine/src/shared/shape-layer-style.ts',
      )) as typeof ShapeStyleModule;
      const samples = [];
      for (const preset of ['line', 'curved', 'elbow', 'wave', 'hook'] as const)
        for (const fillEnabled of [true, false])
          for (const rotation of [0, 37, 90])
            for (const scale of [0.5, 1]) {
              const width = 1440 * scale,
                height = 1080 * scale;
              const canvas = new OffscreenCanvas(width, height),
                ctx = canvas.getContext('2d')!;
              const vector = { ...arrowVector(preset), strokeWidth: 24, markerSize: 72 };
              const clip: ShapeClip = {
                ...DEFAULT_SHAPE_LAYER_STYLE,
                id: 'arrow',
                kind: 'shape',
                family: 'arrow',
                preset: 'arrow',
                assetId: '',
                name: 'Arrow',
                timelineStartMs: 0,
                timelineDurationMs: 1000,
                sourceInMs: 0,
                sourceDurationMs: 1000,
                playbackRate: 1,
                enabled: true,
                order: 0,
                vector,
                rotation,
                fillEnabled,
                fillColor: '#2463eb',
                borderColor: '#ffffff',
                borderWidth: 12,
                transform: { x: 0.125, y: 2 / 9, width: 0.75, height: 5 / 9 },
              };
              const viewport = { x: 0, y: 0, width, height };
              const tip = vector.contours[0]!.nodes[0]!,
                neighbor = tip.out ?? vector.contours[0]!.nodes[1]!;
              const dx = (tip.x - neighbor.x) * width * 0.75,
                dy = ((tip.y - neighbor.y) * height * 5) / 9;
              const length = Math.hypot(dx, dy),
                angle = (rotation * Math.PI) / 180;
              const pixel = (distance: number) => {
                const x = (tip.x - 0.5) * width * 0.75 + (dx / length) * distance;
                const y = ((tip.y - 0.5) * height * 5) / 9 + (dy / length) * distance;
                return Array.from(
                  ctx.getImageData(
                    Math.floor(width * 0.5 + x * Math.cos(angle) - y * Math.sin(angle)),
                    Math.floor(height * 0.5 + x * Math.sin(angle) + y * Math.cos(angle)),
                    1,
                    1,
                  ).data,
                );
              };
              const draw = () => {
                ctx.clearRect(0, 0, width, height);
                drawShapeClip(ctx, clip, viewport);
              };
              draw();
              const cap = pixel(6 * scale),
                interior = pixel(-18 * scale);
              clip.borderWidth = 0;
              draw();
              const withoutBorder = pixel(6 * scale);
              clip.borderWidth = 24;
              draw();
              const widenedCap = pixel(18 * scale);
              samples.push({ preset, fillEnabled, rotation, scale, cap, interior, withoutBorder, widenedCap });
            }
      return samples;
    });
    for (const sample of samples) {
      const label = JSON.stringify(sample);
      expect(sample.cap, label).toEqual([255, 255, 255, 255]);
      expect(sample.widenedCap, label).toEqual([255, 255, 255, 255]);
      expect(sample.withoutBorder[3], label).toBe(0);
      expect(sample.interior, label).toEqual(sample.fillEnabled ? [36, 99, 235, 255] : [255, 255, 255, 255]);
    }
  }, 30000);
});
