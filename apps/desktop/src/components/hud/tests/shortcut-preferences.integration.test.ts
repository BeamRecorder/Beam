// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../apps/cli/src/chromium-install';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('shortcut preferences in hidden Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string, origin: string;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
    temp = await mkdtemp(resolve(tmpdir(), 'beam-shortcut-preferences-'));
    server = await createServer({
      root,
      configFile: false,
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, hmr: false },
      resolve: {
        dedupe: ['vue'],
        alias: {
          '~/ui': resolve(root, 'apps/desktop/src/components/ui'),
          '~': resolve(root, 'apps/desktop/src'),
        },
      },
      plugins: [
        {
          name: 'fixture-backgrounds',
          resolveId: (id) => (id === 'virtual:public-background-media' ? id : undefined),
          load: (id) =>
            id === 'virtual:public-background-media' ? 'export default { images: [], videos: [] }' : undefined,
        },
        vue(),
        {
          name: 'shortcut-preferences-fixture',
          configureServer(server) {
            server.middlewares.use('/shortcuts-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><link rel="icon" href="data:,"><div id="app"></div><script type="module" src="/apps/desktop/src/components/hud/tests/shortcut-preferences-browser-host.ts"></script>',
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No shortcut preference test port');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      ignoreDefaultArgs: ['--hide-scrollbars'],
      userDataDir: resolve(temp, 'profile'),
      args: ['--no-sandbox'],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  it.each([
    ['en', 'dark'],
    ['fr', 'dark'],
    ['de', 'light'],
    ['ja', 'light'],
  ])('keeps search left and categories right in %s / %s', async (locale, theme) => {
    await page.setViewport({ width: 900, height: 900 });
    await page.goto(`${origin}/shortcuts-test?locale=${locale}&theme=${theme}`);
    await page.waitForSelector('[data-setting="quickSnip.recordWindow"] button:not(:disabled)');
    const bounds = await page.evaluate(() => {
      const search = document.querySelector<HTMLInputElement>('input[type="search"]')!.getBoundingClientRect();
      const select = document.querySelector<HTMLElement>('.shortcut-filters .select-trigger')!.getBoundingClientRect();
      return { searchRight: search.right, selectLeft: select.left, searchTop: search.top, selectTop: select.top };
    });
    expect(bounds.searchRight).toBeLessThan(bounds.selectLeft);
    expect(Math.abs(bounds.searchTop - bounds.selectTop)).toBeLessThanOrEqual(2);
    expect(await page.$$eval('.shortcut-section', (sections) => sections.length)).toBe(4);
    expect(await page.$$eval('.shortcut-section:first-of-type .shortcut-row', (rows) => rows.length)).toBe(4);
    expect(await page.$eval('h1', (heading) => heading.textContent)).not.toContain('HudPreferences.');
    await page.click('.shortcut-filters .select-trigger');
    await page.waitForSelector('[role="option"]');
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
    await page.screenshot({ path: `/tmp/beam-shortcuts-${locale}-${theme}.png` });
    await page.focus('[role="option"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="option"]', { hidden: true });
  });

  it('changes category and searches subcategories across the catalog', async () => {
    await page.goto(`${origin}/shortcuts-test`);
    await page.waitForSelector('[data-setting="quickSnip.toggle"] button:not(:disabled)');
    await page.click('.shortcut-filters .select-trigger');
    await page.waitForSelector('[role="option"]');
    await page.evaluate(() => {
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (item) => item.textContent?.trim() === 'Editing',
      );
      if (!option) throw new Error('Missing Editing category');
      option.click();
    });
    await page.waitForSelector('[data-setting="editor.selectAll"]');
    expect(await page.$('[data-setting="quickSnip.toggle"]')).toBeNull();
    await page.type('input[type="search"]', 'Quick Snip');
    await page.waitForSelector('[data-setting="quickSnip.recordWindow"]');
    expect(await page.$$eval('.shortcut-row', (rows) => rows.length)).toBe(4);
    expect(await page.$eval('.shortcut-section h3', (heading) => heading.textContent?.trim())).toBe(
      'Recording · Quick Snip',
    );
  });

  it('assigns a direct action, releases native capture, and restores its unassigned default', async () => {
    await page.goto(`${origin}/shortcuts-test`);
    const row = '[data-setting="quickSnip.recordWindow"]';
    await page.waitForSelector(`${row} button:not(:disabled)`);
    await page.click(`${row} .shortcut-trigger button`);
    await page.waitForSelector(`${row} [aria-pressed="true"]`);
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await page.waitForFunction(() => document.body.dataset.savedShortcuts?.includes('Ctrl+K'));
    expect(await page.evaluate(() => document.body.dataset.capturingShortcut)).toBe('false');
    expect(JSON.parse((await page.evaluate(() => document.body.dataset.savedShortcuts))!)).toEqual({
      'quickSnip.recordWindow': { keys: 'Ctrl+K', scope: 'global', category: 'recording' },
    });
    await page.click(`${row} [aria-label="Restore default"]`);
    await page.waitForFunction(() =>
      document.querySelector('[data-setting="quickSnip.recordWindow"]')?.textContent?.includes('None'),
    );
    expect(JSON.parse((await page.evaluate(() => document.body.dataset.savedShortcuts))!)).toEqual({
      'quickSnip.recordWindow': { keys: '', scope: 'global', category: 'recording' },
    });
  });

  it('fades the navigation only at overflowing edges and keeps its scrollbar available', async () => {
    await page.setViewport({ width: 900, height: 500 });
    await page.goto(`${origin}/shortcuts-test?window&locale=fr`);
    const viewport = '.settings-navigation-scroll .scroll-shadow-viewport';
    await page.waitForSelector(viewport);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    const geometry = await page.$eval(viewport, (node) => ({
      overflow: getComputedStyle(node).overflowY,
      gutter: getComputedStyle(node).scrollbarGutter,
      hidden: node.classList.contains('hide-scrollbar'),
      mask: (node as HTMLElement).style.maskImage,
      searchTop: document.querySelector('.settings-search')!.getBoundingClientRect().top,
      viewportRight: node.getBoundingClientRect().right,
      sidebarRight: document.querySelector('.settings-navigation')!.getBoundingClientRect().right,
    }));
    expect(geometry).toMatchObject({ overflow: 'auto', gutter: 'stable', hidden: false });
    expect(geometry.viewportRight).toBe(geometry.sidebarRight);
    expect(geometry.mask).not.toContain('transparent 0%');
    await page.$eval(viewport, (node) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => {
        const mask = (document.querySelector(selector) as HTMLElement).style.maskImage;
        return mask.includes('transparent 0%') && mask.includes('transparent 100%');
      },
      {},
      viewport,
    );
    expect(await page.$eval('.settings-search', (node) => node.getBoundingClientRect().top)).toBe(geometry.searchTop);
    await page.$eval(viewport, (node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => !(document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    await page.screenshot({ path: '/tmp/beam-settings-sidebar-scroll-fr.png' });
    await page.setViewport({ width: 900, height: 1100 });
    await page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)!).maskImage === 'none',
      {},
      viewport,
    );
  });

  it('fades the shortcut list and removes the fade when search no longer overflows', async () => {
    await page.setViewport({ width: 1000, height: 650 });
    await page.goto(`${origin}/shortcuts-test?window`);
    await page.waitForSelector('[data-settings-view="shortcuts"]');
    await page.click('[data-settings-view="shortcuts"]');
    await page.waitForSelector('.shortcut-filters input');
    const viewport = '.view-scroll .scroll-shadow-viewport';
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    await page.$eval(viewport, (node) => {
      node.scrollTop = 150;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 0%'),
      {},
      viewport,
    );
    await page.screenshot({ path: '/tmp/beam-settings-shortcuts-scroll.png' });
    await page.type('.shortcut-filters input', 'zzz-no-results');
    await page.waitForSelector('.shortcuts [role="status"]');
    await page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)!).maskImage === 'none',
      {},
      viewport,
    );
    expect(await page.$$eval('.settings-content .scroll-shadow-viewport', (nodes) => nodes.length)).toBe(1);
  });

  it('fades global settings results without adding a second scroll container', async () => {
    await page.setViewport({ width: 1000, height: 650 });
    await page.goto(`${origin}/shortcuts-test?window`);
    await page.waitForSelector('.settings-search input');
    await page.type('.settings-search input', 'text');
    const viewport = '.search-scroll .scroll-shadow-viewport';
    await page.waitForSelector(viewport);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 100%'),
      {},
      viewport,
    );
    await page.$eval(viewport, (node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      (selector) => (document.querySelector(selector) as HTMLElement).style.maskImage.includes('transparent 0%'),
      {},
      viewport,
    );
    expect(await page.$$eval('.settings-content .scroll-shadow-viewport', (nodes) => nodes.length)).toBe(1);
    await page.screenshot({ path: '/tmp/beam-settings-results-scroll.png' });
    await page.type('.settings-search input', 'zzz-no-results');
    await page.waitForSelector('.search-empty');
    await page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)!).maskImage === 'none',
      {},
      viewport,
    );
  });
});
