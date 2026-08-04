import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraZoom, type RenderedVideoWindow } from '../useCameraZoom';
import type { ClipComposition, VisualClip } from '../../../composition/composition-types';
import type { ZoomElement } from '../../../zoom/zoom-types';

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
});
const composition = (enabled = true): ClipComposition => ({
  schemaVersion: 1,
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
  selected: ReturnType<typeof ref<ZoomElement | null>>;
  activeTab: ReturnType<typeof ref<string>>;
  output: ReturnType<typeof ref<{ preset: '16:9'; width: number; height: number; showBackground: boolean }>>;
  canvas: HTMLCanvasElement;
  callbacks: Record<string, ReturnType<typeof vi.fn>>;
};

const mountComposable = () => {
  const compositionRef = ref(composition());
  const currentTime = ref(0.5);
  const selected = ref<ZoomElement | null>(manualZoom);
  const activeTab = ref('zoom');
  const zooms = ref<ZoomElement[]>([autoZoom]);
  const output = ref({ preset: '16:9' as const, width: 800, height: 450, showBackground: false });
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
        isPlaying: () => false,
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
        isCropping: () => false,
        videoError: () => 'recording unavailable',
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
  options = { compositionRef, currentTime, selected, activeTab, output, canvas, callbacks };
};

const video = (readyState: number) => {
  const value = document.createElement('video');
  Object.defineProperties(value, {
    videoWidth: { configurable: true, value: 1_280 },
    videoHeight: { configurable: true, value: 720 },
    readyState: { configurable: true, value: readyState },
  });
  return value;
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('useCameraZoom', () => {
  it('renders disabled and loading screens, then draws a ready decorated window', () => {
    mountComposable();
    const ctx = context();
    options.compositionRef.value = composition(false);
    expect(state.drawVideoWindow(ctx, 800, 450, video(0))).toBeNull();
    expect(ctx.fillText).toHaveBeenCalledWith('Video track disabled', expect.any(Number), expect.any(Number));

    options.compositionRef.value = composition();
    state.drawVideoWindow(ctx, 800, 450, video(0));
    expect(ctx.fillText).toHaveBeenCalledWith('recording unavailable', 400, 225);
    options.output.value = { preset: '16:9', width: 800, height: 450, ...options.output.value, showBackground: true };
    expect(state.drawVideoWindow(ctx, 800, 450, video(HTMLMediaElement.HAVE_METADATA))).not.toBeNull();
    expect(drawDecoratedMedia).toHaveBeenCalled();
    expect(options.callbacks.drawBackground).toHaveBeenCalled();
  });

  it('returns to the background-only frame after the screen clip ends', () => {
    mountComposable();
    const ctx = context();
    options.currentTime.value = 3.1;

    expect(state.drawVideoWindow(ctx, 800, 450, video(HTMLMediaElement.HAVE_METADATA))).toBeNull();
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(options.callbacks.drawBackground).not.toHaveBeenCalled();
  });

  it('applies auto zoom, computes manual target focus, and updates pointer focus', async () => {
    mountComposable();
    const ctx = context();
    options.selected.value = null;
    options.currentTime.value = 1.5;
    state.drawVideoWindow(ctx, 800, 450, video(HTMLMediaElement.HAVE_METADATA));
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
    expect(options.callbacks.onPreviewZoom).toHaveBeenCalled();
    expect(options.callbacks.onUpdateZoom).toHaveBeenCalled();
    expect(options.canvas.releasePointerCapture).toHaveBeenCalledWith(4);
  });

  it('selects screen or canvas targets and exposes camera-space drawing/reset', () => {
    mountComposable();
    const ctx = context();
    state.drawVideoWindow(ctx, 800, 450, video(HTMLMediaElement.HAVE_METADATA));
    options.selected.value = null;
    const pointer = (x: number, y: number, pointerId: number) =>
      Object.assign(new MouseEvent('pointerdown', { clientX: x, clientY: y }), {
        pointerId,
      }) as unknown as PointerEvent;
    state.beginSelectionMove(pointer(400, 200, 1));
    expect(options.callbacks.onSelectScreenClip).toHaveBeenCalledWith('screen');
    options.output.value = { preset: '16:9', width: 800, height: 450, ...options.output.value, showBackground: true };
    state.drawVideoWindow(ctx, 800, 450, video(HTMLMediaElement.HAVE_METADATA));
    options.selected.value = manualZoom;
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
});
