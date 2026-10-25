// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../../../../apps/cli/src/chromium-settings';
import type * as TransitionEffectsBrowserHostModule from './transition-effects-browser-host';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('WebGL transition completed frames', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  let results: ReturnType<typeof TransitionEffectsBrowserHostModule.renderTransitionEffects>;
  it('applies masks to completed recording layers and canvas frames without erasing the backdrop', async () => {
    const result = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof TransitionEffectsBrowserHostModule>;
      return (
        await load('/packages/runtime/src/composition/transitions/transition-effects-browser-host.ts')
      ).renderTransitionComposition();
    });
    expect(result.center).toEqual([69, 186, 129, 255]);
    expect(result.corner).toEqual([30, 30, 36, 255]);
    expect(result.start).toEqual([30, 30, 36, 255]);
    expect(result.final).toEqual([69, 186, 129, 255]);
    expect(result.reverseMatches).toBe(true);
    expect(result.canvasMatches).toBe(true);
  });
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-transition-effects-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../../../', import.meta.url)),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        {
          name: 'transition-effect-fixture',
          configureServer(server) {
            server.middlewares.use('/transition-effect-fixture', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><html><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Transition test server unavailable.');
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
    await page.goto(`http://127.0.0.1:${address.port}/transition-effect-fixture`);
    results = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (
        path: string,
      ) => Promise<typeof TransitionEffectsBrowserHostModule>;
      return (
        await load('/packages/runtime/src/composition/transitions/transition-effects-browser-host.ts')
      ).renderTransitionEffects();
    });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it('finishes every preset at the unchanged source, including source alpha and transparent holes', () => {
    expect(results).toHaveLength(20);
    for (const result of results) {
      expect(result.maximumError, result.kind).toBeLessThanOrEqual(1);
      expect(result.transparentFinish, result.kind).toEqual([0, 0, 0, 0]);
      expect(result.translucentFinish[3], result.kind).toBe(128);
    }
  });
  it('confines every effect to its destination without changing unrelated backdrop pixels', () => {
    for (const result of results) {
      expect(result.outside, result.kind).toEqual([17, 33, 61, 255]);
      expect(result.clearMargin, result.kind).toEqual([0, 0, 0, 0]);
      expect(result.transparentStart, result.kind).toEqual([0, 0, 0, 0]);
    }
  });
  it('begins geometry and digital effects fully hidden and colored fades at their selected color', () => {
    const colors: Record<string, number[]> = {
      'fade-black': [0, 0, 0, 255],
      'fade-white': [255, 255, 255, 255],
      'dip-color': [36, 168, 224, 255],
      'color-fade': [36, 168, 224, 255],
      'color-flash': [36, 168, 224, 255],
    };
    for (const result of results) {
      if (colors[result.kind]) expect(result.startColor, result.kind).toEqual(colors[result.kind]);
      else expect(result.startAlpha, result.kind).toBe(0);
    }
  });
  it('renders substantial intermediate changes and produces the same pixels after reverse seeking', () => {
    for (const result of results) {
      expect(result.changed, result.kind).toBeGreaterThan(120);
      expect(result.reverseStable, result.kind).toBe(true);
      expect(result.progressing, result.kind).toBe(true);
    }
  });
  it('keeps reveals spatially distinct rather than reducing every transition to an opacity fade', () => {
    const circle = results.find((result) => result.kind === 'circle-reveal')!;
    const diamond = results.find((result) => result.kind === 'diamond-wipe')!;
    const linear = results.find((result) => result.kind === 'linear-wipe')!;
    for (const reveal of [circle, diamond]) {
      expect(reveal.center[3], reveal.kind).toBeGreaterThan(240);
      expect(reveal.corner[3], reveal.kind).toBeLessThan(10);
    }
    expect(linear.left[3]).toBeGreaterThan(240);
    expect(linear.right[3]).toBeLessThan(10);
    expect(new Set([circle.hash, diamond.hash, linear.hash]).size).toBe(3);
  });
  it('shows separate RGB channels on a neutral image and retains direction-aware movement', () => {
    const rgb = results.find((result) => result.kind === 'rgb-split')!;
    expect(rgb.chromaticPixels).toBeGreaterThan(30);
    for (const kind of ['whip-pan', 'push']) {
      const result = results.find((result) => result.kind === kind)!;
      expect(result.exitHash, kind).not.toBe(result.hash);
    }
  });
});
