import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePreview } from './runtime-preview';
import { snapshot, context } from '@beam/runtime/rendering/tests/render.test-support';
import { resolveCompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import type { RuntimePreviewOptions } from './runtime-preview-types';
import type { MediaFrame } from '@beam/runtime/shared/index';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { CompositionSceneLayers } from '@beam/engine/composition/scene-layers';

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
    draftFor: () => null,
    editingCaptionId: () => null,
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
  options.draftFor = () => ({ x: 0.1, y: 0, width: 0.8, height: 1 });
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
