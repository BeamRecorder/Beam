// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import type * as CropBrowserHost from '../../desktop/src/components/editor/tests/crop-background-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('cropped recording preview and real MP4 export', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-crop-background-'));
    let recording: Buffer | null = null;
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'crop-recording-fixture',
          configureServer(server) {
            server.middlewares.use('/crop-source.mp4', (request, response) => {
              if (request.method === 'POST') {
                const chunks: Buffer[] = [];
                request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                request.on('end', () => {
                  recording = Buffer.concat(chunks);
                  response.end();
                });
              } else {
                response.setHeader('Content-Type', 'video/mp4');
                response.end(recording);
              }
            });
            server.middlewares.use('/beam-crop-test', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><title>Beam crop export regression</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test server');
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...env } = process.env;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      env: { ...env, TMPDIR: temporary },
      userDataDir: resolve(temporary, 'profile'),
      args: chromiumSettings().args,
    });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/beam-crop-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it.each(['color', 'image'] as const)(
    'fills the cropped 40 px with the %s background in preview, rendering and decoded MP4',
    async (kind) => {
      const result = await page.evaluate(async (kind) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<typeof CropBrowserHost>;
        return (
          await load('/apps/desktop/src/components/editor/tests/crop-background-browser-host.ts')
        ).checkCropBackground(kind);
      }, kind);
      expect(result.bytes).toBeGreaterThan(500);
      expect(result.dimensions).toEqual([1920, 1080]);
      expect(result.previewGap).toEqual([227, 213, 255, 255]);
      expect(result.exportGap).toEqual(result.previewGap);
      expect(result.exportContent).toEqual(result.previewContent);
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(result.encodedGap[channel]! - result.previewGap[channel]!)).toBeLessThanOrEqual(8);
        expect(Math.abs(result.encodedContent[channel]! - result.previewContent[channel]!)).toBeLessThanOrEqual(8);
      }
    },
    45000,
  );
  it.each(['color', 'image'] as const)(
    'removes the bottom 40 px without a bar or disabled %s background in a decoded MP4',
    async (kind) => {
      const result = await page.evaluate(async (kind) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<typeof CropBrowserHost>;
        return (
          await load('/apps/desktop/src/components/editor/tests/crop-background-browser-host.ts')
        ).checkCropBackground(kind, false);
      }, kind);
      expect(result.bytes).toBeGreaterThan(500);
      expect(result.dimensions).toEqual([1920, 1080]);
      expect(result.previewGap).toEqual(result.previewContent);
      expect(result.exportGap).toEqual(result.previewGap);
      expect(result.exportContent).toEqual(result.previewContent);
      for (const pixel of [result.previewGap, result.encodedGap, result.encodedContent]) {
        for (let channel = 0; channel < 4; channel++) {
          expect(Math.abs(pixel[channel]! - [51, 102, 204, 255][channel]!)).toBeLessThanOrEqual(8);
        }
      }
    },
    45000,
  );
});
