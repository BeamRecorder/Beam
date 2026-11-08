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
import type * as Host from './screenshot-dock-crop-browser-host';
import type * as PropertiesHost from './screenshot-properties-browser-host';
import type * as AssetContextHost from '../../editor/elements/tests/element-asset-context-browser-host';
import type { PreferencePatch } from '../../../api/types/capture-api';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('custom dock and crop in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string, url: string;
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-dock-crop-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@lucide/vue'] },
      plugins: [
        {
          name: 'dock-crop-test',
          configureServer(server) {
            server.middlewares.use('/beam-dock-crop-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Dock and crop</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test server');
    url = `http://127.0.0.1:${address.port}/beam-dock-crop-test`;
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
    await page.setViewport({ width: 1080, height: 720 });
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  const mount = async (reset: boolean) => {
    await page.goto(url);
    await page.evaluate(async (reset) => {
      if (reset) localStorage.removeItem('dock-crop-preferences');
      const settings = {
        schemaVersion: 3,
        shortcuts: {},
        extras: JSON.parse(localStorage.getItem('dock-crop-preferences') ?? '{}') as Record<string, unknown>,
      };
      Object.defineProperty(window, 'capture', {
        configurable: true,
        value: {
          getPreferences: async () => structuredClone(settings),
          onPreferencesChanged: () => () => {},
          updatePreferences: async (patch: PreferencePatch) => {
            Object.assign(settings.extras, patch.extras);
            localStorage.setItem('dock-crop-preferences', JSON.stringify(settings.extras));
            return structuredClone(settings);
          },
        },
      });
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { mountDockCropFixture } = (await load(
        '/apps/desktop/src/components/screenshot/tests/screenshot-dock-crop-browser-host.ts',
      )) as typeof Host;
      await mountDockCropFixture();
    }, reset);
    await page.waitForSelector('.screenshot-toolbar');
  };
  it('pins More selections across reloads, keeps Arrow by default and scrolls overflowing tools on hover', async () => {
    await mount(true);
    expect(await page.$('button[aria-label="Arrow"]')).not.toBeNull();
    expect(await page.$('.screenshot-toolbar button[aria-label="Group"]')).toBeNull();
    await page.hover('button[aria-label="More tools"]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="tooltip"]')].some((hint) => hint.textContent?.includes('More tools')),
    );
    await page.click('button[aria-label="More tools"]');
    await page.waitForSelector('[role="menuitem"]');
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('[role="tooltip"]')].some((hint) => hint.textContent?.includes('More tools')),
    );
    await page.mouse.move(5, 50);
    await page.hover('button[aria-label="More tools"]');
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 180)));
    expect(
      await page.$$eval('[role="tooltip"]', (hints) => hints.some((hint) => hint.textContent?.includes('More tools'))),
    ).toBe(false);
    await page.$$eval('[role="menuitem"]', (buttons) =>
      (buttons.find((button) => button.textContent?.trim() === 'Blur') as HTMLButtonElement).click(),
    );
    await page.waitForSelector('.screenshot-toolbar button[aria-label="Blur"]');
    expect(await page.$eval('#fixture-state', (element) => element.getAttribute('data-added'))).toBe('blur');
    await mount(false);
    expect(await page.$('.screenshot-toolbar button[aria-label="Blur"]')).not.toBeNull();
    for (const kind of ['Highlight', 'Zoom', 'Cursor', 'Group', 'Ungroup']) {
      await page.click('button[aria-label="More tools"]');
      await page.waitForSelector('[role="menuitem"]');
      await page.$$eval(
        '[role="menuitem"]',
        (buttons, label) =>
          (buttons.find((button) => button.textContent?.trim() === label) as HTMLButtonElement).click(),
        kind,
      );
      await page.waitForSelector(`.screenshot-toolbar button[aria-label="${kind}"]`);
    }
    await page.$eval('.tool-scroll .scroll-shadow-viewport', (element) => {
      element.scrollLeft = 0;
    });
    await page.waitForSelector('button[aria-label="Scroll tools right"]');
    await page.hover('button[aria-label="Scroll tools right"]');
    await page.waitForFunction(() => document.querySelector('.tool-scroll .scroll-shadow-viewport')!.scrollLeft > 10);
    await page.mouse.move(5, 50);
    const stopped = await page.$eval('.tool-scroll .scroll-shadow-viewport', (element) => element.scrollLeft);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await page.$eval('.tool-scroll .scroll-shadow-viewport', (element) => element.scrollLeft)).toBe(stopped);
    const dock = await page.$eval('.screenshot-toolbar', (element) => element.getBoundingClientRect().toJSON());
    expect(dock.width).toBeLessThan(800);
    await page.screenshot({ path: '/tmp/beam-custom-dock.png' });
  }, 20_000);

  it('reorders with native dragging and dashed insertion markers, removes by right-click and restores saved order', async () => {
    page.setDefaultTimeout(3000);
    await mount(true);
    await page.setDragInterception(true);
    const move = async (sourceId: string, targetId: string) => {
      const source = await page.$eval(`[data-dock-tool="${sourceId}"]`, (element) =>
        element.getBoundingClientRect().toJSON(),
      );
      const target = await page.$eval(`[data-dock-tool="${targetId}"]`, (element) =>
        element.getBoundingClientRect().toJSON(),
      );
      const point = { x: target.x + 2, y: target.y + target.height / 2 };
      const data = await page.mouse.drag({ x: source.x + source.width / 2, y: source.y + source.height / 2 }, point);
      await page.mouse.dragEnter(point, data);
      await page.mouse.dragOver(point, data);
      await page.waitForSelector(`[data-dock-tool="${targetId}"].insert-before`);
      expect(
        await page.$eval(
          `[data-dock-tool="${targetId}"]`,
          (element) => getComputedStyle(element, '::before').borderLeftStyle,
        ),
      ).toBe('dashed');
      await page.mouse.drop(point, data);
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('.is-dragging'));
    };
    try {
      await move('shape', 'arrow');
      await page.waitForFunction(() =>
        document.querySelector('#fixture-state')?.getAttribute('data-pins')?.startsWith('shape,arrow,text'),
      );
      await move('canvas', 'arrow');
      await page.waitForFunction(
        () =>
          document.querySelector('#fixture-state')?.getAttribute('data-pins') ===
          'shape,canvas,arrow,text,drawing,image',
      );
    } finally {
      await page.setDragInterception(false);
    }
    expect(await page.$eval('#fixture-state', (element) => element.getAttribute('data-added'))).toBe('');
    await page.click('[data-dock-tool="text"] button', { button: 'right' });
    await page.waitForSelector('.dock-tool-context button');
    await page.click('.dock-tool-context button');
    await page.waitForFunction(
      () => document.querySelector('#fixture-state')?.getAttribute('data-pins') === 'shape,canvas,arrow,drawing,image',
    );
    await mount(false);
    expect(
      await page.$$eval('[data-dock-tool]', (entries) => entries.map((entry) => entry.getAttribute('data-dock-tool'))),
    ).toEqual(['shape', 'canvas', 'arrow', 'drawing', 'image']);
    await page.click('button[aria-label="More tools"]');
    await page.waitForSelector('.dock-menu-heading');
    await page.waitForFunction(() => {
      const surface = document.querySelector('.dock-menu-heading')?.closest('.popover-content');
      return surface && getComputedStyle(surface).opacity === '1' && getComputedStyle(surface).visibility === 'visible';
    });
    expect(await page.$eval('.dock-menu-heading h3', (element) => element.textContent)).toBe('Personalize dock');
    expect(
      await page.$$eval('[role="menuitem"]', (entries) =>
        entries.some((entry) => entry.textContent?.trim() === 'Text'),
      ),
    ).toBe(true);
    await page.screenshot({ path: '/tmp/beam-dock-personalize.png' });
  }, 20_000);

  it('renders actual saved element artwork in both picker libraries', async () => {
    await mount(true);
    for (const family of ['shape', 'arrow'] as const) {
      await page.evaluate(async (family) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/screenshot/tests/screenshot-dock-crop-browser-host.ts',
        )) as typeof Host;
        await host.mountAssetPreviewFixture(family);
      }, family);
      expect(await page.$('.asset-library')).toBeNull();
      await page.click('#test button');
      await page.waitForSelector('button[aria-label="Saved elements"]');
      await page.click('button[aria-label="Saved elements"]');
      await page.waitForSelector('.asset-artwork .shape-preview');
      expect(await page.$('.asset-artwork .preview-status')).toBeNull();
      const pixels = await page.$eval('.asset-artwork .shape-preview', async (element) => {
        const url = (element as HTMLElement).style.backgroundImage.slice(4, -1).replace(/^"|"$/g, '');
        const bitmap = new Image();
        bitmap.src = url;
        await bitmap.decode();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let orange = 0,
          green = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 128) continue;
          if (data[i]! > 200 && data[i + 1]! > 50 && data[i + 1]! < 150 && data[i + 2]! < 100) orange++;
          if (data[i]! < 90 && data[i + 1]! > 150 && data[i + 2]! < 140) green++;
        }
        return { orange, green };
      });
      expect(family === 'shape' ? pixels.orange : pixels.green).toBeGreaterThan(20);
      await page.waitForFunction(() => {
        const surface = document.querySelector('.asset-library')?.closest('.popover-content');
        return surface && getComputedStyle(surface).opacity === '1';
      });
      const trash = await page.$eval('.asset-remove', (element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(trash.width).toBeGreaterThanOrEqual(44);
      expect(trash.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `/tmp/beam-saved-${family}-preview.png` });
    }
  }, 20_000);

  it('saves named assets from real canvas and Composition right-clicks after their menus close', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await mount(true);
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { mountAssetContextFixture } = (await load(
        '/apps/desktop/src/components/editor/elements/tests/element-asset-context-browser-host.ts',
      )) as typeof AssetContextHost;
      mountAssetContextFixture();
    });
    for (const [target, name] of [
      ['#asset-canvas-hit', 'Canvas bubble'],
      ['.layer-row[data-layer-id="bubble"]', 'Composition bubble'],
    ]) {
      await page.click(target!, { button: 'right' });
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent?.includes('Add to assets')),
      );
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
          .find((item) => item.textContent?.includes('Add to assets'))!
          .click(),
      );
      await page.waitForSelector('.text-input-dialog input');
      await page.waitForFunction(() => document.activeElement?.matches('.text-input-dialog input'));
      expect(await page.$eval('.text-input-dialog input', (input) => (input as HTMLInputElement).value)).toBe(
        'My speech bubble',
      );
      await page.waitForSelector('[role="menu"]', { hidden: true });
      await page.keyboard.type(name!);
      if (name === 'Composition bubble') await page.screenshot({ path: '/tmp/beam-add-asset-dialog.png' });
      await page.keyboard.press('Enter');
      await page.waitForSelector('.text-input-dialog', { hidden: true });
      await page.waitForSelector('.dialog-overlay', { hidden: true });
    }
    const assets = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('dock-crop-preferences') ?? '{}').elementAssets as Array<{
          name: string;
          style: { text: { content: string } };
        }>,
    );
    expect(assets.map((asset) => asset.name)).toEqual(['Canvas bubble', 'Composition bubble']);
    expect(assets.every((asset) => asset.style.text.content === 'Hello')).toBe(true);
    expect(await page.$eval('.composition-label .label-text', (element) => element.textContent)).toBe(
      'My speech bubble',
    );
    await page.click('#asset-canvas-hit', { button: 'right' });
    await page.waitForSelector('[role="menu"] [role="separator"]');
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((item) => item.textContent?.trim() === 'Delete')!
        .click(),
    );
    await page.waitForSelector('.layer-row[data-layer-id="bubble"]', { hidden: true });
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('dock-crop-preferences') ?? '{}').elementAssets.length),
    ).toBe(2);
  }, 20_000);

  it('pins Properties flush left or right without collapse, remembers placement and retains actual-size zoom', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await mount(true);
    const show = () =>
      page.evaluate(async () => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { mountPropertiesDock } = (await load(
          '/apps/desktop/src/components/screenshot/tests/screenshot-properties-browser-host.ts',
        )) as typeof PropertiesHost;
        await mountPropertiesDock();
      });
    const placement = async (label: string) => {
      await page.click('[aria-label="Properties position"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await page.evaluate(
        (label) =>
          [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
            .find((item) => item.textContent?.trim() === label)!
            .click(),
        label,
      );
      await page.waitForSelector('[role="menuitemradio"]', { hidden: true });
      await page.waitForSelector('[aria-label="Properties position"]:not(:disabled)');
    };
    const pinnedFits = (side: 'left' | 'right') =>
      page.waitForFunction(
        (side) => {
          const panel = document.querySelector('.properties-island')!.getBoundingClientRect();
          const image = document.querySelector('#properties-image')!.getBoundingClientRect();
          const viewport = document.querySelector('.screenshot-stage')!.getBoundingClientRect();
          const header = document.querySelector('.editor-titlebar')!.getBoundingClientRect();
          return (
            image.width > 500 &&
            Math.abs(panel.top - header.bottom) < 1 &&
            Math.abs(panel.bottom - innerHeight) < 1 &&
            (side === 'left'
              ? panel.left === 0 && Math.abs(panel.right - viewport.left) < 0.01
              : panel.right === innerWidth && Math.abs(viewport.right - panel.left) < 0.01)
          );
        },
        {},
        side,
      );
    await show();
    await pinnedFits('left');
    expect(await page.$('#screenshot-properties-panel [aria-label="Close"]')).toBeNull();
    await page.screenshot({ path: '/tmp/beam-properties-left.png' });
    await placement('Dock properties on the right');
    await pinnedFits('right');
    expect(await page.$('#screenshot-properties-panel [aria-label="Close"]')).toBeNull();
    await page.screenshot({ path: '/tmp/beam-properties-right.png' });
    await show();
    await pinnedFits('right');
    await placement('Float properties');
    await page.waitForFunction(
      () => document.querySelector('#properties-image')!.getBoundingClientRect().width === 1280,
    );
    expect(await page.$('#screenshot-properties-panel [aria-label="Close"]')).not.toBeNull();
    await page.click('button[aria-haspopup="menu"][aria-label^="Canvas zoom"]');
    await page.waitForSelector('[role="menuitemradio"]');
    await page.focus('[role="menuitemradio"]');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#properties-image')!.getBoundingClientRect().width === 2000,
    );
    await placement('Dock properties on the left');
    expect(await page.$eval('#properties-image', (element) => element.getBoundingClientRect().width)).toBe(2000);
    await page.click('button[aria-haspopup="menu"][aria-label^="Canvas zoom"]');
    await page.waitForSelector('[role="menuitemradio"]');
    await page.focus('[role="menuitemradio"]');
    await page.keyboard.press('Enter');
    await pinnedFits('left');
    expect(
      await page.$eval('#properties-state', (element) => [
        element.getAttribute('data-width'),
        element.getAttribute('data-height'),
      ]),
    ).toEqual(['2000', '1000']);
  }, 20_000);

  it('keeps OK on screen after ancestor panning and commits px and percent edits before confirmation', async () => {
    await mount(true);
    await page.click('button[aria-label="Crop"]');
    await page.waitForSelector('.crop-hud');
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { moveCropFixture } = (await load(
        '/apps/desktop/src/components/screenshot/tests/screenshot-dock-crop-browser-host.ts',
      )) as typeof Host;
      moveCropFixture(4000, -3000);
    });
    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLElement>('.crop-ok-button')!,
        box = button.getBoundingClientRect();
      return (
        box.top >= 40 &&
        box.left >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight &&
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.crop-ok-button') === button
      );
    });
    await page.click('button[aria-label="Edit crop"]');
    await page.waitForSelector('input[aria-label="Left"]');
    await page.focus('input[aria-label="Left"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#fixture-state')?.getAttribute('data-left') === '200');
    expect(await page.$('.crop-hud')).not.toBeNull();
    await page.click('.crop-numeric-fields button[aria-label="Unit"]');
    await page.waitForSelector('.unit-menu');
    await page.click('.unit-menu button:nth-child(2)');
    await page.waitForSelector('.unit-menu', { hidden: true });
    await page.focus('input[aria-label="Left"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type('25');
    await page.screenshot({ path: '/tmp/beam-crop-controls.png' });
    await page.click('.crop-ok-button');
    await page.waitForFunction(() => document.querySelector('#fixture-state')?.getAttribute('data-confirmed') === '1');
    expect(await page.$eval('#fixture-state', (element) => element.getAttribute('data-left'))).toBe('480');
    expect(await page.$('.crop-hud')).toBeNull();
  }, 20_000);
});
