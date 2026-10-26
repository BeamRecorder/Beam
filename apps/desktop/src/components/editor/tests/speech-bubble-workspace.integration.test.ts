// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../cli/src/chromium-settings';
import type { SpeechBubbleBrowserState } from './speech-bubble-browser-types';
import type * as SpeechBubbleBrowserHostModule from './speech-bubble-browser-host';
import type * as ShapeRenderModule from '@beam/runtime/composition/shape/render-shape-clip';
import type * as ElementTextModule from '@beam/engine/shared/element-text';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('speech bubbles in the complete editor workspace', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string, url: string;
  const errors: string[] = [];
  const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(tmpdir(), 'beam-speech-bubble-test-'));
    server = await createServer({
      root,
      configFile: resolve(root, 'vite.config.ts'),
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue', 'mediabunny'],
      },
      plugins: [
        {
          name: 'speech-bubble-test-page',
          configureServer(server) {
            server.middlewares.use('/speech-bubble-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a port.');
    url = `http://127.0.0.1:${address.port}/speech-bubble-test`;
    browser = await puppeteer.launch({
      executablePath: await chromiumExecutable(),
      headless: true,
      pipe: true,
      userDataDir: resolve(temporary, 'profile'),
      args: [...chromiumSettings().args, '--autoplay-policy=no-user-gesture-required'],
    });
  }, 30000);
  afterEach(async () => {
    await page?.close();
  });
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  const mount = async (effects: boolean) => {
    errors.length = 0;
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url);
    await page.evaluate(async (effects) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/tests/speech-bubble-browser-host.ts',
      )) as typeof SpeechBubbleBrowserHostModule;
      window.speechBubbleHost = await host.mountSpeechBubbleEditor(effects);
    }, effects);
    await page.waitForFunction(() => window.speechBubbleHost.state().settled);
    await page.evaluate(() => window.speechBubbleHost.select());
  };
  const editPeak = async () => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Edit points',
      );
      if (!button) throw new Error('The real shape inspector has no node editing action.');
      button.click();
    });
    await page.waitForSelector('.vector-overlay .anchor');
    const peak = await page.$$eval(
      '.vector-overlay .anchor:not(.handle)',
      (anchors) =>
        anchors
          .map((anchor) => {
            const rect = anchor.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          })
          .sort((a, b) => b.y - a.y)[0]!,
    );
    await page.mouse.move(peak.x, peak.y);
    await page.mouse.down();
    await page.mouse.move(peak.x + 45, peak.y + 45, { steps: 15 });
    await page.mouse.up();
    await page.evaluate(() => window.speechBubbleHost.clear());
    return page.evaluate(() => window.speechBubbleHost.state());
  };
  const cycle = async () => {
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        await window.speechBubbleHost.seek(i % 2 ? 5 : 0);
        await window.speechBubbleHost.select();
        await new Promise(requestAnimationFrame);
        await window.speechBubbleHost.clear();
        await window.speechBubbleHost.select();
      }
      await window.speechBubbleHost.seek(0);
      await window.speechBubbleHost.play();
    });
    await page.waitForFunction(() => window.speechBubbleHost.state().time > 0.25);
    await page.evaluate(async () => {
      await window.speechBubbleHost.pause();
      await window.speechBubbleHost.seek(0);
      await window.speechBubbleHost.select();
    });
    return page.evaluate(() => window.speechBubbleHost.state());
  };
  const expectResponsive = (before: SpeechBubbleBrowserState, after: SpeechBubbleBrowserState) => {
    expect(after.frames).toBeGreaterThan(before.frames);
    expect(after.time).toBe(0);
    expect(after.playback).toBe('paused');
    expect(after.error).toBeNull();
    expect(after.shape.vector).toEqual(before.shape.vector);
    expect(errors).toEqual([]);
  };

  it('aligns top, center and bottom inside the body in the real inline editor and rendered pixels', async () => {
    await mount(true);
    for (const alignment of ['Top', 'Center', 'Bottom']) {
      await page.click(`.element-text-controls button[aria-label="${alignment}"]`);
      await page.evaluate(() => window.speechBubbleHost.editText());
      await page.waitForSelector('.text-frame .caption-text-editor');
      const bounds = await page.evaluate(() => {
        const frame = document.querySelector('.text-frame')!.getBoundingClientRect();
        const text = document.querySelector('.text-frame .caption-text-editor')!.getBoundingClientRect();
        const padding = window.speechBubbleHost.state().shape.text!.padding;
        const inset = (Math.min(frame.width * 0.94, frame.height * 0.69) * padding) / 100;
        return {
          textTop: text.top,
          textHeight: text.height,
          top: frame.top + frame.height * 0.08 + inset,
          bottom: frame.top + frame.height * 0.77 - inset,
        };
      });
      const expected =
        alignment === 'Top'
          ? bounds.top
          : alignment === 'Bottom'
            ? bounds.bottom - bounds.textHeight
            : (bounds.top + bounds.bottom - bounds.textHeight) / 2;
      expect(Math.abs(bounds.textTop - expected), alignment).toBeLessThan(2);
      await page.keyboard.press('Escape');
    }
    const pixels = await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { drawShapeClip } = (await load(
        '/packages/runtime/src/composition/shape/render-shape-clip.ts',
      )) as typeof ShapeRenderModule;
      const { createElementText } = (await load(
        '/packages/engine/src/shared/element-text.ts',
      )) as typeof ElementTextModule;
      return (['top', 'center', 'bottom'] as const).map((verticalAlign) => {
        const clip = window.speechBubbleHost.state().shape;
        clip.text = createElementText('TEXT');
        clip.text.verticalAlign = verticalAlign;
        clip.text.style.color = '#111111';
        clip.text.style.fontFamily = 'sans-serif';
        clip.opacityEnabled = false;
        clip.shadowEnabled = false;
        clip.backdropBlur = 0;
        clip.fillEnabled = true;
        clip.fill = { kind: 'color', color: '#ffffa3' };
        clip.borderColor = '#ff6600';
        clip.transform = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
        const canvas = new OffscreenCanvas(800, 600),
          ctx = canvas.getContext('2d')!;
        drawShapeClip(ctx, clip, { x: 0, y: 0, width: 800, height: 600 });
        const rgba = ctx.getImageData(0, 0, 800, 600).data;
        let top = 600,
          bottom = -1;
        for (let y = 0; y < 600; y++)
          for (let x = 0; x < 800; x++) {
            const at = (y * 800 + x) * 4;
            if (rgba[at]! < 80 && rgba[at + 1]! < 80 && rgba[at + 2]! < 80 && rgba[at + 3]! > 200) {
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        return { top, bottom };
      });
    });
    const bodyTop = 60 + 480 * 0.08,
      bodyBottom = 60 + 480 * 0.77;
    for (const text of pixels) {
      expect(text.top).toBeGreaterThan(bodyTop);
      expect(text.bottom).toBeLessThan(bodyBottom);
      expect(text.bottom).toBeGreaterThan(text.top);
    }
    expect(Math.abs((pixels[1]!.top + pixels[1]!.bottom) / 2 - (bodyTop + bodyBottom) / 2)).toBeLessThan(8);
    expect(pixels[0]!.bottom).toBeLessThan(pixels[1]!.top);
    expect(pixels[1]!.bottom).toBeLessThan(pixels[2]!.top);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.speechBubbleHost.dispose());
  }, 60000);

  it.each([false, true])(
    'keeps an edited SVG peak selectable through playback and seeks (text/blur/shadow: %s)',
    async (effects) => {
      await mount(effects);
      const original = await page.evaluate(() => window.speechBubbleHost.state());
      expect(original.shape.vector).toBeUndefined();
      const edited = await editPeak();
      expect(edited.shape.vector?.contours[0]?.nodes.length).toBe(11);
      expect(edited.shape.transform.height).toBeGreaterThan(original.shape.transform.height);
      expectResponsive(edited, await cycle());
      await page.evaluate(() => window.speechBubbleHost.dispose());
    },
    60000,
  );

  it('preserves the edited peak through history and a complete workspace reopen', async () => {
    await mount(false);
    const edited = await editPeak();
    const saved = await page.evaluate(() => window.speechBubbleHost.save());
    expect(saved.composition.clips.find((clip) => clip.id === 'bubble')).toEqual(edited.shape);
    await page.evaluate(async () => {
      await window.speechBubbleHost.undo();
      await window.speechBubbleHost.redo();
    });
    const restored = await page.evaluate(() => window.speechBubbleHost.state());
    expect(restored.shape.vector).toEqual(edited.shape.vector);
    await page.evaluate(() => window.speechBubbleHost.reopen());
    await page.waitForFunction(() => window.speechBubbleHost.state().settled);
    await page.evaluate(() => window.speechBubbleHost.select());
    expectResponsive(edited, await cycle());
    await page.evaluate(() => window.speechBubbleHost.dispose());
  }, 60000);
});
