import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '../../canvas-types';
import type { ZoomMotionBlurSample } from '@beam/engine/zoom/zoom-motion-blur-types';
import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';
import type { BlurClip, ColorClip, ShapeClip, VisualClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { context, snapshot } from './render.test-support';
import { drawCompositionLayers, renderCompositionFrame, disposeCompositionRenderer } from '../render';

const state = vi.hoisted(() => ({
  screen: vi.fn(),
  visual: vi.fn(),
  webcam: vi.fn(),
  generated: vi.fn(),
  blur: vi.fn(),
  cursor: vi.fn(),
  layers: vi.fn(),
  samples: vi.fn(),
  disposePerspective: vi.fn(),
  disposeShapes: vi.fn(),
  glass: false,
  consumeBlur: false,
  consumeShape: false,
}));
vi.mock('../render-screen', () => ({ drawScreenMedia: state.screen }));
vi.mock('../render-media', () => ({ drawVisualClip: state.visual, drawWebcamClip: state.webcam }));
vi.mock('../render-generated-layer', () => ({ drawExportGeneratedLayer: state.generated }));
vi.mock('@beam/runtime/composition/effects/blur-effect', () => ({ applyBlurEffect: state.blur }));
vi.mock('../cursor-render', () => ({ drawCursorLayer: state.cursor, cursorPositionForKeyboardCaption: vi.fn() }));
vi.mock('../glass-highlight-render', () => ({
  disposeGlassHighlights: vi.fn(),
  renderGlassHighlights: (
    ctx: Canvas2DContext,
    value: { canvas: { width: number; height: number } },
    _time: number,
    _backdrop: unknown,
    painter: { draw(ctx: Canvas2DContext, width: number, height: number): void },
  ) => {
    if (state.glass) painter.draw(ctx, value.canvas.width * 2, value.canvas.height * 2);
  },
}));
vi.mock('../perspective-render', () => ({
  renderPerspectiveLayers: state.layers,
  renderPerspectiveSamples: state.samples,
  disposePerspectiveRenderer: state.disposePerspective,
}));
vi.mock('../motion-blur-surface', () => ({
  disposeExportMotionBlurSurface: vi.fn(),
  renderExportMotionBlur: (
    ctx: Canvas2DContext,
    _width: number,
    _height: number,
    samples: ZoomMotionBlurSample[],
    draw: (ctx: Canvas2DContext, sample: ZoomMotionBlurSample) => void,
  ) => {
    for (const sample of samples) draw(ctx, sample);
  },
}));
vi.mock('@beam/runtime/composition/shape/ordered-gpu-shapes', () => ({
  createGpuShapeScope: () => ({
    dispose: state.disposeShapes,
    render: (
      _ctx: Canvas2DContext,
      draw: (batch: {
        tryBlur(): boolean;
        tryShape(clip: unknown, rect: unknown, paint: () => void): boolean;
        flush(): void;
      }) => void,
    ) =>
      draw({
        tryBlur: () => state.consumeBlur,
        tryShape: (_clip, _rect, paint) => {
          if (state.consumeShape) paint();
          return state.consumeShape;
        },
        flush: () => {},
      }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.glass = state.consumeBlur = state.consumeShape = false;
  state.layers.mockImplementation((options) => options.drawLayers(options.target));
  state.samples.mockImplementation((options) => options.drawLayers(options.target));
});
afterEach(disposeCompositionRenderer);

function scene(webcam = true) {
  const value = snapshot();
  const screen = value.composition.clips[0] as VisualClip;
  const otherScreen = { ...screen, id: 'other-screen', order: 1 };
  const visual = { ...screen, kind: 'video' as const, id: 'video', order: 2 };
  const missing = { ...visual, id: 'missing', order: 3 };
  const color: ColorClip = {
    ...screen,
    kind: 'color',
    id: 'color',
    assetId: '',
    order: 4,
    fill: { kind: 'color', color: '#123456' },
  };
  const shape: ShapeClip = {
    ...screen,
    ...DEFAULT_ANNOTATION_SHAPE_STYLE,
    kind: 'shape',
    id: 'shape',
    assetId: '',
    order: 5,
  };
  const blur: BlurClip = {
    ...screen,
    kind: 'blur',
    id: 'blur',
    assetId: '',
    order: 6,
    shape: 'rectangle',
    mode: 'blur',
    strength: 20,
    feather: 0,
    cornerRadius: 0,
    tintOpacity: 0,
    color: '#000000',
  };
  value.composition.clips.push(otherScreen, visual, missing, color, shape, blur);
  if (webcam) value.composition.clips.push({ ...screen, kind: 'webcam', id: 'webcam', order: 7 });
  const source = { source: {} as CanvasImageSource, width: 100, height: 50 };
  const visuals = new Map(['screen', 'other-screen', 'video', 'webcam'].map((id) => [id, source]));
  value.zoomMotionBlur = { enabled: false, intensity: 0 };
  return { value, source, visuals };
}
const cameraAt = (time: number): CameraSample => ({
  focus: { cx: time / 1000, cy: 0.5 },
  scale: 1 + time / 1000,
  orbit: { azimuth: time / 2000, elevation: 0.1, distance: 3, strength: 1 },
});

it.each([false, true])('preserves generated/media/blur ordering through GPU consumption=%s', (consume) => {
  state.consumeBlur = state.consumeShape = consume;
  const { value, source, visuals } = scene();
  drawCompositionLayers(context(), value, 0.5, visuals);
  expect(state.generated.mock.calls.map((call) => call[1].id)).toEqual(['shape', 'color']);
  expect(state.visual).toHaveBeenCalledOnce();
  expect(state.webcam).toHaveBeenCalledOnce();
  expect(state.blur).toHaveBeenCalledTimes(consume ? 0 : 1);
  state.generated.mockClear();
  state.blur.mockClear();
  renderCompositionFrame(context(), source, value, 0.5, null, undefined, visuals);
  expect(state.screen).toHaveBeenCalledTimes(2);
  expect(state.generated.mock.calls.map((call) => call[1].id)).toEqual(['shape', 'color']);
  expect(state.blur).toHaveBeenCalledTimes(consume ? 0 : 1);
});

it('keeps scene cursor placement inside its screen and skips screens without pixels', () => {
  const { value, source, visuals } = scene(false);
  value.composition.scene = { version: 1, roots: value.composition.clips.map((clip) => clip.id), groups: [] };
  renderCompositionFrame(context(), source, value, 0.5, null, undefined, visuals);
  expect(state.cursor).toHaveBeenCalledOnce();
  state.screen.mockClear();
  renderCompositionFrame(context(), null, value, 0.5, null, undefined, new Map());
  expect(state.screen).not.toHaveBeenCalled();
});

it.each([false, true])('retains every orbit shutter pose with webcam=%s', (webcam) => {
  const { value, source, visuals } = scene(webcam);
  value.zoomMotionBlur = { enabled: true, intensity: 1 };
  const camera = { sample: vi.fn(cameraAt), invalidate: vi.fn() };
  renderCompositionFrame(context(), source, value, 0.5, null, undefined, visuals, undefined, camera);
  if (webcam) {
    expect(state.layers.mock.calls.length).toBeGreaterThan(1);
    expect(state.samples).not.toHaveBeenCalled();
  } else {
    expect(state.samples).toHaveBeenCalledOnce();
    expect(state.samples.mock.calls[0]![0].samples.length).toBeGreaterThan(1);
  }
});

it('rerenders glass at lens density using the same prepared center, then disposes all rendering scopes', () => {
  const { value, source, visuals } = scene(false);
  state.glass = true;
  const camera = {
    sample: vi.fn(() => {
      throw new Error('Center evaluated again');
    }),
    invalidate: vi.fn(),
  };
  const evaluation = { camera: cameraAt(500), cursorMotion: null };
  renderCompositionFrame(
    context(),
    source,
    value,
    0.5,
    null,
    undefined,
    visuals,
    undefined,
    camera,
    undefined,
    evaluation,
  );
  expect(state.screen).toHaveBeenCalledTimes(4);
  expect(camera.sample).not.toHaveBeenCalled();
  disposeCompositionRenderer();
  expect(state.disposePerspective).toHaveBeenCalledOnce();
  expect(state.disposeShapes).toHaveBeenCalledOnce();
});
