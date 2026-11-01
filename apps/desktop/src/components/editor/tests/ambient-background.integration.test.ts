// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page, type CDPSession } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../cli/src/chromium-settings';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type * as AmbientHost from './ambient-background-browser-host';
import type * as ScreenshotViewportHost from '../../screenshot/tests/screenshot-viewport-browser-host';

const color: BackgroundValue = { id: 'color', name: 'Blue', kind: 'color', color: '#143a5f' },
  gradient: BackgroundValue = {
    id: 'gradient',
    name: 'Gradient',
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { id: 'a', color: '#143a5f', alpha: 1, position: 0 },
        { id: 'b', color: '#db6729', alpha: 1, position: 1 },
      ],
    },
  },
  image: BackgroundValue = {
    id: 'image',
    name: 'Blue image',
    kind: 'image',
    extension: 'svg',
    path: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#143a5f" d="M0 0h32v32H0z"/></svg>')}`,
  };

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('Screenshot margins in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string, emulation: CDPSession;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-ambient-background-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['vue', 'vue-i18n', '@vueuse/core', '@lucide/vue'] },
      plugins: [
        {
          name: 'ambient-test',
          configureServer(server) {
            server.middlewares.use('/beam-ambient-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><title>Screenshot margins</title><style>*,*::before,*::after{animation:none!important;transition:none!important}</style>',
              );
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
      userDataDir: resolve(temporary, 'profile'),
      args: chromiumSettings().args,
      env: { ...env, TMPDIR: temporary },
    });
    page = await browser.newPage();
    emulation = await page.createCDPSession();
    await page.setViewport({ width: 900, height: 500 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-ambient-test`);
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  const mount = (background: BackgroundValue | null, variant: 'ambient' | 'canvas-extension') =>
    page.evaluate(
      async ({ background, variant }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { mountAmbientBackground } = (await load(
          '/apps/desktop/src/components/editor/tests/ambient-background-browser-host.ts',
        )) as typeof AmbientHost;
        return mountAmbientBackground(background, variant);
      },
      { background, variant },
    );

  const marginPixels = async () => {
    const png = await page.screenshot({ encoding: 'base64' });
    return page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = new OffscreenCanvas(900, 500),
        ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return [
        [4, 44],
        [896, 44],
        [4, 496],
        [896, 496],
      ].map(([x, y]) => [...ctx.getImageData(x!, y!, 1, 1).data]);
    }, png);
  };

  it.each([color, gradient, image])(
    'paints $kind margins in both themes without changing the output pixels or geometry',
    async (background) => {
      for (const dark of [false, true])
        for (const reduced of [false, true]) {
          await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark);
          await emulation.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-transparency', value: reduced ? 'reduce' : 'no-preference' }],
          });
          expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(reduced);
          const before = await mount(background, 'ambient'),
            pale = await marginPixels();
          if (background.kind === 'gradient' && !dark && !reduced)
            await page.screenshot({ path: '/tmp/beam-screenshot-margins-before.png' });
          const after = await mount(background, 'canvas-extension'),
            extended = await marginPixels();
          if (background.kind === 'gradient' && !dark && !reduced)
            await page.screenshot({ path: '/tmp/beam-screenshot-margins-after.png' });
          expect(after).toEqual(before);
          expect(after.bounds.x).toBeGreaterThan(20);
          // Chromium lays out fractional CSS sizes on a 1/64 px grid.
          expect(Math.abs(after.bounds.width - (after.bounds.height * 16) / 9)).toBeLessThan(1 / 32);
          for (let corner = 0; corner < 4; corner++) {
            expect(extended[corner]![3]).toBe(255);
            expect(extended[corner]!.slice(0, 3)).not.toEqual(pale[corner]!.slice(0, 3));
            if (background.kind !== 'gradient') expect(extended[corner]!.slice(0, 3)).toEqual([20, 58, 95]);
          }
        }
    },
  );

  it('uses an opaque theme surface when the screenshot background is hidden', async () => {
    await mount(null, 'canvas-extension');
    expect(
      await page.$eval('.editor-ambient-background', (element) => element.classList.contains('is-canvas-extension')),
    ).toBe(false);
    for (const pixel of await marginPixels()) expect(pixel[3]).toBe(255);
  });

  it('centers small captures at 100% and exposes real fit and actual-size zoom through View', async () => {
    await page.goto(page.url());
    const mountViewport = (width: number, height: number) =>
      page.evaluate(
        async ({ width, height }) => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const { mountScreenshotViewport } = (await load(
            '/apps/desktop/src/components/screenshot/tests/screenshot-viewport-browser-host.ts',
          )) as typeof ScreenshotViewportHost;
          await mountScreenshotViewport(width, height);
        },
        { width, height },
      );
    const bounds = () => page.$eval('#viewport-image', (element) => element.getBoundingClientRect().toJSON());
    const choose = async (actual: boolean) => {
      await page.click('button[aria-haspopup="menu"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await page.focus('[role="menuitemradio"]');
      if (actual) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    };
    await mountViewport(320, 200);
    await page.waitForSelector('button[aria-label="Canvas zoom: 100%"]');
    const small = await bounds();
    expect(small.width).toBe(320);
    expect(small.height).toBe(200);
    expect(small.x).toBe(290);
    expect(small.y).toBe(170);
    await mountViewport(2000, 1000);
    await page.waitForSelector('button[aria-label="Canvas zoom: 45%"]');
    const fitted = await bounds();
    expect(fitted.width).toBe(900);
    expect(fitted.height).toBe(450);
    await choose(true);
    await page.waitForSelector('button[aria-label="Canvas zoom: 100%"]');
    expect((await bounds()).width).toBe(2000);
    expect(await page.$eval('button[aria-haspopup="menu"]', (element) => document.activeElement === element)).toBe(
      true,
    );
    await page.setViewport({ width: 1000, height: 600 });
    expect((await bounds()).width).toBe(2000);
    await choose(false);
    await page.waitForSelector('button[aria-label="Canvas zoom: 50%"]');
    expect((await bounds()).width).toBe(1000);
    await page.screenshot({ path: '/tmp/beam-screenshot-view-menu.png' });
  }, 20_000);
});
