// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../apps/cli/src/chromium-install';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('packaged overlay styles', () => {
  let server: PreviewServer, browser: Browser, page: Page, directory: string, origin: string;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    directory = await mkdtemp(resolve(tmpdir(), 'beam-packaged-overlay-'));
    const outDir = resolve(directory, 'dist');
    // Exercise the real production bootstrap and CSS splitting, not Vite's dev server.
    await build({
      configFile: resolve(root, 'vite.config.ts'),
      logLevel: 'silent',
      build: {
        outDir,
        copyPublicDir: false,
        rollupOptions: { input: { main: resolve(root, 'apps/desktop/html/index.html') } },
      },
    });
    server = await preview({
      configFile: false,
      root: resolve(root, 'apps/desktop'),
      build: { outDir },
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0 },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No packaged overlay test port');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      userDataDir: resolve(directory, 'profile'),
      args: ['--no-sandbox'],
    });
  }, 30000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    if (server) await new Promise<void>((done) => server.httpServer.close(() => done()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const openOverlay = async (width: number, height: number, query = 'cameraOverlay=1') => {
    await page?.close();
    page = await browser.newPage();
    await page.setViewport({ width: 217, height: 185 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.evaluateOnNewDocument(
      (width, height) => {
        let recording = false;
        let hover: ((hovered: boolean) => void) | undefined;
        Object.defineProperty(window, 'capture', {
          value: {
            getPreferences: async () => ({ theme: 'dark', extras: { locale: 'en' } }),
            onPreferencesChanged: () => () => undefined,
            onCameraOverlayState: () => () => undefined,
            onCameraOverlayHover: (listener: typeof hover) => {
              hover = listener;
              return () => undefined;
            },
            onCameraOverlayRecordingCommand: () => () => undefined,
            notifyCameraOverlayReady: () => undefined,
            getCameraOverlayState: async () => ({ cameraId: 'camera:chromium:fixture' }),
            status: async () => ({ state: recording ? 'recording' : 'idle' }),
            configureCameraOverlay: () => {
              throw new Error('Unexpected camera failure');
            },
            onQuickSnipSettingsContent: (listener: (content: object) => void) => {
              queueMicrotask(() => listener({ side: 'above', anchorX: 108, device: null, visible: true }));
              return () => undefined;
            },
            onQuickSnipConfigure: () => () => undefined,
            fitQuickSnipSettings: () => undefined,
            notifyQuickSnipSettingsReady: () => undefined,
          },
        });
        window.addEventListener('beam-test-recording', () => {
          recording = true;
          hover?.(true);
        });
        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: async () => {
              const source = document.createElement('canvas');
              source.width = width;
              source.height = height;
              const ctx = source.getContext('2d')!;
              const draw = () => {
                ctx.fillStyle = '#666';
                ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = '#f00';
                ctx.fillRect(0, 0, width * 0.12, height);
                ctx.fillStyle = '#0f0';
                ctx.fillRect(width * 0.88, 0, width * 0.12, height);
                ctx.fillStyle = '#ff0';
                ctx.fillRect(width * 0.12, 0, width * 0.76, height * 0.12);
                ctx.fillStyle = '#00f';
                ctx.fillRect(width * 0.12, height * 0.88, width * 0.76, height * 0.12);
                requestAnimationFrame(draw);
              };
              draw();
              return source.captureStream(30);
            },
          },
        });
      },
      width,
      height,
    );
    await page.goto(`${origin}/html/index.html?${query}`);
    try {
      if (query === 'cameraOverlay=1')
        await page.waitForFunction(
          () => {
            const video = document.querySelector('video');
            return video && video.readyState >= 2 && !document.querySelector('.camera-overlay-skeleton');
          },
          { timeout: 10000 },
        );
      else await page.waitForSelector('.quick-settings-window', { timeout: 10000 });
    } catch (error) {
      throw new Error(errors.join('\n') || String(error));
    }
  };

  const expectWholeFrame = async (width: number, height: number) => {
    const video = await page.$('.camera-overlay-video');
    if (!video) throw new Error('Native camera preview missing');
    const layout = await video.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, fit: getComputedStyle(element).objectFit };
    });
    const viewport = page.viewport();
    if (!viewport) throw new Error('Camera preview viewport unavailable');
    expect(layout).toEqual({ width: viewport.width, height: viewport.height, fit: 'contain' });
    const png = await page.screenshot();
    const edges = await page.evaluate(
      async ({ url, width, height }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const scale = Math.min(canvas.width / width, canvas.height / height);
        const x = (canvas.width - width * scale) / 2,
          y = (canvas.height - height * scale) / 2;
        const read = (px: number, py: number) =>
          [...ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data].slice(0, 3);
        return [
          read(x + width * 0.06 * scale, canvas.height / 2),
          read(x + width * 0.94 * scale, canvas.height / 2),
          read(canvas.width / 2, y + height * 0.06 * scale),
          read(canvas.width / 2, y + height * 0.94 * scale),
        ];
      },
      { url: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), width, height },
    );
    expect(edges).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
    ]);
  };

  it.each([
    [640, 480],
    [640, 360],
    [360, 640],
  ])('fits the complete %s × %s camera on its first packaged paint', async (width, height) => {
    await openOverlay(width, height);
    await expectWholeFrame(width, height);
    const styles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href),
    );
    expect(styles.some((url) => /CameraOverlayApp-.*\.css$/.test(url))).toBe(true);
    expect(styles.some((url) => /QuickSnipCropBar-.*\.css$/.test(url))).toBe(false);
  });
  it('keeps the complete packaged preview during recording and hover', async () => {
    await openOverlay(640, 480);
    await page.evaluate(() => window.dispatchEvent(new Event('beam-test-recording')));
    await page.waitForSelector('.camera-overlay-container.is-recording.is-hovered');
    await expectWholeFrame(640, 480);
  });
  it('scales the complete packaged camera when its native viewport is resized', async () => {
    await openOverlay(640, 480);
    await page.setViewport({ width: 360, height: 180 });
    await expectWholeFrame(640, 480);
    await page.setViewport({ width: 150, height: 300 });
    await expectWholeFrame(640, 480);
  });
  it('loads Quick Snip settings styles without loading camera or Crop Bar content', async () => {
    await openOverlay(640, 480, 'quickSnipSettings=1');
    const styles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href),
    );
    expect(styles.some((url) => /QuickSnipSettings-.*\.css$/.test(url))).toBe(true);
    expect(styles.some((url) => /CameraOverlayApp-.*\.css$/.test(url))).toBe(false);
    expect(styles.some((url) => /QuickSnipCropBar-.*\.css$/.test(url))).toBe(false);
    expect(await page.$('.camera-overlay-video')).toBeNull();
    expect(await page.$('.quick-snip-selection-bar')).toBeNull();
  });
});
