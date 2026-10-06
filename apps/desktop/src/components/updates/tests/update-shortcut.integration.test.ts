// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../apps/cli/src/chromium-install';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import type { AppUpdateState } from '~/api/types/capture-api';
import type { UpdateBrowserWindow } from './update-browser-types';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('compiled Recorder update UI', () => {
  let directory: string, server: PreviewServer, browser: Browser, page: Page, origin: string;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../../../../..', import.meta.url));
    directory = await mkdtemp(resolve(tmpdir(), 'beam-update-ui-'));
    const outDir = resolve(directory, 'dist');
    await writeFile(
      resolve(directory, 'index.html'),
      '<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module" src="/host.ts"></script>',
    );
    await writeFile(
      resolve(directory, 'host.ts'),
      `import ${JSON.stringify(resolve(root, 'apps/desktop/src/components/updates/tests/update-browser-host.ts'))}`,
    );
    await build({
      configFile: false,
      root: directory,
      plugins: [vue()],
      logLevel: 'silent',
      resolve: {
        alias: { '~/ui': resolve(root, 'apps/desktop/src/components/ui'), '~': resolve(root, 'apps/desktop/src') },
      },
      build: { outDir, copyPublicDir: false },
    });
    await cp(resolve(root, 'public/font'), resolve(outDir, 'font'), { recursive: true });
    await cp(resolve(root, 'public/brand'), resolve(outDir, 'brand'), { recursive: true });
    server = await preview({
      configFile: false,
      root: directory,
      build: { outDir },
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0 },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Update test server unavailable');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      args: ['--no-sandbox'],
    });
  }, 30000);
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    if (server) await new Promise<void>((done) => server.httpServer.close(() => done()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const open = async (theme: string) => {
    await page?.close();
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.setViewport({ width: 672, height: 268 });
    await page.evaluateOnNewDocument((theme) => {
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.classList.toggle('dark', theme === 'dark'),
      );
      let state: AppUpdateState = {
        status: 'available',
        currentVersion: '0.5.2',
        availableVersion: '0.5.3',
        percent: null,
        message: null,
      };
      const listeners = new Set<(state: AppUpdateState) => void>();
      const publish = (status: AppUpdateState['status'], percent: number | null) => {
        state = { ...state, status, percent };
        for (const listener of listeners) listener(state);
      };
      Object.assign(window, {
        capture: {
          getUpdateState: async () => state,
          onUpdateState: (listener: (state: AppUpdateState) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          downloadUpdate: async () => {
            document.documentElement.dataset.download = 'true';
            publish('downloading', 42);
            return true;
          },
          quitAndInstallUpdate: async () => {
            document.documentElement.dataset.restart = 'true';
            return true;
          },
          openUpdateChangelog: async () => undefined,
        },
      });
      window.addEventListener('beam-update-ready', () => publish('downloaded', 100));
    }, theme);
    await page.goto(origin);
    try {
      await page.waitForSelector('.update-shortcut button');
    } catch (error) {
      throw new Error(errors.join('\n') || String(error));
    }
    await page.evaluate(() => document.fonts.ready);
  };
  it.each(['light', 'dark'])(
    'explains download and restart before acting in %s',
    async (theme) => {
      await open(theme);
      await page.hover('.update-shortcut button');
      await page.waitForSelector('.update-shortcut-panel');
      await page.screenshot({ path: `/tmp/beam-update-ui-${theme}.png` });
      expect(await page.$eval('.update-shortcut-panel', (element) => element.textContent)).toContain('keep working');
      expect(await page.$eval('html', (element) => element.dataset.download)).toBeUndefined();
      await page.click('.update-shortcut-panel .update-actions button');
      await page.waitForFunction(() =>
        document.querySelector('.update-shortcut button')?.getAttribute('aria-label')?.includes('42%'),
      );
      expect(await page.$eval('.update-shortcut-panel progress', (element) => element.getAttribute('value'))).toBe(
        '42',
      );
      await page.evaluate(() => window.dispatchEvent(new Event('beam-update-ready')));
      await page.waitForFunction(() =>
        document.querySelector('.update-shortcut button')?.getAttribute('aria-label')?.includes('Restart to update'),
      );
      expect(await page.$eval('.update-shortcut-panel .update-hint', (element) => element.textContent)).toContain(
        'when you’re ready',
      );
      expect(await page.$eval('html', (element) => element.dataset.restart)).toBeUndefined();
      await page.click('.update-shortcut-panel .update-actions button');
      await page.waitForFunction(() => document.documentElement.dataset.restart === 'true');
      expect(await page.$$('.settings-action .update-badge')).toHaveLength(1);
      expect(await page.$$('.update-header .update-attention, .update-icon-wrap')).toHaveLength(0);
      expect(await page.$$('.update-header .update-top-icon')).toHaveLength(2);
    },
    15000,
  );
  it('highlights once, closes on mouse leave, and dismisses a pinned panel from the topbar', async () => {
    await open('dark');
    expect(await page.$$('.update-shortcut .throbber-variant-highlight')).toHaveLength(1);
    await page.waitForSelector('.update-shortcut .throbber', { hidden: true });
    await page.hover('.update-shortcut button');
    await page.waitForSelector('.update-shortcut-panel');
    expect(await page.$$('.hud-topbar.is-dismissible')).toHaveLength(1);
    await page.mouse.move(20, 250);
    await page.waitForSelector('.update-shortcut-panel', { hidden: true });
    await page.click('.update-shortcut button');
    await page.waitForSelector('.update-shortcut-panel');
    await page.mouse.move(20, 250);
    expect(await page.$$('.update-shortcut-panel')).toHaveLength(1);
    await page.click('.topbar-identity', { offset: { x: 180, y: 10 } });
    await page.waitForSelector('.update-shortcut-panel', { hidden: true });
    expect(await page.$$('.hud-topbar.is-dismissible')).toHaveLength(0);
    expect(await page.$$('.update-shortcut .throbber')).toHaveLength(0);
    expect(await page.$eval('html', (element) => element.dataset.download)).toBeUndefined();
  }, 15000);
  it.each(['light', 'dark'])('aligns changelog left and the primary action right in %s', async (theme) => {
    await open(theme);
    const positions = await page.$eval('main > div .update-controls', (element) => {
      const bounds = element.getBoundingClientRect();
      const changelog = element.querySelector('.changelog-btn')!.getBoundingClientRect();
      const primary = element.querySelector('.update-main-action')!.getBoundingClientRect();
      return {
        left: changelog.left - bounds.left,
        right: bounds.right - primary.right,
        gap: primary.left - changelog.right,
      };
    });
    expect(positions.left).toBe(0);
    expect(positions.right).toBe(0);
    expect(positions.gap).toBeGreaterThan(80);
    await page.screenshot({ path: `/tmp/beam-update-settings-${theme}.png` });
  });
  it('keeps every translated hover panel inside the fixed Linux HUD bounds', async () => {
    await open('dark');
    for (const locale of SUPPORTED_LOCALES) {
      await page.evaluate((locale) => (window as unknown as UpdateBrowserWindow).setUpdateLocale(locale), locale);
      await page.hover('.update-shortcut button');
      await page.waitForSelector('.update-shortcut-panel');
      const fits = await page.$eval('.popover-content', (element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(fits, locale).toBe(true);
      const actionable = await page.$eval('.update-shortcut-panel .update-actions button', (element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom <= innerHeight && rect.right <= innerWidth;
      });
      expect(actionable, locale).toBe(true);
    }
  }, 15000);
});
