// @vitest-environment node
// Explicit hardware/backend integration: BEAM_HEADLESS_TEST=1 enables real Chromium codecs and Canvas/WebGL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromiumExecutable } from './chromium-install';
import { chromiumSettings } from './chromium-settings';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { colorClip, group } from '../../../packages/engine/src/scene/tests/scene-fixtures';
import { composition as screenDocument } from '../../../packages/runtime/src/rendering/tests/render.test-support';
import type { ProjectEditorData } from '@beam/engine/capture/capture-session';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import type { ShapeClip } from '@beam/engine';

describe.runIf(process.env.BEAM_HEADLESS_TEST === '1')('completed preview/export frames in displayless Chrome', () => {
  let server: ViteDevServer, browser: Browser, page: Page, temp: string;
  beforeAll(async () => {
    temp = await mkdtemp(resolve(homedir(), '.cache/beam-test-'));
    server = await createServer({
      root: fileURLToPath(new URL('../../../', import.meta.url)),
      cacheDir: resolve(temp, 'vite'),
      server: { host: '127.0.0.1', port: 0 },
      logLevel: 'silent',
      plugins: [
        {
          name: 'beam-render-test',
          configureServer(server) {
            server.middlewares.use('/beam-render-test', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><title>Beam render verification</title>');
            });
          },
        },
      ],
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No server port');
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
    await page.goto(`http://127.0.0.1:${address.port}/beam-render-test`);
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });
  const snapshot = (): CompositionSnapshot => ({
    duration: 1,
    render: { fps: 10, sourceWidth: null, sourceHeight: null },
    canvas: normalizeOutputCanvas({
      width: 128,
      height: 72,
      showBackground: false,
    }),
    background: null,
    blurPercent: 0,
    zooms: [],
    cursor: {
      available: false,
      events: [],
      telemetry: [],
      shapes: {},
      catalog: {},
      missing: [],
    },
    cursorPack: null,
    cursorSettings: { ...createDefaultCursorPresentation(), enabled: false },
    composition: {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: [colorClip()],
    },
  });
  const compare = async (snapshot: CompositionSnapshot, time = 0.5) =>
    page.evaluate(
      async ({ snapshot, time }) => {
        const renderPath = '/packages/runtime/src/rendering/render.ts';
        const previewPath = '/apps/desktop/src/components/editor/canvas/runtime-preview.ts';
        const layersPath = '/packages/engine/src/composition/scene-layers.ts';
        // Keep imports inside the browser realm; Vitest rewrites lexical imports to SSR helpers.
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { renderCompositionFrame } = (await load(renderPath)) as typeof import('@beam/runtime/rendering/render');
        const { createRuntimePreview } = (await load(
          previewPath,
        )) as typeof import('../../desktop/src/components/editor/canvas/runtime-preview');
        const { resolveCompositionSceneLayers } = (await load(
          layersPath,
        )) as typeof import('@beam/engine/composition/scene-layers');
        const width = snapshot.canvas.width,
          height = snapshot.canvas.height;
        const preview = document.createElement('canvas');
        preview.width = width;
        preview.height = height;
        const exported = new OffscreenCanvas(width, height);
        const output = exported.getContext('2d')!,
          context = preview.getContext('2d')!;
        const cursor = snapshot.cursorSettings;
        const source = new OffscreenCanvas(width, height);
        const pixels = source.getContext('2d')!;
        pixels.fillStyle = '#3366cc';
        pixels.fillRect(0, 0, width, height);
        pixels.fillStyle = '#ffcc33';
        pixels.fillRect(0, 0, width / 2, height / 2);
        const bitmap = await createImageBitmap(source);
        const frame = layersHaveScreen()
          ? {
              bitmap,
              width,
              height,
              timestampSeconds: time,
              clipId: 'screen',
              durationSeconds: 1,
              byteSize: width * height * 4,
              close: () => bitmap.close(),
            }
          : null;
        function layersHaveScreen() {
          return snapshot.composition.clips.some((clip) => clip.kind === 'screen');
        }
        const visuals = new Map(
          snapshot.composition.clips
            .filter((clip) => clip.kind === 'screen')
            .map((clip) => [clip.id, { source: bitmap, width, height }]),
        );

        const host = createRuntimePreview({
          props: {
            isPlaying: true,
            currentTime: time,
            duration: snapshot.duration,
            composition: snapshot.composition,
            outputCanvas: snapshot.canvas,
            frameFor: () => frame,
            frameVersion: 1,
            previewQuality: 'full',
            playbackState: 'paused',
            playbackError: null,
            cursorSelection: cursor.selection,
            cursorPack: snapshot.cursorPack,
            cursorSize: cursor.size,
            cursorColor: cursor.color,
            enableShadow: cursor.shadow.enabled,
            shadowBlur: cursor.shadow.blur,
            shadowColor: cursor.shadow.color,
            shadowDirection: cursor.shadow.direction,
            clickEffects: cursor.clickEffects,
            motion: cursor.motion,
            autoHide: cursor.autoHide,
            zoomElements: snapshot.zooms,
            zoomAutoFollow: snapshot.zoomAutoFollow,
            zoomMotionBlur: snapshot.zoomMotionBlur,
            selectedZoom: null,
            selectedBackground: null,
            activeTab: '',
            selectedTransformClip: null,
            editorData: { cursor: snapshot.cursor } as ProjectEditorData,
          },
          images: new Map(),
          cursorImage: () => null,
          cursorEnabled: () => cursor.enabled,
          watermarkImage: () => null,
          drafts: () => ({}),
          editingCaptionId: () => null,
          drawBackground: (ctx, bounds) => {
            if (snapshot.background?.kind === 'color') {
              ctx.fillStyle = snapshot.background.color;
              ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
          },
        });
        const layers = resolveCompositionSceneLayers(snapshot.composition, time * 1000);
        renderCompositionFrame(
          output,
          frame ? { source: bitmap, width, height } : null,
          snapshot,
          time,
          null,
          undefined,
          visuals,
          undefined,
          undefined,
          layers,
        );
        host.draw(context, { x: 0, y: 0, width, height }, frame, layers);
        const a = output.getImageData(0, 0, width, height).data,
          b = context.getImageData(0, 0, width, height).data;
        let differingChannels = 0,
          maximumError = 0;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) differingChannels++;
          maximumError = Math.max(maximumError, Math.abs(a[i]! - b[i]!));
        }
        const center = Array.from(
          a.slice(
            (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4,
            (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 4,
          ),
        );
        let contrastingPixels = 0;
        for (let i = 0; i < a.length; i += 4) if (a[i + 1] || a[i + 2]) contrastingPixels++;
        host.dispose();
        bitmap.close();
        return { differingChannels, maximumError, center, contrastingPixels };
      },
      { snapshot, time },
    );
  it('preserves exact native rectangle pixels through fractional zooms, overlaps, alpha and shadows', async () => {
    const clips: ShapeClip[] = Array.from({ length: 10000 }, (_, i) => ({
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      id: `rectangle-${i}`,
      kind: 'shape',
      assetId: '',
      name: 'Rectangle',
      enabled: true,
      order: i,
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      fillEnabled: i % 3 === 0,
      fillColor: '#ab304a',
      borderColor: i % 2 ? '#ffc24a' : '#357fea',
      borderWidth: 8,
      transform: { x: ((i * 17) % 200) / 300, y: ((i * 13) % 120) / 180, width: 0.16, height: 0.17 },
    }));
    const differences = await page.evaluate(async (clips) => {
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
      const { drawShapeClip } = (await load(
        '/packages/runtime/src/composition/shape/render-shape-clip.ts',
      )) as typeof import('../../../packages/runtime/src/composition/shape/render-shape-clip');
      const { withOrderedGpuShapes, disposeGpuShapes } = (await load(
        '/packages/runtime/src/composition/shape/ordered-gpu-shapes.ts',
      )) as typeof import('../../../packages/runtime/src/composition/shape/ordered-gpu-shapes');
      const canvas = new OffscreenCanvas(300, 180),
        ctx = canvas.getContext('2d')!;
      const viewport = { x: 1.25, y: 2.5, width: 277.3, height: 155.9 };
      const results: { different: number; max: number }[] = [];
      for (const [scale, alpha, shadow] of [
        [0.5, 1, false],
        [0.83, 1, false],
        [1.37, 1, false],
        [2.03, 1, false],
        [0.83, 0.45, false],
        [1.37, 0.6, true],
      ] as const) {
        // Shadow/alpha cases need fewer overlaps to expose edge errors and stay bounded.
        const shapes = shadow || alpha !== 1 ? clips.slice(0, 30) : clips;
        const paint = (retained: boolean) => {
          ctx.resetTransform();
          ctx.clearRect(0, 0, 300, 180);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(3, 4, 290, 168, 12);
          ctx.clip();
          ctx.translate(0.27, 0.63);
          ctx.scale(scale, scale);
          const paintClip = (entry: ShapeClip, batch?: Parameters<Parameters<typeof withOrderedGpuShapes>[1]>[0]) => {
            const clip = {
              ...entry,
              opacityEnabled: alpha !== 1,
              opacity: alpha * 100,
              backdropBlur: 0,
              shadowEnabled: shadow,
              shadowDirection: 'all' as const,
              shadowBlur: 12,
              shadowColor: '#000000',
            };
            if (retained) {
              const native = () => drawShapeClip(ctx, clip, viewport);
              if (!batch!.tryShape(clip, viewport, native)) {
                batch!.flush();
                native();
              }
              return;
            }
            const rect = {
              x: viewport.x + clip.transform.x * viewport.width,
              y: viewport.y + clip.transform.y * viewport.height,
              width: clip.transform.width * viewport.width,
              height: clip.transform.height * viewport.height,
            };
            ctx.save();
            ctx.globalAlpha *= alpha;
            if (shadow) {
              ctx.shadowColor = '#000000';
              ctx.shadowBlur = (12 * viewport.height) / 1080;
            }
            ctx.save();
            ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
            ctx.rotate(0);
            ctx.translate(-rect.width / 2, -rect.height / 2);
            ctx.scale(rect.width, rect.height);
            ctx.beginPath();
            ctx.rect(0, 0, 1, 1);
            ctx.restore();
            if (clip.fillEnabled) {
              ctx.fillStyle = clip.fillColor;
              ctx.fill();
              ctx.shadowColor = 'transparent';
            }
            ctx.strokeStyle = clip.borderColor;
            ctx.lineWidth = (8 * viewport.height) / 1080;
            ctx.stroke();
            ctx.restore();
          };
          if (retained) withOrderedGpuShapes(ctx, (batch) => shapes.forEach((clip) => paintClip(clip, batch)));
          else shapes.forEach((clip) => paintClip(clip));
          ctx.restore();
          return ctx.getImageData(0, 0, 300, 180).data;
        };
        const before = paint(false),
          after = paint(true);
        let different = 0,
          max = 0;
        for (let i = 0; i < before.length; i++) {
          if (before[i] !== after[i]) different++;
          max = Math.max(max, Math.abs(before[i]! - after[i]!));
        }
        results.push({ different, max });
      }
      disposeGpuShapes(ctx);
      return results;
    }, clips);
    expect(differences).toEqual(Array.from({ length: 6 }, () => ({ different: 0, max: 0 })));
  }, 60000);
  it('paints the same completed flat frame through both hosts', async () => {
    expect(await compare(snapshot())).toMatchObject({
      differingChannels: 0,
      maximumError: 0,
      center: [255, 0, 0, 255],
    });
  });
  it('matches host-supplied background pixels behind the same scene geometry', async () => {
    const value = snapshot();
    value.canvas.showBackground = true;
    value.background = { kind: 'color', color: '#772255' };
    const clip = value.composition.clips[0];
    if (clip?.kind === 'color') clip.transform = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(await compare(value)).toMatchObject({
      differingChannels: 0,
      maximumError: 0,
    });
  });
  it('flattens overlapping children before applying group opacity and nested transforms', async () => {
    const value = snapshot();
    const green = colorClip('b', 0, 1);
    green.fill = { kind: 'color', color: '#00ff00' };
    value.composition.clips.push(green);
    value.composition.scene = {
      version: 1,
      roots: ['outer'],
      groups: [group('outer', ['g']), { ...group('g', ['a', 'b']), opacity: 0.5 }],
    };
    const result = await compare(value);
    expect(result.differingChannels).toBe(0);
    expect(result.center[1]).toBeGreaterThan(120);
    expect(result.center[0]).toBeLessThan(30);
  });
  it('preserves sibling group pixels while reusing nested isolation surfaces', async () => {
    const value = snapshot();
    const green = colorClip('b', 0, 1);
    green.fill = { kind: 'color', color: '#00ff00' };
    value.composition.clips.push(green);
    value.composition.scene = {
      version: 1,
      roots: ['outer'],
      groups: [
        { ...group('outer', ['red', 'green']), opacity: 0.8 },
        { ...group('red', ['a']), opacity: 0.5 },
        { ...group('green', ['b']), opacity: 0.5 },
      ],
    };
    const result = await compare(value);
    expect(result.differingChannels).toBe(0);
    expect(result.center[1]).toBeGreaterThan(90);
    expect(result.center[0]).toBeLessThan(90);
  });
  it('matches animated transforms, colors, masks and transitions across reverse seeks', async () => {
    const value = snapshot();
    value.composition.scene = {
      version: 1,
      roots: ['g'],
      groups: [
        {
          ...group(),
          mask: { shape: 'ellipse', x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
          transform: {
            x: 0.05,
            y: 0,
            rotation: 10,
            scaleX: 0.8,
            scaleY: 0.8,
          },
        },
      ],
    };
    value.composition.animations = {
      version: 1,
      tracks: [
        {
          id: 'color',
          targetId: 'a',
          property: 'fill.color',
          interpolation: 'color',
          keyframes: [
            { timeMs: 0, value: '#ff0000' },
            { timeMs: 1000, value: '#0000ff' },
          ],
        },
      ],
    };
    value.canvas.transitions = {
      entry: { durationMs: 300, preset: { kind: 'fade' } },
      exit: null,
    };
    for (const time of [0.1, 0.9, 0.5, 0.1])
      expect(await compare(value, time)).toMatchObject({
        differingChannels: 0,
        maximumError: 0,
      });
  });
  it('matches decoded screens, cursor ripples, camera zoom and animated nested geometry', async () => {
    const value = snapshot();
    value.composition = { ...screenDocument(), schemaVersion: 14 };
    value.render.sourceWidth = 128;
    value.render.sourceHeight = 72;
    value.composition.scene = {
      version: 1,
      roots: ['g'],
      groups: [{ ...group('g', ['screen']), opacity: 0.8 }],
    };
    value.composition.animations = {
      version: 1,
      tracks: [
        {
          id: 'move',
          targetId: 'g',
          property: 'transform.x',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 0.15 },
          ],
        },
      ],
    };
    value.zooms = [
      {
        id: 'zoom',
        sessionId: '',
        linkedClipId: null,
        startMs: 0,
        endMs: 1000,
        mode: 'manual',
        focus: { cx: 0.4, cy: 0.5 },
        depth: 2,
        projection: '3d',
        tiltIntensity: 0.3,
      },
    ];
    value.cursor.available = true;
    value.cursorSettings.enabled = true;
    value.cursorSettings.motion.motionBlur = 0;
    value.cursor.events = [
      {
        event: 'move',
        sessionNs: 0,
        pixelX: 64,
        pixelY: 36,
        normalizedX: 0.5,
        normalizedY: 0.5,
        visible: true,
      },
      {
        event: 'button',
        sessionNs: 200000000,
        button: 1,
        pressed: true,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    ];
    value.cursorSettings.clickEffects.left.rippleEnabled = true;
    for (const time of [0.25, 0.8, 0.25])
      expect(await compare(value, time)).toMatchObject({
        differingChannels: 0,
        maximumError: 0,
      });
  });
  it('matches generated text in an animated overlay group at cut boundaries', async () => {
    const value = snapshot();
    value.composition.clips.push({
      id: 'text',
      name: 'Text',
      kind: 'caption',
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      order: 1,
      enabled: true,
      caption: {
        type: 'text',
        sentences: [
          {
            id: 'sentence',
            text: 'Beam',
            startMs: 0,
            endMs: 1000,
            words: [],
          },
        ],
        style: { ...createDefaultCaptionStyle(), fontSize: 18 },
      },
    });
    value.composition.scene = {
      version: 1,
      roots: ['a', 'overlay'],
      groups: [{ ...group('overlay', ['text']), space: 'overlay', opacity: 0.7 }],
    };
    value.composition.animations = {
      version: 1,
      tracks: [
        {
          id: 'fade',
          targetId: 'overlay',
          property: 'opacity',
          interpolation: 'number',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 1 },
          ],
        },
      ],
    };
    expect((await compare(value, 0.5)).contrastingPixels).toBeGreaterThan(0);
    for (const time of [0, 0.5, 0.999, 1, 0.5])
      expect(await compare(value, time)).toMatchObject({
        differingChannels: 0,
        maximumError: 0,
      });
  });
  it('renders a real blur effect with the same WebGL backend', async () => {
    const value = snapshot();
    value.composition.clips.push({
      ...colorClip('effect', 0, 1),
      kind: 'blur',
      shape: 'rectangle',
      mode: 'blur',
      strength: 60,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000000',
      transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    });
    const result = await compare(value);
    expect(result.differingChannels).toBe(0);
  });
});
