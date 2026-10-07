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

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('saving preference appearance in Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string, origin: string;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
    temp = await mkdtemp(resolve(tmpdir(), 'beam-toggle-save-'));
    server = await createServer({
      root,
      configFile: false,
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      resolve: {
        dedupe: ['vue'],
        alias: {
          '~/ui': resolve(root, 'apps/desktop/src/components/ui'),
          '~': resolve(root, 'apps/desktop/src'),
        },
      },
      plugins: [
        vue(),
        {
          name: 'toggle-save-fixture',
          configureServer(server) {
            server.middlewares.use('/toggle-save-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><link rel="icon" href="data:,"><div id="app"></div><script type="module" src="/apps/desktop/src/components/settings/tests/toggle-preference-browser-host.ts"></script>',
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No preference test port');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      userDataDir: resolve(temp, 'profile'),
      args: ['--no-sandbox'],
    });
    page = await browser.newPage();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  const appearance = () =>
    page.evaluate(() => {
      const label = document.querySelector<HTMLElement>('.preference-label')!;
      const control = document.querySelector<HTMLButtonElement>('[role="switch"]')!;
      const style = getComputedStyle(control);
      return {
        label: getComputedStyle(label).color,
        cursor: style.cursor,
        opacity: style.opacity,
        background: style.backgroundColor,
        checked: control.getAttribute('aria-checked'),
      };
    });
  it.each(['light', 'dark'])('keeps the label, pointer and switch stable during both saves in %s', async (theme) => {
    await page.goto(`${origin}/toggle-save-test`);
    await page.waitForFunction('Boolean(window.toggleTest)');
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }, theme);
    for (const checked of [false, true]) {
      // Wait for the preceding thumb/background transition to settle.
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState === 'finished'),
      );
      const before = await appearance();
      expect(before.checked).toBe(String(checked));
      expect(before.cursor).toBe('pointer');
      await page.click('[role="switch"]');
      await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-busy') === 'true');
      expect(await appearance()).toEqual(before);
      const saves = await page.evaluate('window.toggleTest.saves()');
      await page.click('[role="switch"]');
      expect(await page.evaluate('window.toggleTest.saves()')).toBe(saves);
      await page.evaluate('window.toggleTest.finish()');
      expect(await page.$eval('[role="switch"]', (element) => element.getAttribute('aria-checked'))).toBe(
        String(!checked),
      );
      expect(await page.$eval('[role="switch"]', (element) => element.hasAttribute('disabled'))).toBe(false);
    }
  });
});
