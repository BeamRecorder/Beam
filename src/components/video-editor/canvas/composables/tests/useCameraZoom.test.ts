import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraZoom, type RenderedVideoWindow } from '../useCameraZoom';
import * as compositionCamera from '../../../zoom/composition-camera';
import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import type { MediaFrame } from '~/media/shared';
import type { ZoomElement } from '../../../zoom/zoom-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const drawDecoratedMedia = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/appearance/render-decorated-media', () => ({ drawDecoratedMedia }));

const screenClip = (enabled = true): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: 'screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});
const composition = (enabled = true): ClipComposition => ({
  schemaVersion: 5,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Screen',
      fileName: 'screen.mp4',
      durationMs: 3_000,
      width: 1_280,
      height: 720,
      src: 'screen.mp4',
      origin: 'session',
    },
  ],
  clips: [screenClip(enabled)],
});
const manualZoom: ZoomElement = {
  id: 'manual',
  sessionId: 'session',
  startMs: 0,
  endMs: 3_000,
  focus: { cx: 0.8, cy: 0.2 },
  depth: 2,
  mode: 'manual',
};
const autoZoom: ZoomElement = {
  id: 'auto',
  sessionId: 'session',
  startMs: 0,
  endMs: 3_000,
  focus: { cx: 0.8, cy: 0.2 },
  depth: 2,
  mode: 'auto',
};
const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
  }) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCameraZoom>;
let options!: {
  compositionRef: ReturnType<typeof ref<ClipComposition>>;
  currentTime: ReturnType<typeof ref<number>>;
  playing: ReturnType<typeof ref<boolean>>;
  selected: ReturnType<typeof ref<ZoomElement | null>>;
  activeTab: ReturnType<typeof ref<string>>;
  output: ReturnType<typeof ref<{ preset: '16:9'; width: number; height: number; showBackground: boolean }>>;
  screenTransformDraft: ReturnType<typeof ref<NormalizedTransform | null>>;
  videoError: ReturnType<typeof ref<string | null>>;
  canvas: HTMLCanvasElement;
  callbacks: Record<string, ReturnType<typeof vi.fn>>;
};

