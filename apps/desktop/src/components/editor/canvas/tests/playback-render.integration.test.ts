// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('playback evaluation in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-playback-render-test-'));
    server = await createServer({
      configFile: resolve('vite.config.ts'),
      cacheDir: resolve(temp, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      plugins: [
        {
          name: 'playback-render-test',
          configureServer(server) {
            server.middlewares.use('/playback-render-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><title>Playback render test</title><script type="module" src="/src/components/editor/canvas/tests/playback-render-browser-host.ts"></script>',
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
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
    await page.goto(`http://127.0.0.1:${address.port}/playback-render-test`);
    await page.waitForFunction(() => Boolean(window.playbackProbe));
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });
  it.each(['flat', 'grouped', 'orbit-blur', 'cursor-3d'])(
    'preserves completed %s pixels',
    async (mode) => {
      const result = await page.evaluate((mode) => window.playbackProbe.compareFrame(mode), mode);
      expect(result.differences, JSON.stringify(result)).toBe(0);
      expect(result.comparedChannels).toBe(691200);
    },
    30000,
  );
  it('decodes a real ten-second final frame once across 240 playback ticks', async () => {
    const result = await page.evaluate(() => window.playbackProbe.decodeLongFinalFrame());
    expect(result).toEqual({ openings: 1, decoded: 1, presented: 1, ended: true });
  }, 30000);
});
