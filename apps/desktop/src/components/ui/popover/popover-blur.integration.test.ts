// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../cli/src/chromium-settings';
import type * as PopoverBrowserHostModule from './tests/popover-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('floating menu blur in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-menu-blur-'));
    server = await createServer({
      root,
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'menu-test-page',
          configureServer(server) {
            server.middlewares.use('/beam-menu-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><html><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No server');
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
    await page.setViewport({ width: 900, height: 600 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-menu-test`);
    await page.evaluate(() =>
      Object.defineProperty(window, 'capture', {
        value: {
          getPreferences: async () => ({ extras: {}, accessibility: {} }),
          onPreferencesChanged: () => () => {},
        },
      }),
    );
    await page.addStyleTag({
      content:
        '.no-menu-blur :is(.popover-content,.context-menu-surface,.submenu-panel), .no-menu-blur :is(.popover-content,.context-menu-surface,.submenu-panel)::before { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }',
    });
    await page.addStyleTag({
      // Preserve item geometry and backgrounds while isolating the surface pixels.
      content: '.measure-menu-background :is(.menu-item,.context-menu-item) > * { visibility:hidden; }',
    });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  const contrast = async (selector: string, fraction: number, edge?: 'left' | 'right') => {
    const box = await page.$eval(
      selector,
      (element, { fraction, edge }) => {
        const rect = element.getBoundingClientRect();
        return {
          x:
            edge === 'left'
              ? Math.round(rect.left)
              : edge === 'right'
                ? Math.round(rect.right) - 1
                : Math.ceil(rect.left + (rect.width - 8) * fraction) + 3,
          y: Math.ceil(rect.top) + 12,
          width: edge ? 1 : 2,
          height: Math.floor(rect.height) - 24,
        };
      },
      { fraction, edge },
    );
    const png = await page.screenshot({ clip: box });
    return page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
          ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const values = [];
        for (let offset = 0; offset < pixels.length; offset += 4)
          values.push((pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!) / 3);
        // Adjacent 4 px stripes distinguish real blur from tint, without
        // counting the slowly changing shadows of overlapping menu panels.
        const stripeOffset = canvas.width * 4;
        let difference = 0;
        for (let index = stripeOffset; index < values.length; index++)
          difference += Math.abs(values[index]! - values[index - stripeOffset]!);
        return difference / (values.length - stripeOffset);
      },
      [...png],
    );
  };

  it.each([0.75, 1, 1.5].flatMap((scale) => ['up', 'down'].map((direction) => ({ scale, direction }))))(
    'keeps compact Select menus close at scale $scale opening $direction',
    async ({ scale, direction }) => {
      await page.evaluate(
        async ({ scale, direction }) => {
          const load = new Function('path', 'return import(path)') as (
            path: string,
          ) => Promise<typeof PopoverBrowserHostModule>;
          const host = await load('/apps/desktop/src/components/ui/popover/tests/popover-browser-host.ts');
          await host.mountCompactSelect(scale, direction as 'up' | 'down');
        },
        { scale, direction },
      );
      await page.click('.select-trigger');
      await page.waitForSelector('.popover-content');
      await page.waitForFunction(() => {
        const panel = document.querySelector('.popover-content');
        return (
          panel && getComputedStyle(panel).visibility === 'visible' && getComputedStyle(panel).transform === 'none'
        );
      });
      const geometry = await page.evaluate((direction) => {
        const trigger = document.querySelector('.select-trigger')!.getBoundingClientRect();
        const menu = document.querySelector('.popover-content')!.getBoundingClientRect();
        const option = document.querySelector('[role="option"]')!.getBoundingClientRect();
        return {
          gap: direction === 'down' ? menu.top - trigger.bottom : trigger.top - menu.bottom,
          row: option.height,
        };
      }, direction);
      expect(geometry.gap).toBeCloseTo(4, 1);
      expect(geometry.row).toBe(28);
    },
    30000,
  );
  const cases = ([false, true] as const).flatMap((gpu) =>
    (['light', 'dark'] as const).flatMap((theme) =>
      (['add', 'canvas', 'context'] as const).map((kind) => ({ theme, kind, gpu })),
    ),
  );
  it.each(cases)(
    'blurs $kind over real canvas pixels ($theme, WebGL=$gpu)',
    async ({ theme, kind, gpu }) => {
      await page.mouse.move(0, 0);
      await page.evaluate(
        async ({ kind, theme, gpu }) => {
          document.documentElement.classList.remove('no-menu-blur');
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const host = (await load(
            '/apps/desktop/src/components/ui/popover/tests/popover-browser-host.ts',
          )) as typeof PopoverBrowserHostModule;
          await host.mountMenus(kind, theme, gpu);
        },
        { kind, theme, gpu },
      );
      const root = kind === 'add' ? '.popover-content' : '.context-menu-surface';
      await page.waitForFunction(
        (selector) => {
          const surface = document.querySelector(selector);
          return (
            surface &&
            getComputedStyle(surface).position === 'fixed' &&
            ![...surface.classList].some((name) => name.endsWith('enter-active')) &&
            document.getAnimations().length === 0
          );
        },
        {},
        root,
      );
      // Measure borders before opening a submenu: an overlapping submenu would
      // add its own tint/blur and hide the parent's right-hand border.
      if (kind === 'add') {
        const edges = ['left', 'right'] as const;
        const blurredEdges = await Promise.all(edges.map((edge) => contrast(root, 0, edge)));
        await page.evaluate(() => document.documentElement.classList.add('no-menu-blur'));
        const sharpEdges = await Promise.all(edges.map((edge) => contrast(root, 0, edge)));
        await page.evaluate(() => document.documentElement.classList.remove('no-menu-blur'));
        for (let index = 0; index < edges.length; index++) {
          expect(sharpEdges[index], `${theme} ${edges[index]} border transparency`).toBeGreaterThan(3);
          expect(blurredEdges[index], `${theme} ${edges[index]} border blur`).toBeLessThan(sharpEdges[index]! * 0.45);
        }
      }
      const selectors = [root];
      if (kind !== 'context') {
        await page.$eval(`${root} .menu-item[aria-haspopup="menu"]`, (element) =>
          (element as HTMLButtonElement).focus(),
        );
        await page.keyboard.press('ArrowRight');
        await page.waitForSelector('.submenu-panel');
        selectors.push('.submenu-panel');
      }
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        document.documentElement.classList.add('measure-menu-background');
      });
      const positions = selectors.flatMap((selector) =>
        [0, 0.25, 0.5, 0.75].map((fraction) => ({
          selector,
          fraction,
          edge: undefined as 'left' | 'right' | undefined,
        })),
      );
      const blurred: number[] = [];
      for (const { selector, fraction, edge } of positions) blurred.push(await contrast(selector, fraction, edge));
      await page.evaluate(() => document.documentElement.classList.add('no-menu-blur'));
      const sharp: number[] = [];
      for (const { selector, fraction, edge } of positions) sharp.push(await contrast(selector, fraction, edge));
      console.info('Menu blur contrast:', { theme, kind, gpu, blurred, sharp });
      for (let index = 0; index < positions.length; index++) {
        const position = positions[index]!;
        expect(sharp[index], `${kind} ${position.selector} ${position.fraction} transparency`).toBeGreaterThan(3);
        expect(blurred[index], `${kind} ${position.selector} ${position.fraction} blur`).toBeLessThan(
          sharp[index]! * 0.45,
        );
      }
    },
    30000,
  );
});
