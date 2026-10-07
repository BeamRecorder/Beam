// @vitest-environment node
// Real browser verification is opt-in and uses owned Chromium with no system display.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page, type Protocol } from 'puppeteer-core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable } from '../../../../../../cli/src/chromium-install';
import { chromiumSettings } from '../../../../../../cli/src/chromium-settings';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';
import type { ClipComposition } from '@beam/engine';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { createElementText } from '@beam/engine/shared/element-text';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

const shape = {
  ...colorClip('shape', 0, -1),
  ...DEFAULT_ANNOTATION_SHAPE_STYLE,
  kind: 'shape' as const,
  transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
};
const caption = {
  ...colorClip('caption', 0, 1),
  kind: 'caption' as const,
  caption: { type: 'text' as const, sentences: [], style: createDefaultCaptionStyle(32) },
};
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'test',
  startMs: 0,
  endMs: 1000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual' as const,
};
const generatedClips: ClipComposition['clips'] = [
  colorClip('color'),
  shape,
  { ...shape, id: 'text', trackId: 'text', family: 'text', text: createElementText('Hello Beam') },
  {
    ...shape,
    id: 'drawing',
    trackId: 'drawing',
    family: 'drawing',
    drawing: {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      smoothing: 65,
      strokeWidth: 8,
    },
  },
  {
    ...colorClip('image'),
    kind: 'image',
    assetId: 'image',
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
  },
];

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('timeline surface in real Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temporary: string;
  const root = fileURLToPath(new URL('../../../../../../../', import.meta.url));
  beforeAll(async () => {
    temporary = await mkdtemp(resolve(homedir(), '.cache/beam-timeline-'));
    server = await createServer({
      root,
      cacheDir: resolve(temporary, 'vite'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: {
        noDiscovery: true,
        include: ['vue', 'pinia', 'vue-i18n', '@vueuse/core', '@vueuse/motion', '@lucide/vue'],
      },
      plugins: [
        {
          name: 'timeline-test-page',
          enforce: 'pre',
          transform(code, id) {
            if (process.env.BEAM_TIMELINE_BASELINE !== '1' || !id.endsWith('/useTimelineVirtualization.ts')) return;
            // Isolated benchmark of the pre-change window computation; production contains no profiling flag.
            code = code.replace(
              /  const rows = computed\([\s\S]*?\n  const visibleIds/,
              `  const rows = computed(() => visibleTimelineRows(layout.value, viewport.top, viewport.height, pinnedRow.value ?? focusedRow.value));\n  const visibleIds`,
            );
            const split = code.indexOf('export function useVirtualTimelineItems');
            return (
              code.slice(0, split) +
              `export function useVirtualTimelineItems<T>(items: () => readonly T[], id: (item: T) => string) {
              const window = useTimelineVirtualWindow();
              const index = computed(() => new Map(items().map(item => [id(item), item])));
              return computed(() => window ? window.rows.value.flatMap(row => { const item = index.value.get(row.id); return item ? [item] : []; }) : [...items()]);
            }`
            );
          },
          configureServer(server) {
            server.middlewares.use('/beam-timeline-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><html><body></body></html>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No server');
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
    await page.setViewport({ width: 1200, height: 600 });
    await page.goto(`http://127.0.0.1:${address.port}/beam-timeline-test`);
    // Replace the Electron boundary; workspace, properties, preview and timeline remain real.
    await page.evaluate(() =>
      Object.defineProperty(window, 'capture', {
        value: {
          getPreferences: async () => ({ extras: {}, accessibility: {} }),
          onPreferencesChanged: () => () => {},
          listBackgroundLibrary: async () => [],
          onBackgroundLibraryChanged: () => () => {},
          listCursorPacks: async () => [],
          onCursorPacksChanged: () => () => {},
          onEditorPresetsChanged: () => () => {},
          onAuthoringRequest: () => () => {},
          registerAuthoringDocument: async () => {},
          whisperModels: async () => [],
          onWhisperProgress: () => () => {},
          listImportedFonts: async () => [],
          onFontLibraryChanged: () => () => {},
        },
      }),
    );
    // Compile the workspace fixture before timing interactions. Vite's first
    // module graph load is unrelated to selection responsiveness.
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      await load('/apps/desktop/src/components/editor/timeline/tests/workspace-browser-host.ts');
    });
  }, 30000);
  beforeEach(async () => {
    // Static-playback measurements exclude the intentional hovered-label marquee.
    await page.mouse.move(1100, 500);
  });
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });
  it.each(generatedClips)(
    'keeps $id selectable after pointer movement with properties and preview mounted',
    async (clip) => {
      const composition: ClipComposition = {
        schemaVersion: 14,
        assets:
          clip.kind === 'image'
            ? [
                {
                  id: 'image',
                  kind: 'image',
                  name: 'Image',
                  fileName: 'image.svg',
                  durationMs: 0,
                  width: 64,
                  height: 64,
                  origin: 'project',
                  src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="orange"/></svg>')}`,
                },
              ]
            : [],
        keyboardCaptionSessions: [],
        clips: [colorClip('other'), { ...clip, order: 1 }],
      };
      const errors: string[] = [];
      const collect = (error: unknown) => errors.push(error instanceof Error ? error.message : String(error));
      page.on('pageerror', collect);
      try {
        await page.evaluate(async (composition) => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const host = (await load(
            '/apps/desktop/src/components/editor/timeline/tests/workspace-browser-host.ts',
          )) as typeof import('./workspace-browser-host');
          await host.mountWorkspace(composition);
        }, composition);
        for (const id of [clip.id, 'other', clip.id]) {
          await page.locator(`[data-timeline-clip-id="${id}"]`).click();
          const bounds = (await page.$(`[data-timeline-clip-id="${id}"]`))!;
          const rect = (await bounds.boundingBox())!;
          await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
          await page.mouse.down();
          // A click can drift by one pixel before release, below the drag threshold.
          for (const drift of [1, 8]) {
            await page.mouse.move(rect.x + rect.width / 2 + drift, rect.y + rect.height / 2);
            await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
          }
          await page.mouse.up();
          expect(
            await page.$eval(`[data-timeline-clip-id="${id}"]`, (button) => button.classList.contains('selected')),
          ).toBe(true);
        }
      } finally {
        page.off('pageerror', collect);
        await page.evaluate(async () => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const host = (await load(
            '/apps/desktop/src/components/editor/timeline/tests/workspace-browser-host.ts',
          )) as typeof import('./workspace-browser-host');
          host.unmountWorkspace();
        });
      }
      expect(errors).toEqual([]);
    },
    15000,
  );
  it.each([false, true])(
    'reserves AI icon space before the painted caption label (locked: %s)',
    async (locked) => {
      const composition: ClipComposition = {
        schemaVersion: 14,
        assets: [],
        keyboardCaptionSessions: [],
        clips: [{ ...caption, name: 'AI caption', locked, isAiGenerated: true }],
      };
      const result = await page.evaluate(async (composition) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        const { canvas, state, settle, dispose } = await host.mountTimeline(composition, 10, 100);
        const ctx = canvas.getContext('2d')!,
          fill = ctx.fillText.bind(ctx),
          positions: number[] = [];
        ctx.fillText = (text, x, y, maxWidth) => {
          if (text === 'AI caption')
            positions.push(
              canvas.getBoundingClientRect().left + ctx.getTransform().transformPoint(new DOMPoint(x, y)).x,
            );
          fill(text, x, y, maxWidth);
        };
        state.composition = { ...composition, clips: composition.clips.map((clip) => ({ ...clip, enabled: false })) };
        await settle();
        const icons = document
          .querySelector<HTMLElement>('.text-caption-track .clip-center-title')!
          .getBoundingClientRect();
        const result = {
          iconRight: icons.right,
          labels: positions,
          count: document.querySelectorAll('.text-caption-track .clip-center-title svg').length,
        };
        dispose();
        return result;
      }, composition);
      expect(result.count).toBe(locked ? 2 : 1);
      expect(result.labels.length).toBeGreaterThan(0);
      expect(result.labels.every((left) => left >= result.iconRight)).toBe(true);
    },
    30000,
  );

  it('bounds icons and handles during rapid diagonal scrolling over 10000 items', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, i) => ({
        ...(i % 100 === 1 ? caption : colorClip(String(i))),
        id: String(i),
        name: `Item ${i}`,
        locked: true,
        ...(i % 100 === 1
          ? { isAiGenerated: true, captionLayerId: `caption-${Math.floor(i / 50)}` }
          : { trackId: `track-${Math.floor(i / 50)}` }),
        timelineStartMs: (i % 50) * 1000,
        order: Math.floor(i / 50),
      })),
    };
    const result = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { scroll, frame, nextTick, dispose, canvas } = await host.mountTimeline(composition, 50, 2000);
      const times: number[] = [],
        nodes: number[] = [],
        handles: number[] = [];
      for (let i = 0; i < 60; i++) {
        await frame();
        const start = performance.now();
        scroll.scrollLeft = (i % 5) * 2600;
        scroll.scrollTop = (i % 7) * 1400;
        scroll.dispatchEvent(new Event('scroll'));
        await nextTick();
        times.push(performance.now() - start);
        nodes.push(document.querySelectorAll('.timeline-selection-surface *').length);
        handles.push(document.querySelectorAll('.trim-handle').length);
      }
      const controls = [...document.querySelectorAll<HTMLElement>('[data-timeline-clip-id]')];
      const result = {
        medianMs: times.sort((a, b) => a - b)[30]!,
        p95Ms: times[57]!,
        maxNodes: Math.max(...nodes),
        maxHandles: Math.max(...handles),
        icons: document.querySelectorAll('.clip-center-title svg, .canvas-clip-icons svg').length,
        transformed: controls.every((control) => control.style.transform.startsWith('translate3d(')),
        canvasWidth: canvas.width,
        viewportWidth: scroll.clientWidth,
      };
      dispose();
      return result;
    }, composition);
    await writeFile(
      `/tmp/beam-timeline-${process.env.BEAM_TIMELINE_BASELINE === '1' ? 'before' : 'after'}.json`,
      JSON.stringify(result),
    );
    console.info(
      'Rapid scroll DOM benchmark:',
      process.env.BEAM_TIMELINE_BASELINE === '1' ? 'before' : 'after',
      result,
    );
    expect(result.transformed).toBe(true);
    expect(result.icons).toBeGreaterThan(0);
    expect(result.maxNodes).toBeLessThan(2500);
    expect(result.maxHandles).toBeLessThan(500);
    expect(result.canvasWidth).toBe(result.viewportWidth);
  }, 60000);

  it.each(['light', 'dark'])(
    'fills every lane with matching rounded controls in the %s theme',
    async (theme) => {
      const composition: ClipComposition = {
        schemaVersion: 14,
        assets: [],
        keyboardCaptionSessions: [],
        clips: [colorClip(), shape, caption],
      };
      const result = await page.evaluate(
        async ({ composition, zoom, theme }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const host = (await load(
            '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
          )) as typeof import('./timeline-browser-host');
          const { dispose, settle } = await host.mountTimeline(composition, 10, 100, [zoom]);
          await settle();
          const rows = [...document.querySelectorAll<HTMLElement>('.tracks-stack [data-timeline-row-id]')];
          const controls = [
            ...document.querySelectorAll<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]'),
          ].map((element) => {
            const lane = element.parentElement!,
              bounds = element.getBoundingClientRect(),
              row = lane.getBoundingClientRect();
            return {
              height: bounds.height,
              laneHeight: row.height,
              offset: bounds.top - row.top,
              radius: getComputedStyle(element).borderRadius,
              transform: element.style.transform,
            };
          });
          const result = { heights: rows.map((row) => row.getBoundingClientRect().height), controls };
          dispose();
          return result;
        },
        { composition, zoom, theme },
      );
      expect(new Set(result.heights).size).toBe(1);
      expect(result.controls).toHaveLength(4);
      for (const control of result.controls) {
        expect(control.height).toBe(control.laneHeight);
        expect(control.offset).toBe(0);
        expect(control.radius).toBe('6px');
        expect(control.transform).toMatch(/^translate3d\(/);
      }
    },
    30000,
  );

  it('keeps existing clip pixels under their controls in the first frames after inserting a shape', async () => {
    const recording = { ...colorClip('recording'), fill: { kind: 'color' as const, color: '#1959b7' } };
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: [recording],
    };
    const result = await page.evaluate(
      async ({ composition, shape }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        const { state, canvas, nextTick, frame, dispose } = await host.mountTimeline(composition, 10, 100);
        state.composition = { ...composition, clips: [...composition.clips, shape] };
        await nextTick();
        const samples = [];
        for (let index = 0; index < 6; index++) {
          await frame();
          const control = document.querySelector<HTMLElement>('[data-timeline-clip-id="recording"]')!,
            rect = control.getBoundingClientRect(),
            origin = canvas.getBoundingClientRect();
          const x = Math.floor(((rect.left + rect.width / 2 - origin.left) * canvas.width) / origin.width);
          const y = Math.floor(((rect.top + rect.height / 2 - origin.top) * canvas.height) / origin.height);
          samples.push([...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data]);
        }
        const animations = document
          .getAnimations()
          .filter((animation) => (animation.effect as KeyframeEffect)?.target?.closest?.('.tracks-stack')).length;
        dispose();
        return { samples, animations };
      },
      { composition, shape },
    );
    console.info('Timeline insertion pixels:', result);
    expect(result.animations).toBe(0);
    expect(
      result.samples.every(
        (pixel) =>
          pixel[3]! >= 250 && pixel.slice(0, 3).every((value, index) => Math.abs(value - [25, 89, 183][index]!) <= 3),
      ),
    ).toBe(true);
  }, 30000);
  it('reveals the same rounded handles only on track hover or keyboard focus for every clip type', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: [colorClip(), shape, caption],
    };
    const controls = await page.evaluate(
      async ({ composition, zoom }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        await host.mountTimeline(composition, 10, 100, [zoom]);
        return [...document.querySelectorAll<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]')].map(
          (element) => {
            const rect = element.getBoundingClientRect();
            return {
              selector: element.dataset.timelineZoomId
                ? `[data-timeline-zoom-id="${element.dataset.timelineZoomId}"]`
                : `[data-timeline-clip-id="${element.dataset.timelineClipId}"]`,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          },
        );
      },
      { composition, zoom },
    );
    const handles = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.trim-handle')].map((element) => {
          const style = getComputedStyle(element);
          return {
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            leftRadius: style.borderTopLeftRadius,
            rightRadius: style.borderTopRightRadius,
          };
        }),
      );
    await page.mouse.move(1100, 500);
    expect((await handles()).every((handle) => handle.opacity === '0' && handle.pointerEvents === 'none')).toBe(true);
    for (const control of controls) {
      await page.mouse.move(control.x, control.y);
      const hovered = await page.$eval(control.selector, (element) =>
        [...element.querySelectorAll('.trim-handle')].map((handle) => getComputedStyle(handle).opacity),
      );
      expect(hovered).toEqual(['1', '1']);
    }
    await page.mouse.move(1100, 500);
    await page.focus(controls[0]!.selector);
    expect(
      await page.$eval(controls[0]!.selector, (element) =>
        [...element.querySelectorAll('.trim-handle')].map((handle) => getComputedStyle(handle).opacity),
      ),
    ).toEqual(['1', '1']);
    const rounded = await handles();
    expect(rounded.every((handle) => handle.leftRadius === '6px' || handle.rightRadius === '6px')).toBe(true);
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      host.unmountTimeline();
    });
  }, 30000);
  it('presents labels and hover handles above the canvas despite transformed row stacking', async () => {
    const box = await page.evaluate(async (zoom) => {
      document.documentElement.classList.add('dark');
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      await host.mountTimeline({ schemaVersion: 14, assets: [], keyboardCaptionSessions: [], clips: [] }, 10, 100, [
        { ...zoom, endMs: 5000 },
      ]);
      const rect = document.querySelector('[data-timeline-zoom-id]')!.getBoundingClientRect();
      return {
        x: Math.ceil(rect.left),
        y: Math.ceil(rect.top),
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };
    }, zoom);
    const screenshotPixels = async () => {
      const png = await page.screenshot({ clip: box });
      return page.evaluate(
        async (bytes) => {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let foreground = 0;
          const edge = [];
          for (let y = 4; y < canvas.height - 4; y++) {
            for (let x = 2; x < canvas.width - 2; x++) {
              const offset = (y * canvas.width + x) * 4;
              if (x < 8) edge.push(...pixels.slice(offset, offset + 3));
              else if (pixels[offset]! > 180 && pixels[offset + 1]! > 180 && pixels[offset + 2]! > 180) foreground++;
            }
          }
          return { foreground, edge };
        },
        [...png],
      );
    };
    await page.mouse.move(1100, 500);
    const idle = await screenshotPixels();
    expect(idle.foreground).toBeGreaterThan(20);
    await page.hover('[data-timeline-zoom-id]');
    const hovered = await screenshotPixels();
    expect(hovered.edge.filter((value, index) => value !== idle.edge[index]).length).toBeGreaterThan(20);
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      host.unmountTimeline();
    });
  }, 30000);
  it.each([null, 'c'])(
    'keeps the canvas aligned with topmost controls during reordering (dragged: %s)',
    async (dragged) => {
      const colors = { a: '#1959b7', b: '#278557', c: '#b83c3c' };
      const composition: ClipComposition = {
        schemaVersion: 14,
        assets: [],
        keyboardCaptionSessions: [],
        clips: Object.entries(colors).map(([id, color], index) => ({
          ...colorClip(id, 0, index),
          fill: { kind: 'color', color },
        })),
      };
      const result = await page.evaluate(
        async ({ composition, colors, dragged }) => {
          const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
          const host = (await load(
            '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
          )) as typeof import('./timeline-browser-host');
          const { state, canvas, nextTick, frame, dispose } = await host.mountTimeline(composition, 10, 100);
          if (dragged)
            document
              .querySelector(`[data-timeline-clip-id="${dragged}"]`)!
              .closest('.track-row')!
              .classList.add('dragging');
          state.composition = {
            ...composition,
            clips: composition.clips.map((clip) => ({ ...clip, order: 2 - clip.order })),
          };
          await nextTick();
          const samples = [];
          for (let index = 0; index < 10; index++) {
            await frame();
            // Sample after every rAF callback has painted, rather than between callbacks.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const origin = canvas.getBoundingClientRect();
            for (const control of document.querySelectorAll<HTMLElement>('[data-timeline-clip-id]')) {
              const rect = control.getBoundingClientRect(),
                x = rect.left + rect.width / 2,
                y = rect.top + rect.height * 0.7;
              const topmost = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-timeline-clip-id]');
              if (!topmost) continue;
              const pixel = canvas
                .getContext('2d')!
                .getImageData(
                  Math.floor(((x - origin.left) * canvas.width) / origin.width),
                  Math.floor(((y - origin.top) * canvas.height) / origin.height),
                  1,
                  1,
                ).data;
              const color = colors[topmost.dataset.timelineClipId as keyof typeof colors];
              const expected = color
                .slice(1)
                .match(/../g)!
                .map((channel) => parseInt(channel, 16));
              samples.push({
                index,
                id: topmost.dataset.timelineClipId,
                pixel: [...pixel],
                expected,
                matches: pixel[3]! >= 250 && expected.every((value, channel) => Math.abs(value - pixel[channel]!) <= 3),
              });
            }
          }
          dispose();
          return samples;
        },
        { composition, colors, dragged },
      );
      // Rounded corners can expose a row background rather than a semantic control.
      expect(result.length).toBeGreaterThanOrEqual(20);
      expect(new Set(result.map((sample) => sample.index)).size).toBe(10);
      expect(
        result.every((sample) => sample.matches),
        JSON.stringify(result.filter((sample) => !sample.matches)),
      ).toBe(true);
    },
    30000,
  );
  it('draws 10000 clips on one bounded canvas, retains semantic controls and repaints far scrolling', async () => {
    const clips = Array.from({ length: 10000 }, (_, index) => ({
      ...colorClip(String(index)),
      trackId: 'track',
      timelineStartMs: index * 1000,
    }));
    const composition: ClipComposition = { schemaVersion: 14, assets: [], clips, keyboardCaptionSessions: [] };
    const result = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, scroll, canvas, settle, painted } = await host.mountTimeline(composition, 10000, 10000);
      const first = {
        canvases: document.querySelectorAll('canvas').length,
        painted: painted(),
        width: canvas.width,
        viewport: scroll.clientWidth,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
      scroll.dispatchEvent(new Event('scroll'));
      await settle();
      const last = {
        painted: painted(),
        left: canvas.getBoundingClientRect().left,
        viewportLeft: scroll.getBoundingClientRect().left,
        scroll: scroll.scrollLeft,
        controls: document.querySelectorAll('[data-timeline-clip-id]').length,
      };
      dispose();
      return { first, last };
    }, composition);
    expect(result.first.canvases).toBe(1);
    expect(result.first.painted).toBe(true);
    expect(result.first.width).toBe(result.first.viewport);
    expect(result.first.controls).toBeLessThan(250);
    expect(result.last.controls).toBeLessThan(250);
    expect(result.last.painted).toBe(true);
    expect(result.last.left).toBe(result.last.viewportLeft);
  }, 30000);
  it('keeps canvas coverage during fast diagonal scrolling and paints newly mounted lanes in the first frame', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: `lane-${Math.floor(index / 50)}`,
        order: Math.floor(index / 50),
        timelineStartMs: (index % 50) * 1000,
      })),
    };
    const samples = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, scroll, canvas, frame, painted } = await host.mountTimeline(composition, 50, 2000);
      const samples = [];
      for (const [x, y] of [
        [4000, 3000],
        [1000, 32],
        [12000, 5500],
        [8000, 1000],
        [0, 0],
      ]) {
        scroll.scrollLeft = x!;
        scroll.scrollTop = y!;
        scroll.dispatchEvent(new Event('scroll'));
        const bounds = canvas.getBoundingClientRect(),
          viewport = scroll.getBoundingClientRect();
        const covered =
          bounds.left <= viewport.left &&
          bounds.top <= viewport.top &&
          bounds.right >= viewport.left + scroll.clientWidth &&
          bounds.bottom >= viewport.top + scroll.clientHeight;
        await frame();
        samples.push({
          covered,
          painted: painted(),
          controls: document.querySelectorAll('[data-timeline-clip-id]').length,
        });
      }
      dispose();
      return samples;
    }, composition);
    expect(samples.every((sample) => sample.covered)).toBe(true);
    expect(samples.every((sample) => sample.painted)).toBe(true);
    expect(samples.every((sample) => sample.controls < 250)).toBe(true);
  }, 30000);

  it('moves the playhead without repainting unchanged artwork on a 10000-clip document', async () => {
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: 'track',
        timelineStartMs: index * 1000,
      })),
    };
    const result = await page.evaluate(async (composition) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const host = (await load(
        '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
      )) as typeof import('./timeline-browser-host');
      const { dispose, state, canvas, scroll, frame, settle, nextTick } = await host.mountTimeline(
        composition,
        10000,
        10000,
      );
      const ctx = canvas.getContext('2d')!,
        clear = ctx.clearRect.bind(ctx);
      let repaints = 0;
      ctx.clearRect = (x, y, width, height) => {
        if (width === scroll.clientWidth && height === scroll.clientHeight) repaints++;
        clear(x, y, width, height);
      };
      state.isPlaying = true;
      await settle();
      repaints = 0;
      const samples: number[] = [];
      for (let i = 1; i <= 60; i++) {
        await frame();
        const start = performance.now();
        state.currentTime = i / 60;
        await nextTick();
        samples.push(performance.now() - start);
      }
      await settle();
      samples.sort((a, b) => a - b);
      const result = { repaints, medianMs: samples[30]!, p95Ms: samples[57]!, scroll: scroll.scrollLeft };
      dispose();
      return result;
    }, composition);
    console.info('Timeline 10000-clip playback updates:', result);
    expect(result.scroll).toBe(0);
    expect(result.repaints).toBe(0);
  }, 30000);

  it('composites the playhead and viewport bitmap without allocating layers for all 10000 clips', async () => {
    const cdp = await page.createCDPSession();
    let layers: Protocol.LayerTree.Layer[] = [];
    cdp.on('LayerTree.layerTreeDidChange', (event) => {
      layers = event.layers ?? [];
    });
    await cdp.send('LayerTree.enable');
    const composition: ClipComposition = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: 10000 }, (_, index) => ({
        ...colorClip(String(index)),
        trackId: 'track',
        timelineStartMs: index * 1000,
      })),
    };
    try {
      const geometry = await page.evaluate(async (composition) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        const { state, scroll, settle } = await host.mountTimeline(composition, 10000, 10000);
        state.isPlaying = true;
        state.currentTime = 0.5;
        await settle();
        const playhead = document.querySelector<HTMLElement>('.timeline-playhead')!;
        return {
          width: scroll.clientWidth,
          height: scroll.clientHeight,
          transform: playhead.style.transform,
          left: playhead.style.left,
        };
      }, composition);
      expect(geometry.transform).toMatch(/^translate3d\(/);
      expect(geometry.left).toBe('');
      const { root } = await cdp.send('DOM.getDocument');
      for (const selector of ['.timeline-content-surface', '.timeline-playhead']) {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        const { node } = await cdp.send('DOM.describeNode', { nodeId });
        const layer = layers.find((layer) => layer.backendNodeId === node.backendNodeId);
        expect(layer, selector).toBeDefined();
        const reasons = await cdp.send('LayerTree.compositingReasons', { layerId: layer!.layerId });
        expect(reasons.compositingReasonIds).toContain('WillChangeTransform');
        if (selector === '.timeline-content-surface') {
          expect(layer!.width).toBeLessThanOrEqual(geometry.width);
          expect(layer!.height).toBeLessThanOrEqual(geometry.height);
        }
      }
      console.info('Timeline 10000-clip composited layers:', layers.length);
      expect(layers.length).toBeLessThan(250);
    } finally {
      await page.evaluate(async () => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const host = (await load(
          '/apps/desktop/src/components/editor/timeline/tests/timeline-browser-host.ts',
        )) as typeof import('./timeline-browser-host');
        host.unmountTimeline();
      });
      await cdp.detach();
    }
  }, 30000);
});
