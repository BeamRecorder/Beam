// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';
import type * as CompositionDockBrowserHostModule from './composition-dock-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('Composition floating layer and titlebar docking', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string, url: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-composition-dock-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'dock-test',
          configureServer(server) {
            server.middlewares.use('/beam-dock-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Composition dock test</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test server');
    url = `http://127.0.0.1:${address.port}/beam-dock-test`;
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
    await page.setViewport({ width: 1600, height: 900 });
  }, 30_000);
  afterEach(async () => {
    await page?.mouse.reset();
    await page?.emulateMediaFeatures([]);
  });
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  const mount = async (reset = true) => {
    await page.goto(url);
    await page.evaluate(async (reset) => {
      document.documentElement.style.removeProperty('--ui-scale-topbar');
      if (reset) localStorage.removeItem('beam-dock-test-preferences');
      let settings = {
        schemaVersion: 3,
        shortcuts: {},
        extras: JSON.parse(localStorage.getItem('beam-dock-test-preferences') ?? '{}'),
      };
      Object.defineProperty(window, 'capture', {
        configurable: true,
        value: {
          getPreferences: async () => settings,
          onPreferencesChanged: () => () => {},
          updatePreferences: async (patch: { extras?: Record<string, unknown> }) => {
            settings = { ...settings, extras: { ...settings.extras, ...patch.extras } };
            localStorage.setItem('beam-dock-test-preferences', JSON.stringify(settings.extras));
            return settings;
          },
        },
      });
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { mountCompositionDock } = (await load(
        '/apps/desktop/src/components/screenshot/composition/tests/composition-dock-browser-host.ts',
      )) as typeof CompositionDockBrowserHostModule;
      await mountCompositionDock();
    }, reset);
    await page.waitForSelector('.screenshot-composition:not(.positioning)');
  };
  const header = async () => {
    const box = await page.$eval('.composition-toggle', (element) => element.getBoundingClientRect().toJSON());
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const settled = () =>
    page.waitForFunction(() => document.querySelector('.composition-motion')?.getAnimations().length === 0);

  it('keeps the complete floating panel clickable over the Properties inspector', async () => {
    await mount();
    const from = await header();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(160, 200, { steps: 12 });
    await page.mouse.up();
    const frontmost = await page.$eval('.composition-toggle', (element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.left + 20, box.top + 20)?.closest('.composition-toggle') === element;
    });
    expect(frontmost).toBe(true);
    const bounds = await page.$eval('.composition-toggle', (element) => element.getBoundingClientRect().toJSON());
    expect(bounds.x).toBeLessThan(320);
    expect(bounds.y).toBeGreaterThan(40);
    await page.screenshot({ path: '/tmp/beam-composition-above-properties.png' });
  }, 30_000);

  it('morphs into the titlebar, restores after reload, and drags back out with saved placement', async () => {
    await mount();
    const nameBefore = await page.$eval('.test-project-name', (element) => element.getBoundingClientRect().toJSON());
    const from = await header();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 10, from.y + 10, { steps: 2 });
    await page.waitForSelector('.composition-dock-target:not([style*="display: none"])');
    const target = await page.$eval('.composition-dock-target', (element) => element.getBoundingClientRect().toJSON());
    expect(await page.$eval('.test-project-name', (element) => element.getBoundingClientRect().toJSON())).toEqual(
      nameBefore,
    );
    expect(await page.$eval('.composition-dock-target', (element) => getComputedStyle(element).borderTopStyle)).toBe(
      'dashed',
    );
    const preview = await page.$eval('.composition-dock-target .composition-heading', (element) => element.textContent);
    expect(preview).toContain('Composition');
    expect(preview).toContain('7');
    for (const offset of [-10, 10, 0]) {
      await page.mouse.move(target.x + target.width / 2 + offset, target.y + target.height / 2, { steps: 6 });
      const current = await page.$eval('.composition-dock-target', (element) =>
        element.getBoundingClientRect().toJSON(),
      );
      expect(current.x).toBe(target.x);
      expect(current.width).toBe(180);
    }
    await page.screenshot({ path: '/tmp/beam-composition-dock-preview.png' });
    await page.mouse.up();
    await page.waitForSelector('.screenshot-composition.docked');
    await settled();
    const alignment = await page.evaluate(() => {
      const panel = document.querySelector('.composition-toggle')!.getBoundingClientRect();
      const target = document.querySelector('.composition-dock-target')!.getBoundingClientRect();
      const name = document.querySelector('.test-project-name')!.getBoundingClientRect();
      return {
        x: panel.x - target.x,
        y: panel.y - target.y,
        width: panel.width,
        height: panel.height,
        gap: name.x - panel.right,
      };
    });
    expect(Math.abs(alignment.x)).toBeLessThan(1);
    expect(Math.abs(alignment.y)).toBeLessThan(1);
    expect(alignment.height).toBe(28);
    expect(alignment.width).toBe(180);
    expect(alignment.gap).toBeGreaterThanOrEqual(4);
    expect(await page.$eval('.test-project-name', (element) => element.getBoundingClientRect().toJSON())).toEqual(
      nameBefore,
    );
    const dockedTarget = await page.$eval('.composition-dock-target', (element) =>
      element.getBoundingClientRect().toJSON(),
    );
    expect(dockedTarget).toEqual(target);
    expect(await page.$eval('.composition-toggle .composition-heading', (element) => element.textContent)).toBe(
      preview,
    );
    await page.click('.composition-toggle');
    await page.waitForSelector('.composition-content');
    expect(await page.$('.editor-titlebar.is-dismissible')).not.toBeNull();
    await page.screenshot({ path: '/tmp/beam-composition-docked.png' });
    await page.keyboard.press('Escape');
    await mount(false);
    expect(await page.$('.screenshot-composition.docked')).not.toBeNull();
    const start = await header();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(800, 300, { steps: 20 });
    await page.mouse.up();
    await page.waitForSelector('.screenshot-composition:not(.docked)');
    await settled();
    const before = await page.$eval('.composition-toggle', (element) => element.getBoundingClientRect().toJSON());
    await mount(false);
    const after = await page.$eval('.composition-toggle', (element) => element.getBoundingClientRect().toJSON());
    expect(Math.abs(before.x - after.x)).toBeLessThan(1);
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  }, 30_000);

  it.each(['light', 'dark'])(
    'pulses only the dashed drop hint without shifting its content in %s',
    async (theme) => {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await mount();
      await page.evaluate((theme) => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      const from = await header();
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(20, 3, { steps: 12 });
      const pulse = await page.evaluate(async () => {
        const target = document.querySelector('.composition-dock-target')!;
        const animation = target
          .getAnimations({ subtree: true })
          .find(
            (animation) =>
              animation instanceof CSSAnimation && animation.animationName.includes('composition-dock-hint'),
          )!;
        const running = animation.playState;
        animation.pause();
        const sample = async (time: number) => {
          animation.currentTime = time;
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return {
            opacity: Number(getComputedStyle(target, '::after').opacity),
            border: getComputedStyle(target, '::after').borderTopStyle,
            rect: target.getBoundingClientRect().toJSON(),
            title: document.querySelector('.test-project-name')!.getBoundingClientRect().toJSON(),
            contentOpacity: getComputedStyle(target).opacity,
          };
        };
        const timing = animation.effect!.getTiming();
        return {
          running,
          duration: timing.duration,
          looping: timing.iterations === Infinity,
          low: await sample(0),
          high: await sample(600),
        };
      });
      expect(pulse.running).toBe('running');
      expect(pulse.duration).toBe(1200);
      expect(pulse.looping).toBe(true);
      expect(pulse.low.border).toBe('dashed');
      expect(pulse.high.opacity - pulse.low.opacity).toBeGreaterThan(0.7);
      expect(pulse.low.contentOpacity).toBe('1');
      expect(pulse.high.contentOpacity).toBe('1');
      expect(pulse.low.rect).toEqual(pulse.high.rect);
      expect(pulse.low.title).toEqual(pulse.high.title);
      await page.mouse.up();
      await page.waitForSelector('.screenshot-composition.docked');
      expect(
        await page.$eval(
          '.composition-dock-target',
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter(
                (animation) =>
                  animation instanceof CSSAnimation && animation.animationName.includes('composition-dock-hint'),
              ).length,
        ),
      ).toBe(0);
    },
    30_000,
  );

  it('keeps a static dashed hint with reduced motion and removes it when dragging is cancelled', async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await mount();
    const from = await header();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(20, 3, { steps: 12 });
    const hint = await page.$eval('.composition-dock-target', (element) => ({
      animations: element.getAnimations({ subtree: true }).length,
      border: getComputedStyle(element, '::after').borderTopStyle,
      opacity: getComputedStyle(element, '::after').opacity,
    }));
    expect(hint).toEqual({ animations: 0, border: 'dashed', opacity: '1' });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await page.$eval('.composition-dock-target', (element) => getComputedStyle(element).display)).toBe('none');
    expect(await page.$('.screenshot-composition.docked')).toBeNull();
    await page.emulateMediaFeatures([]);
  }, 30_000);

  it.each([
    { state: 'collapsed', top: true, bottom: true },
    { state: 'downward', top: true, bottom: false },
    { state: 'upward', top: false, bottom: true },
    { state: 'docked', top: true, bottom: true },
  ])(
    'matches header hover corners to the $state panel',
    async ({ state, top, bottom }) => {
      await mount();
      if (state === 'collapsed' || state === 'upward') await page.click('.composition-toggle');
      if (state === 'upward') {
        const from = await header();
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x, 760, { steps: 12 });
        await page.mouse.up();
        await page.click('.composition-toggle');
        await page.waitForSelector('.screenshot-composition.upward:not(.collapsed)');
      }
      if (state === 'docked') {
        await page.click('[aria-label="Dock composition in the title bar"]');
        await page.waitForSelector('.screenshot-composition.docked');
        await settled();
        await page.click('.composition-toggle');
      }
      const location = await header();
      await page.mouse.move(location.x, location.y);
      const corners = await page.$eval('.composition-header', (element) => {
        const style = getComputedStyle(element);
        return {
          hovered: element.matches(':hover'),
          background: style.backgroundColor,
          top: [style.borderTopLeftRadius, style.borderTopRightRadius].map(parseFloat),
          bottom: [style.borderBottomLeftRadius, style.borderBottomRightRadius].map(parseFloat),
          radius: parseFloat(getComputedStyle(element.parentElement!).borderTopLeftRadius),
        };
      });
      expect(corners.hovered).toBe(true);
      expect(corners.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(corners.top).toEqual([top ? corners.radius : 0, top ? corners.radius : 0]);
      expect(corners.bottom).toEqual([bottom ? corners.radius : 0, bottom ? corners.radius : 0]);
      await page.screenshot({ path: `/tmp/beam-composition-hover-${state}.png` });
    },
    30_000,
  );

  it('keeps a scaled dock and its popup inside a small editor and honors reduced motion', async () => {
    await page.setViewport({ width: 960, height: 600 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await mount();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui-scale-topbar', '1.25');
      document.querySelector<HTMLElement>('.screenshot-composition')!.style.zoom = '1.25';
    });
    await page.click('.composition-toggle');
    await page.click('[aria-label="Dock composition in the title bar"]');
    await page.waitForSelector('.screenshot-composition.docked');
    await page.click('.composition-toggle');
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.composition-toggle')!.getBoundingClientRect();
      const target = document.querySelector('.composition-dock-target')!.getBoundingClientRect();
      const popup = document.querySelector('.composition-content')!.getBoundingClientRect();
      return {
        dx: panel.x - target.x,
        dy: panel.y - target.y,
        bottom: popup.bottom,
        right: popup.right,
        left: popup.left,
        animations: document.querySelector('.composition-motion')!.getAnimations().length,
      };
    });
    expect(Math.abs(layout.dx)).toBeLessThan(1);
    expect(Math.abs(layout.dy)).toBeLessThan(1);
    expect(layout.bottom).toBeLessThanOrEqual(600);
    expect(layout.right).toBeLessThanOrEqual(960);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.animations).toBe(0);
    await page.setViewport({ width: 1600, height: 900 });
    await page.emulateMediaFeatures([]);
  }, 30_000);

  it.each(['light', 'dark'])(
    'gives Properties and floating/docked Composition the same subtle frost in %s',
    async (theme) => {
      await mount();
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        for (const el of document.querySelectorAll<HTMLElement>('.screenshot-editor,.workspace-upper'))
          el.style.background = 'repeating-linear-gradient(0deg, #000 0 4px, #fff 4px 8px)';
      }, theme);
      await page.addStyleTag({
        content:
          '.measure-frost > * { opacity:0 !important } .without-frost::before { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }',
      });
      const assertFrost = async (selector: string, pixels = true) => {
        const appearance = await page.$eval(selector, (element) => {
          const style = getComputedStyle(element, '::before');
          const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return {
            alpha: ctx.getImageData(0, 0, 1, 1).data[3],
            blur: style.backdropFilter,
            parentFilter: getComputedStyle(element).backdropFilter,
            opacity: getComputedStyle(element).opacity,
          };
        });
        expect(appearance.alpha).toBeGreaterThanOrEqual(244);
        expect(appearance.alpha).toBeLessThanOrEqual(246);
        expect(appearance.blur).toBe('blur(12px)');
        expect(appearance.parentFilter).toBe('none');
        expect(appearance.opacity).toBe('1');
        if (!pixels) return;
        await page.$eval(selector, (element) => element.classList.add('measure-frost'));
        const clip = await page.$eval(selector, (element) => {
          const rect = element.getBoundingClientRect();
          return { x: Math.ceil(rect.left) + 20, y: Math.ceil(rect.top) + 100, width: 4, height: 128 };
        });
        const contrast = async () => {
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
          const bytes = await page.screenshot({ clip });
          return page.evaluate(
            async (bytes) => {
              const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
                ctx = canvas.getContext('2d')!;
              ctx.drawImage(bitmap, 0, 0);
              bitmap.close();
              const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              const offset = canvas.width * 4 * 4;
              let difference = 0;
              for (let i = offset; i < pixels.length; i += 4) difference += Math.abs(pixels[i]! - pixels[i - offset]!);
              return difference / ((pixels.length - offset) / 4);
            },
            [...bytes],
          );
        };
        const blurred = await contrast();
        await page.$eval(selector, (element) => element.classList.add('without-frost'));
        const sharp = await contrast();
        expect(sharp, `${selector} needs measurable translucency`).toBeGreaterThan(5);
        expect(blurred, `${selector} must blur its actual backdrop`).toBeLessThan(sharp * 0.45);
        await page.$eval(selector, (element) => element.classList.remove('measure-frost', 'without-frost'));
      };
      await settled();
      await assertFrost('.properties-island');
      if (!(await page.$('.composition-content'))) await page.click('.composition-toggle');
      await assertFrost('.composition-surface');
      await page.click('[aria-label="Dock composition in the title bar"]');
      await page.waitForSelector('.screenshot-composition.docked');
      await settled();
      await page.click('.composition-toggle');
      await page.waitForSelector('.composition-content');
      await assertFrost('.composition-surface', false);
      await assertFrost('.composition-content');
      await page.screenshot({ path: `/tmp/beam-panels-subtle-blur-${theme}.png` });
    },
    30_000,
  );

  it('makes both panels opaque when reduced transparency is requested', async () => {
    await mount();
    const session = await page.createCDPSession();
    try {
      await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
      });
      for (const selector of ['.properties-island', '.composition-surface']) {
        const appearance = await page.$eval(selector, (element) => {
          const style = getComputedStyle(element, '::before');
          const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return { alpha: ctx.getImageData(0, 0, 1, 1).data[3], blur: style.backdropFilter };
        });
        expect(appearance).toEqual({ alpha: 255, blur: 'none' });
      }
    } finally {
      await session.send('Emulation.setEmulatedMedia', { features: [] });
      await session.detach();
    }
  }, 30_000);

  it.each([20, 1550])(
    'docks when released at titlebar x=%s without hitting the small preview',
    async (x) => {
      await mount();
      const from = await header();
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(x, 3, { steps: 15 });
      await page.mouse.up();
      await page.waitForSelector('.screenshot-composition.docked');
      await settled();
      expect(await page.$('.screenshot-composition.docked')).not.toBeNull();
    },
    30_000,
  );
});
