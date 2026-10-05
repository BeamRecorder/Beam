import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePreview } from './runtime-preview';
import { snapshot, context } from '@beam/runtime/rendering/tests/render.test-support';
import { resolveCompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { reactive, toRaw, isProxy } from 'vue';
import type { RuntimePreviewOptions } from './runtime-preview-types';
import type { MediaFrame } from '@beam/runtime/shared/index';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { CompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import type { ShapeClip } from '@beam/engine';

const state = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  camera: vi.fn(),
  motion: vi.fn(),
  background: true,
}));
vi.mock('@beam/runtime/rendering/render', () => ({
  renderCompositionFrame: state.render,
  disposeCompositionRenderer: state.dispose,
}));
vi.mock('@beam/runtime/rendering/snapshot-camera', () => ({
  createSnapshotCameraEvaluator: state.camera,
}));
vi.mock('@beam/engine/cursor/cursor-motion', () => ({
  createCursorMotionPlayer: state.motion,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.background = true;
  state.camera.mockReturnValue({
    sample: () => ({ scale: 1 }),
    invalidate: vi.fn(),
  });
  state.motion.mockReturnValue({ sample: vi.fn() });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return state.background ? context() : null;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
function host() {
  const value = snapshot(),
    cursor = createDefaultCursorPresentation();
  const options: RuntimePreviewOptions = {
    props: {
      isPlaying: true,
      currentTime: 0.5,
      composition: value.composition,
      outputCanvas: value.canvas,
      frameFor: () => null,
      frameVersion: 0,
      previewQuality: 'full',
      playbackState: 'paused',
      playbackError: null,
      cursorSelection: cursor.selection,
      cursorPack: null,
      cursorSize: cursor.size,
      cursorColor: cursor.color,
      enableShadow: false,
      shadowBlur: 0,
      shadowColor: '#000000',
      shadowDirection: 'bottom',
      clickEffects: cursor.clickEffects,
      motion: cursor.motion,
      autoHide: cursor.autoHide,
      selectedBackground: null,
      zoomElements: [],
      selectedZoom: null,
      selectedTransformClip: null,
      activeTab: '',
    },
    images: new Map(),
    cursorImage: () => null,
    watermarkImage: () => null,
    cursorEnabled: () => true,
    drafts: () => ({}),
    editingCaptionId: () => null,
    backgroundCacheKey: () => [0],
    drawBackground: vi.fn(),
  };
  const preview = createRuntimePreview(options),
    ctx = context();
  const layers = () => resolveCompositionSceneLayers(options.props.composition, options.props.currentTime * 1000);
  const draw = (frame: MediaFrame | null = null, width = 100, height = 50) =>
    preview.draw(ctx, { x: 3, y: 4, width, height }, frame, layers());
  const painted = () => ({
    snapshot: state.render.mock.lastCall![2] as CompositionSnapshot,
    layers: state.render.mock.lastCall![9] as CompositionSceneLayers,
  });
  return { preview, options, draw, ctx, painted };
}
it('retains fixed backgrounds across playback ticks and invalidates for keys, resizes and disposal', () => {
  const { draw, options, preview } = host();
  const key: unknown[] = [0];
  options.backgroundCacheKey = () => key;
  for (let frame = 0; frame < 60; frame++) draw();
  expect(options.drawBackground).toHaveBeenCalledOnce();
  key[0] = 1;
  draw();
  key.push('loaded image');
  draw();
  expect(options.drawBackground).toHaveBeenCalledTimes(3);
  draw(null, 101, 50);
  expect(options.drawBackground).toHaveBeenCalledTimes(4);
  preview.dispose();
  draw();
  expect(options.drawBackground).toHaveBeenCalledTimes(5);
});
it('keeps video and transitions live and repaints when returning to a fixed background', () => {
  const { draw, options } = host();
  draw();
  options.backgroundCacheKey = () => null;
  draw();
  draw();
  expect(options.drawBackground).toHaveBeenCalledTimes(3);
  options.backgroundCacheKey = () => [0];
  draw();
  draw();
  expect(options.drawBackground).toHaveBeenCalledTimes(4);
});
it('does not retain a partially painted background after a drawing failure', () => {
  const { draw, options } = host();
  vi.mocked(options.drawBackground).mockImplementationOnce(() => {
    throw new Error('paint failed');
  });
  expect(draw).toThrow('paint failed');
  draw();
  draw();
  expect(options.drawBackground).toHaveBeenCalledTimes(2);
});
it('repaints after a resized surface temporarily loses its context', () => {
  const { draw, options } = host();
  draw();
  state.background = false;
  expect(() => draw(null, 101, 50)).toThrow('Preview background canvas unavailable.');
  state.background = true;
  draw(null, 101, 50);
  expect(options.drawBackground).toHaveBeenCalledTimes(2);
});
it('delegates completed frames and caches camera/motion until their inputs change', () => {
  const { draw, options, painted, ctx } = host();
  draw();
  draw();
  expect(state.render).toHaveBeenCalledTimes(2);
  expect(state.camera).toHaveBeenCalledOnce();
  expect(state.motion).toHaveBeenCalledOnce();
  expect(painted().snapshot.composition).toBe(options.props.composition);
  expect(painted().snapshot.referenceCanvas).toBe(options.props.outputCanvas);
  expect(ctx.translate).toHaveBeenCalledWith(3, 4);
  expect(ctx.restore).toHaveBeenCalledTimes(2);
  options.props.motion.smoothing += 0.1;
  draw();
  expect(state.motion).toHaveBeenCalledTimes(2);
  draw(null, 201, 101);
  expect(state.camera).toHaveBeenCalledTimes(2);
});
it('passes raw immutable capture data and borrows camera history across a late timeline draft', () => {
  const { options, draw } = host();
  options.props.composition = reactive(options.props.composition);
  const clip = options.props.composition.clips[0]!;
  clip.timelineStartMs = 120_000;
  draw();
  const previous = state.camera.mock.results.at(-1)!.value;
  expect(isProxy(state.camera.mock.lastCall![0].composition)).toBe(false);
  const raw = toRaw(options.props.composition);
  options.props.composition = { ...raw, clips: [{ ...raw.clips[0]!, timelineStartMs: 119_000 }] };
  draw();
  expect(state.camera.mock.lastCall![3]).toEqual({ previous, unchangedBeforeMs: 117_650 });
});
it('retains a filtered manual-zoom preview and rebuilds for changed follow settings', () => {
  const { options, draw } = host();
  options.props.isPlaying = false;
  options.props.selectedZoom = {
    id: 'selected',
    mode: 'manual',
    sessionId: 's',
    startMs: 0,
    endMs: 2_000,
    depth: 2,
    focus: { cx: 0.5, cy: 0.5 },
  };
  options.props.zoomElements = [options.props.selectedZoom];
  draw();
  draw();
  expect(state.camera).toHaveBeenCalledOnce();
  options.props.zoomAutoFollow = { safeZone: 0.5, responsiveness: 0.7, directionLock: true };
  draw();
  expect(state.camera).toHaveBeenCalledTimes(2);
  expect(state.camera.mock.lastCall![3]).toBeUndefined();
});
it('renders zoom drafts with unchanged companions and keeps edited captions out of their layer stack', () => {
  const { options, draw, painted } = host();
  const zoom = {
    id: 'selected',
    sessionId: 's',
    startMs: 0,
    endMs: 1000,
    mode: 'manual' as const,
    depth: 2 as const,
    focus: { cx: 0.5, cy: 0.5 },
  };
  const companion = { ...zoom, id: 'other' };
  const draft = { ...zoom, depth: 3 as const };
  options.props.selectedZoom = zoom;
  options.props.zoomElements = [zoom, companion];
  options.zoomDraft = () => reactive(draft);
  draw();
  expect(painted().snapshot.zooms).toEqual([draft, companion]);
  expect(isProxy(painted().snapshot.zooms[0])).toBe(false);
  const screen = options.props.composition.clips[0]!;
  const caption = { ...screen, id: 'caption', kind: 'caption' as const, captionType: 'text' as const, text: 'Hello' };
  // Supply already evaluated layers: authoring validation is owned by engine.
  const layers = resolveCompositionSceneLayers(options.props.composition, 500);
  options.editingCaptionId = () => 'another-caption';
  const evaluated = { ...layers, screen: null, captions: [caption] } as unknown as CompositionSceneLayers;
  const preview = createRuntimePreview(options);
  preview.draw(context(), { x: 0, y: 0, width: 100, height: 50 }, null, evaluated);
  expect(painted().layers.captions).toHaveLength(1);
  expect(painted().layers.screen).toBeNull();
});
it('borrows unchanged evaluated layers and reads host editing state once per frame', () => {
  const { options, ctx, preview } = host();
  const layers = resolveCompositionSceneLayers(options.props.composition, 500);
  options.drafts = vi.fn(() => ({}));
  options.editingCaptionId = vi.fn(() => null);
  preview.draw(ctx, { x: 0, y: 0, width: 100, height: 50 }, null, layers);
  expect(state.render.mock.lastCall![9]).toBe(layers);
  expect(options.drafts).toHaveBeenCalledOnce();
  expect(options.editingCaptionId).toHaveBeenCalledOnce();
});
it('requests media only for media clips even with 10000 generated rectangles', () => {
  const { options, draw } = host();
  const shape: ShapeClip = {
    ...DEFAULT_ANNOTATION_SHAPE_STYLE,
    id: 'rectangle',
    kind: 'shape',
    assetId: '',
    name: 'Rectangle',
    enabled: true,
    order: 1,
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    transform: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
  };
  options.props.composition.clips.push(...Array.from({ length: 10000 }, (_, i) => ({ ...shape, id: `shape-${i}` })));
  options.props.frameFor = vi.fn(() => null);
  draw();
  const evaluated = state.render.mock.lastCall![9] as CompositionSceneLayers;
  expect(evaluated.visualStack.filter((clip) => clip.kind === 'shape')).toHaveLength(10000);
  expect(options.props.frameFor).toHaveBeenCalledExactlyOnceWith('screen');
});
it('copies only drafted layers and restores their original identities when editing ends', () => {
  const { options, ctx, preview } = host();
  const original = options.props.composition.clips[0]!;
  const layers = resolveCompositionSceneLayers(options.props.composition, 500);
  const other = { ...layers.visualStack[0]!, id: 'constructor' };
  layers.visualStack.push(other);
  options.drafts = () => ({ [original.id]: { x: 0.2, y: 0, width: 0.5, height: 1 } });
  const paint = () => preview.draw(ctx, { x: 0, y: 0, width: 100, height: 50 }, null, layers);
  paint();
  const modified = state.render.mock.lastCall![9] as CompositionSceneLayers;
  expect(modified.visualStack[0]).not.toBe(original);
  expect(modified.visualStack[0]?.transform.x).toBe(0.2);
  expect(modified.visualStack[1]).toBe(other);
  expect(original).toMatchObject({ transform: { x: 0 } });
  options.drafts = () => ({});
  paint();
  expect(state.render.mock.lastCall![9]).toBe(layers);
});
it('supplies decoded visual frames, loaded images and the watermark without copying document resources', () => {
  const { draw, options } = host();
  const frame = {
    bitmap: {} as ImageBitmap,
    width: 100,
    height: 50,
    timestampSeconds: 0.5,
    clipId: 'screen',
    durationSeconds: 1,
    byteSize: 20000,
    close: () => {},
  };
  options.props.frameFor = () => frame;
  draw(frame);
  expect(state.render.mock.lastCall![1]).toEqual({
    source: frame.bitmap,
    width: 100,
    height: 50,
  });
  expect((state.render.mock.lastCall![6] as Map<string, unknown>).has('screen')).toBe(true);
  const image = {
    complete: true,
    naturalWidth: 100,
    naturalHeight: 50,
  } as HTMLImageElement;
  options.props.frameFor = () => null;
  options.images = new Map([['screen-asset', image]]);
  options.watermarkImage = () => image;
  draw();
  expect((state.render.mock.lastCall![6] as Map<string, unknown>).size).toBe(2);
  options.images = new Map([['screen-asset', { ...image, complete: false } as HTMLImageElement]]);
  draw();
  expect((state.render.mock.lastCall![6] as Map<string, unknown>).size).toBe(1);
});
it('applies editing drafts and resets only the selected crop while preserving authored data', () => {
  const { options, draw, painted } = host();
  const screen = options.props.composition.clips[0]!;
  if (screen.kind !== 'screen') throw new Error('screen');
  screen.crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  options.props.selectedTransformClip = screen;
  options.props.isCropping = true;
  options.drafts = () => ({ [screen.id]: { x: 0.1, y: 0, width: 0.8, height: 1 } });
  draw();
  expect(painted().layers.screen).toMatchObject({
    crop: { x: 0, y: 0, width: 1, height: 1 },
    transform: { x: 0.1 },
    cameraFramingPreset: 'custom',
  });
  expect(screen.crop.x).toBe(0.2);
  expect(screen.transform.x).toBe(0);
  screen.appearance.frame = 'iphone-16-max';
  draw();
  options.props.isCropping = false;
  draw();
  expect(painted().layers.screen?.transform.x).toBe(0.1);
  options.editingCaptionId = () => screen.id;
  draw();
  expect(painted().layers.screen?.enabled).toBe(false);
});
it('keeps manual selection previews out of playback zoom evaluation and projects their selected tilt', () => {
  const { options, draw, painted } = host();
  const zoom = {
    id: 'zoom',
    sessionId: '',
    startMs: 0,
    endMs: 1000,
    focus: { cx: 0.5, cy: 0.5 },
    depth: 2 as const,
    mode: 'manual' as const,
    projection: '3d' as const,
  };
  options.props.zoomElements = [zoom];
  options.props.selectedZoom = zoom;
  options.props.isPlaying = false;
  draw();
  expect(painted().snapshot.zooms).toEqual([]);
  const evaluator = state.render.mock.lastCall![8] as {
    sample(time: number): unknown;
    invalidate(): void;
  };
  expect(evaluator.sample(500)).toMatchObject({ scale: 1 });
  evaluator.invalidate();
  options.props.isPlaying = true;
  draw();
  expect(painted().snapshot.zooms).toEqual([zoom]);
});
it('restores host state on renderer failure and releases owned backgrounds', () => {
  const { draw, ctx, preview } = host();
  state.render.mockImplementationOnce(() => {
    throw new Error('GPU lost');
  });
  expect(draw).toThrow('GPU lost');
  expect(ctx.restore).toHaveBeenCalledOnce();
  preview.dispose();
  expect(state.dispose).toHaveBeenCalledOnce();
  state.background = false;
  expect(draw).toThrow('background canvas');
  createRuntimePreview(host().options).dispose();
});