const mountComposable = () => {
  const compositionRef = ref(composition());
  const currentTime = ref(0.5);
  const playing = ref(false);
  const selected = ref<ZoomElement | null>(manualZoom);
  const activeTab = ref('zoom');
  const zooms = ref<ZoomElement[]>([autoZoom]);
  const output = ref({ preset: '16:9' as const, width: 800, height: 450, showBackground: false });
  const screenTransformDraft = ref<NormalizedTransform | null>(null);
  const videoError = ref<string | null>('recording unavailable');
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 450,
    right: 800,
    bottom: 450,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  Object.defineProperty(canvas, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(canvas, 'hasPointerCapture', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(canvas, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  const callbacks = {
    drawBackground: vi.fn(),
    onUpdateZoom: vi.fn(),
    onPreviewZoom: vi.fn(),
    onSelectScreenClip: vi.fn(),
    onSelectCanvas: vi.fn(),
    onDeselectTransformClip: vi.fn(),
    onDeselectZoom: vi.fn(),
    selectVisualAt: vi.fn(() => false),
  };
  const Harness = defineComponent({
    setup() {
      state = useCameraZoom({
        canvasRef: () => canvas,
        outputCanvas: () => output.value,
        zoomElements: () => zooms.value,
        selectedZoom: () => selected.value,
        currentTime: () => currentTime.value,
        isPlaying: () => playing.value,
        editorData: () =>
          ({
            cursor: {
              telemetry: [
                { timeMs: 400, cx: 0.1, cy: 0.9 },
                { timeMs: 900, cx: 0.9, cy: 0.1 },
              ],
              events: [
                {
                  event: 'move',
                  sessionNs: 500_000_000,
                  pixelX: 10,
                  pixelY: 10,
                  normalizedX: 0.2,
                  normalizedY: 0.8,
                  visible: true,
                },
              ],
            },
          }) as any,
        activeTab: () => activeTab.value,
        composition: () => compositionRef.value,
        screenTransformDraft: () => screenTransformDraft.value,
        isCropping: () => false,
        videoError: () => videoError.value,
        renderVisualStack: (ctx, bounds, drawScreen) => {
          drawScreen();
          callbacks.onSelectCanvas(ctx, bounds);
        },
        ...callbacks,
        selectedTransformClipExists: () => true,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  options = {
    compositionRef,
    currentTime,
    playing,
    selected,
    activeTab,
    output,
    screenTransformDraft,
    videoError,
    canvas,
    callbacks,
  };
};

const frame = (width = 1_280, height = 720): MediaFrame => ({
  clipId: 'screen',
  bitmap: {} as ImageBitmap,
  timestampSeconds: 0.5,
  durationSeconds: 0.04,
  width,
  height,
  byteSize: width * height * 4,
  close: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('useCameraZoom', () => {
  it('renders disabled and loading screens, then draws a ready decorated window', () => {
    mountComposable();
    const disabledContext = context();
    options.compositionRef.value = composition(false);
    expect(state.drawVideoWindow(disabledContext, 800, 450, null)).toBeNull();
    expect(disabledContext.fillRect).not.toHaveBeenCalled();
    expect(disabledContext.fillText).not.toHaveBeenCalledWith(
      'Video track disabled',
      expect.any(Number),
      expect.any(Number),
    );

    const loadingComposition = composition();
    loadingComposition.assets[0] = { ...loadingComposition.assets[0]!, width: null, height: null };
    options.compositionRef.value = loadingComposition;
    const loadingContext = context();
    state.drawVideoWindow(loadingContext, 800, 450, null);
    expect(loadingContext.roundRect).toHaveBeenCalledWith(0, 0, 800, 450, 16);
    expect(loadingContext.clip).toHaveBeenCalledOnce();
    expect(loadingContext.fillText).toHaveBeenCalledWith('recording unavailable', 400, 225);
    expect(loadingContext.restore).toHaveBeenCalledOnce();

    options.compositionRef.value = composition();
    options.output.value = { preset: '16:9', width: 800, height: 450, ...options.output.value, showBackground: true };
    expect(state.drawVideoWindow(context(), 800, 450, frame())).not.toBeNull();
    expect(drawDecoratedMedia).toHaveBeenCalled();
    expect(options.callbacks.drawBackground).toHaveBeenCalled();
  });

  it('keeps the canvas background visible while a known screen frame reloads', () => {
    mountComposable();
    options.videoError.value = null;
    options.output.value = { preset: '16:9', width: 800, height: 450, showBackground: true };
    const ctx = context();

    expect(state.drawVideoWindow(ctx, 800, 450, null)).not.toBeNull();
    expect(options.callbacks.drawBackground).toHaveBeenCalledOnce();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('returns to the background-only frame after the screen clip ends', () => {
    mountComposable();
    const ctx = context();
    options.currentTime.value = 3.1;

    expect(state.drawVideoWindow(ctx, 800, 450, frame())).toBeNull();
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(options.callbacks.drawBackground).not.toHaveBeenCalled();
  });

  it('renders the screen transform draft immediately while the transform is being dragged', () => {
    mountComposable();
    options.screenTransformDraft.value = { x: 0.25, y: 0.2, width: 0.5, height: 0.5 };

    state.drawVideoWindow(context(), 800, 450, frame());

    expect(drawDecoratedMedia).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ rect: { x: 200, y: 90, width: 400, height: 225 } }),
    );
  });

  it('updates a transform draft without rebuilding the camera evaluator', () => {
    mountComposable();
    const createEvaluator = vi.spyOn(compositionCamera, 'createCompositionCameraEvaluator');

    state.drawVideoWindow(context(), 800, 450, frame());
    const evaluatorCount = createEvaluator.mock.calls.length;
    expect(evaluatorCount).toBe(1);

    options.screenTransformDraft.value = { x: 0.1, y: 0.15, width: 0.7, height: 0.6 };
    state.drawVideoWindow(context(), 800, 450, frame());

    expect(createEvaluator).toHaveBeenCalledTimes(evaluatorCount);
    expect(drawDecoratedMedia).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ rect: { x: 80, y: 67.5, width: 560, height: 270 } }),
    );
  });

  it('applies auto zoom, computes manual target focus, and updates pointer focus', async () => {
    mountComposable();
    const ctx = context();
    options.selected.value = null;
    options.currentTime.value = 1.5;
    state.drawVideoWindow(ctx, 800, 450, frame());
    expect(state.videoWindowBounds.value?.scale).toBeGreaterThan(1);

    options.selected.value = manualZoom;
    await nextTick();
    expect(state.focusTargetStyle.value).toMatchObject({ width: expect.any(String), height: expect.any(String) });
    const pointer = (type: string, x: number, y: number) =>
      Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 4 }) as unknown as PointerEvent;
    state.beginSelectionMove(pointer('pointerdown', 400, 225));
    state.moveSelection(pointer('pointermove', 790, 5));
    state.endSelectionMove(pointer('pointerup', 790, 5));
    expect(options.canvas.setPointerCapture).toHaveBeenCalledWith(4);
    expect(options.callbacks.onUpdateZoom).toHaveBeenCalled();
    expect(options.canvas.releasePointerCapture).toHaveBeenCalledWith(4);
  });

  it('renders camera-space content inside the sampled camera transform', () => {
    mountComposable();
    options.selected.value = null;
    options.currentTime.value = 1.5;
    const ctx = context();

    state.drawVideoWindow(ctx, 800, 450, frame());

    const cameraScaleCalls = vi
      .mocked(ctx.scale)
      .mock.calls.filter(
        ([scaleX, scaleY]) =>
          typeof scaleX === 'number' && typeof scaleY === 'number' && scaleX > 1 && scaleX === scaleY,
      );
    expect(cameraScaleCalls.length).toBeGreaterThan(0);
    expect(drawDecoratedMedia).toHaveBeenCalled();
  });

  it('applies the global camera when the scene contains only imported media', () => {
    mountComposable();
    const imported = { ...screenClip(), id: 'imported', kind: 'image' as const, assetId: 'image-asset' };
    options.compositionRef.value = {
      ...composition(),
      assets: [],
      clips: [imported],
    };
    options.currentTime.value = 1.5;
    const ctx = context();

    const rendered = state.drawVideoWindow(ctx, 800, 450, null);

    expect(rendered?.scale).toBeGreaterThan(1);
    expect(vi.mocked(ctx.scale).mock.calls.some(([scale]) => Number(scale) > 1)).toBe(true);
    expect(options.callbacks.drawBackground).toHaveBeenCalled();
  });

  it('selects screen or canvas targets and exposes camera-space drawing/reset', () => {
    mountComposable();
    const ctx = context();
    state.drawVideoWindow(ctx, 800, 450, frame());
    options.selected.value = null;
    const pointer = (x: number, y: number, pointerId: number) =>
      Object.assign(new MouseEvent('pointerdown', { clientX: x, clientY: y }), {
        pointerId,
      }) as unknown as PointerEvent;
    state.beginSelectionMove(pointer(400, 200, 1));
    expect(options.callbacks.onSelectScreenClip).toHaveBeenCalledWith('screen');
    options.output.value = { preset: '16:9', width: 800, height: 450, ...options.output.value, showBackground: true };
    state.drawVideoWindow(ctx, 800, 450, frame());
    options.selected.value = autoZoom;
    options.activeTab.value = 'canvas';
    state.beginSelectionMove(pointer(1, 1, 2));
    expect(options.callbacks.onSelectCanvas).toHaveBeenCalled();
    expect(options.callbacks.onDeselectTransformClip).toHaveBeenCalled();
    expect(options.callbacks.onDeselectZoom).toHaveBeenCalled();

    const rendered: RenderedVideoWindow = { dx: 0, dy: 0, dw: 800, dh: 450, scale: 2, focusX: 400, focusY: 225 };
    const draw = vi.fn();
    state.drawInCameraSpace(ctx, rendered, draw);
    expect(ctx.clip).toHaveBeenCalled();
    expect(draw).toHaveBeenCalled();
    options.callbacks.selectVisualAt.mockReturnValueOnce(true);
    state.beginSelectionMove(pointer(20, 20, 3));
    expect(options.callbacks.onSelectCanvas).toHaveBeenCalledTimes(3);
    expect(() => state.resetCamera()).not.toThrow();
  });

  it('does not make the camera sample depend on wall-clock frame spacing', () => {
    mountComposable();
    const firstContext = context();
    options.playing.value = true;
    options.currentTime.value = 0.5;
    vi.spyOn(performance, 'now').mockReturnValue(0);
    state.drawVideoWindow(firstContext, 800, 450, frame());
    options.currentTime.value = 0.7;
    vi.mocked(performance.now).mockReturnValue(16);
    const firstRun = state.drawVideoWindow(firstContext, 800, 450, frame());

    state.resetCamera();
    const secondContext = context();
    options.currentTime.value = 0.5;
    vi.mocked(performance.now).mockReturnValue(1_000);
    state.drawVideoWindow(secondContext, 800, 450, frame());
    options.currentTime.value = 0.7;
    vi.mocked(performance.now).mockReturnValue(1_500);
    const secondRun = state.drawVideoWindow(secondContext, 800, 450, frame());

    expect(firstRun).not.toBeNull();
    expect(secondRun).not.toBeNull();
    expect(secondRun).toMatchObject({
      focusX: expect.closeTo(firstRun!.focusX, 0.0001),
      focusY: expect.closeTo(firstRun!.focusY, 0.0001),
      scale: expect.closeTo(firstRun!.scale, 0.0001),
    });
  });
});
