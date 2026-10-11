// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../../../../apps/cli/src/chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('webcam shadow pixels across zoom rendering surfaces', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-webcam-shadow-test-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../', import.meta.url)),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'webcam-shadow-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-webcam-shadow-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Beam webcam shadow test</title>');
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
    await page.goto(`http://127.0.0.1:${address.port}/beam-webcam-shadow-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  const compare = (
    reactToZoom: boolean,
    direction: 'all' | 'bottom-right',
    blur: number,
    framing: 'custom' | 'circle' | 'squircle' = 'custom',
  ) =>
    page.evaluate(
      async ({ reactToZoom, direction, blur, framing }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { drawWebcamClip } = (await load(
          '/packages/runtime/src/rendering/render-media.ts',
        )) as typeof import('../../rendering/render-media');
        const { createDefaultClipAppearance } = (await load(
          '/packages/engine/src/shared/composition-defaults.ts',
        )) as typeof import('@beam/engine/shared/composition-defaults');
        const { computeWebcamLayout, webcamSettingsForAppearance } = (await load(
          '/packages/runtime/src/composition/webcam/webcam-zoom.ts',
        )) as typeof import('./webcam-zoom');
        const source = new OffscreenCanvas(160, 120);
        const sourceContext = source.getContext('2d')!;
        sourceContext.fillStyle = '#ffffff';
        sourceContext.fillRect(0, 0, 160, 120);
        const clip = {
          id: 'camera',
          assetId: 'camera',
          kind: 'webcam' as const,
          name: 'Camera',
          enabled: true,
          order: 0,
          timelineStartMs: 0,
          timelineDurationMs: 1000,
          sourceInMs: 0,
          sourceDurationMs: 1000,
          playbackRate: 1,
          reactToZoom,
          isMirrored: false,
          isMirroredY: false,
          transform: { x: 0.4, y: 0.3, width: 0.4, height: 0.4 },
          cameraFramingPreset: framing,
          appearance: {
            ...createDefaultClipAppearance('webcam'),
            shadowSize: 'custom' as const,
            shadowBlur: blur,
            shadowDirection: direction,
            cornerRadius: 16,
          },
        };
        const render = (density: number, scale: number) => {
          const canvas = new OffscreenCanvas(512 * density, 384 * density);
          const ctx = canvas.getContext('2d')!;
          ctx.scale(density, density);
          ctx.translate(256, 192);
          ctx.scale(scale, scale);
          ctx.translate(-256, -192);
          drawWebcamClip(ctx, clip, { source, width: 160, height: 120 }, { width: 512, height: 384 }, 500, 0.5, {
            scale,
            focusX: 256,
            focusY: 192,
          });
          const logical = new OffscreenCanvas(512, 384);
          const target = logical.getContext('2d')!;
          target.drawImage(canvas, 0, 0, 512, 384);
          return target.getImageData(0, 0, 512, 384).data;
        };
        return [1, 1.3, 2.5, 1.8, 1]
          .map((scale) => {
            const reference = render(1, scale);
            const rect = computeWebcamLayout(
              512,
              384,
              scale,
              { ...webcamSettingsForAppearance(clip.appearance), reactToZoom },
              clip.transform,
            );
            return [1.25, 2].map((density) => {
              const actual = render(density, scale);
              let maxAlphaDifference = 0,
                shadowPixels = 0,
                totalDifference = 0;
              for (let i = 0; i < reference.length; i += 4) {
                // Inspect the shadow only, away from resampled media/clip edges.
                const x = (i / 4) % 512,
                  y = Math.floor(i / 4 / 512);
                if (x >= rect.x - 5 && x <= rect.x + rect.width + 5 && y >= rect.y - 5 && y <= rect.y + rect.height + 5)
                  continue;
                if (reference[i]! !== 0 || actual[i]! !== 0 || reference[i + 3]! < 2 || reference[i + 3]! > 200)
                  continue;
                const difference = Math.abs(reference[i + 3]! - actual[i + 3]!);
                maxAlphaDifference = Math.max(maxAlphaDifference, difference);
                totalDifference += difference;
                shadowPixels++;
              }
              return {
                scale,
                density,
                maxAlphaDifference,
                meanAlphaDifference: totalDifference / shadowPixels,
                shadowPixels,
              };
            });
          })
          .flat();
      },
      { reactToZoom, direction, blur, framing },
    );

  it.each([false, true])(
    'keeps motion-blur and settled shadows consistent with zoom reaction %s',
    async (reactToZoom) => {
      for (const result of await compare(reactToZoom, 'all', 40)) {
        expect(result.shadowPixels).toBeGreaterThan(100);
        expect(result.meanAlphaDifference, JSON.stringify(result)).toBeLessThan(2);
        expect(result.maxAlphaDifference, JSON.stringify(result)).toBeLessThan(12);
      }
    },
  );
  it.each(['circle', 'squircle'] as const)(
    'keeps large directional %s shadows consistent across preview and export densities',
    async (framing) => {
      for (const result of await compare(true, 'bottom-right', 96, framing)) {
        expect(result.shadowPixels).toBeGreaterThan(100);
        expect(result.meanAlphaDifference, JSON.stringify(result)).toBeLessThan(2);
        expect(result.maxAlphaDifference, JSON.stringify(result)).toBeLessThan(12);
      }
    },
  );
});
