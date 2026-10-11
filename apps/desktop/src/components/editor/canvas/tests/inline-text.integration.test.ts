// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('native canvas text input in hidden Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string, url: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-inline-text-test-'));
    server = await createServer({
      configFile: resolve('vite.config.ts'),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      plugins: [
        {
          name: 'inline-text-test',
          configureServer(server) {
            server.middlewares.use('/inline-text-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><title>Beam inline text test</title><div id="app"></div><script type="module" src="/src/components/editor/canvas/tests/inline-text-browser-host.ts"></script>',
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    url = `http://127.0.0.1:${address.port}/inline-text-test`;
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...env } = process.env;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      env: { ...env, TMPDIR: temp },
      userDataDir: resolve(temp, 'profile'),
      args: chromiumSettings().args,
    });
    page = await browser.newPage();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  const open = async (mode: string) => {
    await page.goto(`${url}?mode=${mode}`);
    await page.waitForSelector('body[data-ready="true"] textarea');
  };
  it.each(['element', 'caption'])(
    'updates the %s draft immediately without rebuilding the document while typing',
    async (mode) => {
      await open(mode);
      const result = await page.evaluate(async () => {
        const textarea = document.querySelector('textarea')!;
        textarea.value = 'Fast native text';
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 't' }));
        await Promise.resolve();
        return {
          draft: document.querySelector('main')!.getAttribute('data-draft'),
          commits: Number(document.body.dataset.commits ?? 0),
        };
      });
      expect(result).toEqual({ draft: 'Fast native text', commits: 0 });
      await page.click('#finish');
      expect(
        await page.evaluate(() => ({
          saved: document.body.dataset.saved,
          commits: Number(document.body.dataset.commits),
        })),
      ).toEqual({ saved: 'Fast native text', commits: 1 });
    },
    15000,
  );
  it('does not force a synchronous layout for each input event', async () => {
    await open('element');
    const cdp = await page.createCDPSession();
    try {
      await cdp.send('Performance.enable');
      const metric = async () =>
        (await cdp.send('Performance.getMetrics')).metrics.find((value) => value.name === 'LayoutCount')!.value;
      const before = await metric();
      await page.evaluate(() => {
        const textarea = document.querySelector('textarea')!;
        for (let index = 0; index < 40; index++) {
          textarea.value += 'a';
          textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
      });
      expect((await metric()) - before).toBeLessThan(4);
    } finally {
      await cdp.detach();
    }
  });
  it('lets the native field grow and shrink for newlines without a height reset', async () => {
    await open('caption');
    const result = await page.evaluate(async () => {
      const textarea = document.querySelector('textarea')!;
      const update = async (text: string) => {
        textarea.value = text;
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await new Promise(requestAnimationFrame);
        return textarea.getBoundingClientRect().height;
      };
      return { one: await update('one'), three: await update('one\ntwo\nthree'), short: await update('short') };
    });
    expect(result.three).toBeGreaterThan(result.one * 2);
    expect(result.short).toBeCloseTo(result.one, 0);
  });
});
