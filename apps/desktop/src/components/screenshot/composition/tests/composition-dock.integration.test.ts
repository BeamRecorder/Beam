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
      )) as typeof import('./composition-dock-browser-host');
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
    'keeps Properties and floating/docked Composition fully opaque in %s',
    async (theme) => {
      await mount();
      await page.evaluate((theme) => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      const assertOpaque = async (selector: string) => {
        const appearance = await page.$eval(selector, (element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            opacity: style.opacity,
            filter: style.backdropFilter,
            pseudo: getComputedStyle(element, '::before').content,
          };
        });
        expect(appearance.background).not.toContain('rgba');
        expect(appearance.background).not.toBe('transparent');
        expect(appearance.opacity).toBe('1');
        expect(appearance.filter).toBe('none');
        expect(appearance.pseudo).toBe('none');
        const clip = await page.$eval(selector, (element) => {
          const r = element.getBoundingClientRect();
          return {
            x: Math.ceil(r.x) + 10,
            y: Math.ceil(r.y) + 10,
            width: Math.floor(r.width) - 20,
            height: Math.floor(r.height) - 20,
          };
        });
        await page.evaluate(async (selector) => {
          await document.fonts.ready;
          document.querySelector(selector)!.classList.add('measure-panel-background');
        }, selector);
        await page.addStyleTag({ content: '.measure-panel-background > * { opacity: 0 !important; }' });
        const images = [];
        for (const color of ['black', 'white']) {
          await page.evaluate((color) => {
            for (const el of document.querySelectorAll<HTMLElement>('.screenshot-editor,.workspace-upper'))
              el.style.background = color;
          }, color);
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
          images.push(await page.screenshot({ clip }));
        }
        expect(
          Buffer.from(images[0]!).equals(Buffer.from(images[1]!)),
          `${selector} must hide changing media pixels`,
        ).toBe(true);
        await page.$eval(selector, (element) => element.classList.remove('measure-panel-background'));
      };
      await settled();
      await assertOpaque('.properties-island');
      await assertOpaque('.composition-surface');
      if (!(await page.$('.composition-content'))) await page.click('.composition-toggle');
      await page.click('[aria-label="Dock composition in the title bar"]');
      await page.waitForSelector('.screenshot-composition.docked');
      await settled();
      await page.click('.composition-toggle');
      await page.waitForSelector('.composition-content');
      await assertOpaque('.composition-surface');
      await assertOpaque('.composition-content');
      await page.screenshot({ path: `/tmp/beam-composition-opaque-${theme}.png` });
    },
    30_000,
  );
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
