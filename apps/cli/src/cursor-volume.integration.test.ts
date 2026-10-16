// @vitest-environment node
// BEAM_HEADLESS_TEST=1 runs the actual retained WebGL2 cursor renderer in Chromium.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('GPU cursor exposure and volume', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(tmpdir(), 'beam-volume-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'cursor-test',
          configureServer(server) {
            server.middlewares.use((request, response, next) => {
              if (request.url !== '/cursor-test') return next();
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><title>Cursor GPU test</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing server port.');
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      args: chromiumSettings().args,
      pipe: true,
      userDataDir: resolve(temporary, 'profile'),
    });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/cursor-test`);
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  async function render(kind: string) {
    return page.evaluate(async (kind) => {
      const { CursorGpuPainter } = await new Function('path', 'return import(path)')(
        '/packages/runtime/src/cursor/cursor-gpu-painter.ts',
      );
      const source = new OffscreenCanvas(32, 32),
        context = source.getContext('2d')!;
      context.fillStyle = '#efbb88';
      context.fillRect(4, 4, 24, 24);
      if (kind === 'hole') context.clearRect(12, 12, 8, 8);
      const image = source.transferToImageBitmap(),
        painter = new CursorGpuPainter();
      const samples =
        kind === 'blur'
          ? Array.from({ length: 16 }, (_, index) => ({ x: 30 + index * 5, y: 50, weight: 1 / 16 }))
          : [{ x: 50, y: 50, weight: 1 }];
      const result = painter.render({
        image,
        geometry: { width: 32, height: 32, hotspot: { x: 16, y: 16 } },
        samples,
        resolution: 2,
        shadow: { enabled: kind === 'shadow', blur: 4, color: '#00000080', direction: 'bottom-right' },
        ...(kind === 'volume' ? { volume: { pitch: 0.22, yaw: -0.25, height: 0.32 } } : {}),
      });
      const output = new OffscreenCanvas(160, 100),
        target = output.getContext('2d')!;
      target.drawImage(result.canvas, result.x, result.y, result.width, result.height);
      const pixels = target.getImageData(0, 0, 160, 100).data;
      let alpha = 0,
        count = 0,
        max = 0,
        left = 160,
        right = 0,
        top = 100,
        bottom = 0;
      for (let y = 0; y < 100; y++)
        for (let x = 0; x < 160; x++) {
          const a = pixels[(y * 160 + x) * 4 + 3]!;
          alpha += a;
          max = Math.max(max, a);
          if (a > 4) {
            count++;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      const center = Array.from(pixels.slice((50 * 160 + 50) * 4, (50 * 160 + 50) * 4 + 4));
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 100;
      canvas.getContext('2d')!.drawImage(output, 0, 0);
      const png = canvas.toDataURL();
      painter.dispose();
      painter.dispose();
      image.close();
      return { alpha, count, max, left, right, top, bottom, center, png };
    }, kind);
  }
  it('retains the artwork colors, alpha and hotspot at contact', async () => {
    const result = await render('flat');
    expect(result.center).toEqual([239, 187, 136, 255]);
    expect(result.alpha).toBeCloseTo(24 * 24 * 255, -2);
    expect((result.left + result.right) / 2).toBe(49.5);
    expect((result.top + result.bottom) / 2).toBe(49.5);
    expect(result.right - result.left).toBeLessThanOrEqual(25);
  });
  it('normalizes sixteen exposures without thickening the cursor', async () => {
    const [flat, blur] = await Promise.all([render('flat'), render('blur')]);
    expect(blur.alpha / flat.alpha).toBeGreaterThan(0.94);
    expect(blur.alpha / flat.alpha).toBeLessThan(1.06);
    expect(blur.max).toBeLessThan(110);
    expect(blur.right - blur.left).toBeGreaterThan(90);
  });
  it('keeps transparent holes open', async () => {
    expect((await render('hole')).center[3]).toBe(0);
  });
  it('lights an extruded volume and projects its silhouette', async () => {
    const [flat, volume] = await Promise.all([render('flat'), render('volume')]);
    expect(volume.center[3]).toBe(255);
    expect(volume.center[0]).not.toBe(flat.center[0]);
    expect(volume.count).toBeGreaterThan(flat.count);
    expect(volume.right - volume.left).toBeGreaterThanOrEqual(flat.right - flat.left);
  });
  it('composes a soft shadow under the opaque face', async () => {
    const [flat, shadow] = await Promise.all([render('flat'), render('shadow')]);
    expect(shadow.center).toEqual(flat.center);
    expect(shadow.alpha).toBeGreaterThan(flat.alpha);
  });
  it('rejects unavailable, unbounded and invalid geometry explicitly', async () => {
    const results = await page.evaluate(async () => {
      const { CursorGpuPainter } = await new Function('path', 'return import(path)')(
        '/packages/runtime/src/cursor/cursor-gpu-painter.ts',
      );
      const source = new OffscreenCanvas(2, 2);
      source.getContext('2d');
      const image = source.transferToImageBitmap(),
        painter = new CursorGpuPainter();
      const base = {
        image,
        geometry: { width: 32, height: 32, hotspot: { x: 0, y: 0 } },
        samples: [{ x: 10, y: 10, weight: 1 }],
        resolution: 1,
        shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
      };
      const cases = [
        { ...base, samples: [] },
        { ...base, samples: [{ x: NaN, y: 0, weight: 1 }] },
        { ...base, samples: [{ x: 0, y: 0, weight: 0 }] },
        { ...base, geometry: { ...base.geometry, width: 1e9 } },
        { ...base, volume: { pitch: 5, yaw: 0, height: 0 } },
      ];
      const errors = cases.map((options) => {
        try {
          painter.render(options);
          return false;
        } catch {
          return true;
        }
      });
      const gl = painter.canvas.getContext('webgl2')!;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
      try {
        painter.render(base);
        errors.push(false);
      } catch {
        errors.push(true);
      }
      painter.dispose();
      image.close();
      return errors;
    });
    expect(results).toEqual(Array(6).fill(true));
  });
  it('renders real cursor artwork, type changes and a complete comparison frame', async () => {
    const png = await page.evaluate(async () => {
      const { CursorGpuPainter } = await new Function('path', 'return import(path)')(
        '/packages/runtime/src/cursor/cursor-gpu-painter.ts',
      );
      const painter = new CursorGpuPainter(),
        canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 440;
      const target = canvas.getContext('2d')!;
      target.fillStyle = '#272733';
      target.fillRect(0, 0, 1000, 440);
      const images: HTMLImageElement[] = [];
      for (const type of ['default', 'handpointing', 'textcursor']) {
        const image = new Image();
        image.src = `/macOsSvgCursors/${type}.svg`;
        await image.decode();
        images.push(image);
      }
      const modes = ['2D', '3D hover', '3D contact', '3D motion blur'];
      target.font = '20px sans-serif';
      target.fillStyle = 'white';
      for (let column = 0; column < 4; column++) {
        target.fillText(modes[column]!, column * 250 + 25, 40);
        for (let row = 0; row < 3; row++) {
          const image = images[row]!,
            unit = 70,
            geometry = {
              width: unit,
              height: (unit * image.naturalHeight) / image.naturalWidth,
              hotspot: { x: 10, y: 10 },
            };
          const samples =
            column === 3
              ? Array.from({ length: 16 }, (_, index) => ({
                  x: column * 250 + 80 + index * 5,
                  y: 90 + row * 110,
                  weight: 1 / 16,
                }))
              : [{ x: column * 250 + 100, y: 90 + row * 110, weight: 1 }];
          const result = painter.render({
            image,
            geometry,
            samples,
            resolution: 2,
            shadow: { enabled: true, blur: 5, color: '#00000099', direction: 'bottom' },
            ...(column ? { volume: { pitch: 0.22, yaw: -0.25, height: column === 2 ? 0 : 0.32 } } : {}),
          });
          target.drawImage(result.canvas, result.x, result.y, result.width, result.height);
        }
      }
      painter.dispose();
      return canvas.toDataURL();
    });
    await writeFile('/tmp/beam-cursor-volume-preview.png', Buffer.from(png.split(',')[1]!, 'base64'));
    expect(png.length).toBeGreaterThan(2000);
  }, 30_000);
  it('projects orbit marker positions consistently with editor hit geometry', async () => {
    const error = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)');
      const { WebGlPerspectiveProjector } = await load('/packages/runtime/src/zoom/webgl-perspective-projector.ts');
      const { projectPerspectivePoint } = await load('/packages/engine/src/zoom/perspective-projection.ts');
      const { orbitCameraPose } = await load('/packages/engine/src/zoom/orbit-camera.ts');
      const canvas = new OffscreenCanvas(384, 216),
        ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 384, 216);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(180, 94, 8, 8);
      const transform = {
        tiltX: 0,
        tiltY: 0,
        orbit: orbitCameraPose({
          timeMs: 0,
          weight: 1,
          intensity: 1,
          scale: 1.8,
          fixed: { cx: 0.8, cy: 0.2 },
          pointAt: () => null,
        }),
      };
      const projector = new WebGlPerspectiveProjector();
      const rendered = projector.render(canvas, 384, 216, transform);
      const read = new OffscreenCanvas(384, 216),
        out = read.getContext('2d')!;
      out.drawImage(rendered, 0, 0);
      const pixels = out.getImageData(0, 0, 384, 216).data;
      let x = 0,
        y = 0,
        count = 0;
      for (let row = 0; row < 216; row++)
        for (let column = 0; column < 384; column++) {
          const p = (row * 384 + column) * 4;
          if (pixels[p]! > 180 && pixels[p + 1]! < 30) {
            x += column + 0.5;
            y += row + 0.5;
            count++;
          }
        }
      const projected = projectPerspectivePoint({ x: 184, y: 98 }, { x: 0, y: 0, width: 384, height: 216 }, transform);
      projector.dispose();
      if (!count) throw new Error('Orbit marker disappeared.');
      return Math.hypot(x / count - projected.x, y / count - projected.y);
    });
    expect(error).toBeLessThan(1);
  });
  it('matches an isolated OpenScreen-style exposure for a magnified resize cursor', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof import('@beam/runtime/cursor/cursor-gpu-painter')>;
      const { CursorGpuPainter } = await load('/packages/runtime/src/cursor/cursor-gpu-painter.ts');
      const image = new Image();
      image.src = '/macOsSvgCursors/resizenortheastsouthwest.svg';
      await image.decode();
      const size = 512,
        geometry = { width: 160, height: 160, hotspot: { x: 80, y: 80 } };
      const samples = Array.from({ length: 16 }, (_, k) => ({
        x: 170 + (60 * k) / 15,
        y: 170 + (40 * k) / 15,
        weight: (0.25 + (0.75 * k) / 15) / (16 * 0.625),
      }));
      const reference = new OffscreenCanvas(size, size),
        ref = reference.getContext('2d')!;
      // OpenScreen: complete placements between previous/current, normalized weights, isolated additive accumulation.
      ref.globalCompositeOperation = 'lighter';
      for (const sample of samples) {
        ref.globalAlpha = sample.weight;
        ref.drawImage(image, sample.x - 80, sample.y - 80, 160, 160);
      }
      const painter = new CursorGpuPainter(),
        surface = painter.render({
          image,
          geometry,
          samples,
          resolution: 2,
          shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
        });
      const actual = new OffscreenCanvas(size, size),
        ctx = actual.getContext('2d')!;
      ctx.drawImage(surface.canvas, surface.x, surface.y, surface.width, surface.height);
      const a = ctx.getImageData(0, 0, size, size).data,
        b = ref.getImageData(0, 0, size, size).data;
      let error = 0,
        energy = 0;
      for (let index = 3; index < a.length; index += 4) {
        error += Math.abs(a[index]! - b[index]!);
        energy += b[index]!;
      }
      const canvas = document.createElement('canvas');
      canvas.width = size * 2;
      canvas.height = size;
      const out = canvas.getContext('2d')!;
      out.fillStyle = '#eee1de';
      out.fillRect(0, 0, size * 2, size);
      out.drawImage(actual, 0, 0);
      out.drawImage(reference, size, 0);
      painter.dispose();
      return { relativeError: error / energy, png: canvas.toDataURL() };
    });
    await writeFile('/tmp/beam-resize-blur-reference.png', Buffer.from(result.png.split(',')[1]!, 'base64'));
    expect(result.relativeError).toBeLessThan(0.05);
  }, 30_000);
});
