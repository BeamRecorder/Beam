import { nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorCanvas from '../EditorCanvas.vue';
import { DEFAULT_OUTPUT_CANVAS } from '../output-canvas';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import type { MediaFrame } from '~/media/shared';
import type { CursorClickEffects } from '../../../../api/types/cursor-settings';

const { state } = vi.hoisted(() => ({
  state: {
    drawVideoWindow: vi.fn(),
    drawInCameraSpace: vi.fn(),
    resetCamera: vi.fn(),
    beginSelectionMove: vi.fn(),
    moveSelection: vi.fn(),
    endSelectionMove: vi.fn(),
    drawBackground: vi.fn(),
    syncPlayback: vi.fn(),
    drawComposition: vi.fn(),
    drawWebcamClips: vi.fn(),
    updateCursor: vi.fn(),
    beginTransformDrag: vi.fn(),
    moveTransformDrag: vi.fn(),
    endTransformDrag: vi.fn(),
    beginCropDrag: vi.fn(),
    moveCropDrag: vi.fn(),
    endCropDrag: vi.fn(),
    commitCrop: vi.fn(),
    transformDraft: undefined as { value: unknown } | undefined,
    transition: undefined as { value: boolean } | undefined,
    renderVisualStack: undefined as ((...args: unknown[]) => void) | undefined,
  },
}));

vi.mock('../composables/useCanvasBackground', async () => {
  const { ref } = await import('vue');
  return {
    useCanvasBackground: () => {
      state.transition = ref(false);
      return {
        drawBackground: state.drawBackground,
        syncPlayback: state.syncPlayback,
        isTransitioningBackground: state.transition,
      };
    },
  };
});

vi.mock('../composables/useCompositionMedia', async () => {
  const { ref } = await import('vue');
  return {
    useCompositionMedia: () => ({
      drawComposition: state.drawComposition,
      drawWebcamClips: state.drawWebcamClips,
      transformDraft: ref(null),
    }),
  };
});

vi.mock('../composables/useCursorOverlay', () => ({
  useCursorOverlay: () => ({ updateAndDrawRipplesAndCursor: state.updateCursor }),
}));

vi.mock('../composables/useCameraZoom', async () => {
  const { ref } = await import('vue');
  return {
    useCameraZoom: (options: { renderVisualStack: (...args: unknown[]) => void }) => {
      state.renderVisualStack = options.renderVisualStack;
      return {
        focusTargetStyle: ref({ left: '10px', top: '20px', width: '30px', height: '40px' }),
        videoWindowBounds: ref(null),
        overlayWindowBounds: ref(null),
        drawVideoWindow: state.drawVideoWindow,
        drawInCameraSpace: state.drawInCameraSpace,
        resetCamera: state.resetCamera,
        beginSelectionMove: state.beginSelectionMove,
        moveSelection: state.moveSelection,
        endSelectionMove: state.endSelectionMove,
      };
    },
  };
});

vi.mock('../composables/useLayerTransformAndCrop', async () => {
  const { ref } = await import('vue');
  return {
    useLayerTransformAndCrop: () => {
      state.transformDraft = ref(null);
      return {
        transformHandleStyle: ref({ left: '1px', top: '2px', width: '100px', height: '80px' }),
        cropContainerStyle: ref({ left: '3px', top: '4px', width: '90px', height: '70px' }),
        cropOverlayStyle: ref({ left: '3px', top: '4px', width: '90px', height: '70px' }),
        activeGuideLines: ref([]),
        transformDraft: state.transformDraft,
        beginTransformDrag: state.beginTransformDrag,
        moveTransformDrag: state.moveTransformDrag,
        endTransformDrag: state.endTransformDrag,
        beginCropDrag: state.beginCropDrag,
        moveCropDrag: state.moveCropDrag,
        endCropDrag: state.endCropDrag,
        commitCrop: state.commitCrop,
        selectVisualAt: vi.fn(),
      };
    },
  };
});

const effects: CursorClickEffects = {
  left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#f00' },
  right: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#00f' },
};

const screen = (): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: 'screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
});

const webcam = (): VisualClip => ({
  id: 'webcam',
  kind: 'webcam',
  name: 'Camera',
  assetId: 'camera-asset',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  transform: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
});

const image = (): VisualClip => ({
  id: 'image',
  kind: 'image',
  name: 'Image',
  assetId: 'image-asset',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 2,
  transform: { x: 0.5, y: 0.4, width: 0.2, height: 0.2 },
});

const frame = (clipId: string, width = 1_280, height = 720): MediaFrame => ({
  clipId,
  bitmap: {} as ImageBitmap,
  timestampSeconds: 0.5,
  durationSeconds: 0.04,
  width,
  height,
  byteSize: width * height * 4,
  close: vi.fn(),
});

const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Screen',
      fileName: 'screen.mp4',
      durationMs: 2_000,
      width: 1_280,
      height: 720,
      src: 'screen.mp4',
      origin: 'session',
    },
  ],
  clips: [screen(), webcam(), image()],
});

const props = () => ({
  isPlaying: false,
  currentTime: 0.5,
  duration: 2,
  selectedCursor: 'automatic' as const,
  cursorSize: 24,
  cursorColor: '#ffffff',
  enableShadow: true,
  shadowBlur: 4,
  shadowColor: '#000000',
  shadowDirection: 'bottom' as const,
  clickEffects: effects,
  motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  selectedBackground: null,
  backgroundBlurPercent: 0,
  frameFor: (clipId: string) => (clipId === 'screen' ? frame('screen') : null),
  frameVersion: 0,
  playbackState: 'paused' as const,
  playbackError: null,
  editorData: null,
  zoomElements: [],
  selectedZoom: null,
  composition: composition(),
  outputCanvas: { ...DEFAULT_OUTPUT_CANVAS, width: 800, height: 450 },
  activeTab: 'canvas',
  selectedTransformClip: null,
  loopProgress: 0,
  isCropping: false,
  historyAction: null,
});

const context = () =>
  ({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
  }) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let frames: FrameRequestCallback[];
let contextMock: ReturnType<typeof context>;

const runFrame = () => {
  const callback = frames.shift();
  if (callback) callback(performance.now());
};

beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  contextMock = context();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextMock);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 450 });
  state.drawVideoWindow.mockReturnValue(null);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountEditor = (overrides: Record<string, unknown> = {}) => {
  wrapper = mount(EditorCanvas, { props: { ...props(), ...overrides } });
  return wrapper;
};

describe('EditorCanvas', () => {
  it('renders the fallback stack, loading state, preview frame, and canvas pointer handlers', async () => {
    const mounted = mountEditor({
      frameFor: () => null,
      playbackState: 'loading',
      selectedZoom: { id: 'zoom', mode: 'manual', start: 0, end: 1, focus: { x: 0.5, y: 0.5 }, strength: 1 },
    });
    await flushPromises();
    runFrame();

    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(true);
    expect(mounted.find('.preview-frame').attributes('style')).toContain('width: 800px');
    expect(state.drawBackground).toHaveBeenCalled();
    expect(state.drawWebcamClips).toHaveBeenCalledWith(expect.anything(), expect.any(Object), 'webcam');
    expect(state.drawComposition).toHaveBeenCalled();
    expect(mounted.find('.editor-canvas').classes()).toContain('is-selection-editable');
    expect(mounted.find('.zoom-selection-box').classes()).not.toContain('locked');

    await mounted.find('canvas').trigger('pointerdown');
    await mounted.find('canvas').trigger('pointermove');
    await mounted.find('canvas').trigger('pointerup');
    expect(state.beginSelectionMove).toHaveBeenCalled();
    expect(state.moveSelection).toHaveBeenCalled();
    expect(state.endSelectionMove).toHaveBeenCalled();
  });

  it('re-reads the playback frame when frameVersion advances', async () => {
    const frameFor = vi.fn<(clipId: string) => MediaFrame | null>().mockReturnValue(null);
    const mounted = mountEditor({ frameFor, playbackState: 'paused' });
    await nextTick();

    expect(frameFor).toHaveBeenCalledWith('screen');
    const initialCallCount = frameFor.mock.calls.length;
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(true);

    const nextFrame = frame('screen');
    frameFor.mockReturnValue(nextFrame);
    await mounted.setProps({ frameVersion: 1 });
    await nextTick();

    expect(frameFor.mock.calls.length).toBeGreaterThan(initialCallCount);
    expect(frameFor).toHaveBeenLastCalledWith('screen');
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(false);
  });

  it('draws through the camera window and exposes transform and crop interactions', async () => {
    const bounds = { dx: 0, dy: 0, dw: 800, dh: 450, scale: 1, focusX: 400, focusY: 225 };
    state.drawVideoWindow.mockReturnValue(bounds);
    state.updateCursor.mockImplementation((_ctx, _window, _sourceWidth, _sourceHeight, _width, drawContent) => {
      drawContent?.(() => undefined);
    });
    const mounted = mountEditor({ selectedTransformClip: webcam() });
    await flushPromises();
    runFrame();

    expect(state.drawComposition).toHaveBeenCalledWith(expect.anything(), bounds, 1_280);
    expect(state.updateCursor).toHaveBeenCalled();
    expect(mounted.find('.webcam-selection').exists()).toBe(true);
    await mounted.find('.webcam-selection').trigger('pointerdown');
    await mounted.find('.webcam-selection').trigger('pointermove');
    await mounted.find('.webcam-selection').trigger('pointerup');
    expect(state.beginTransformDrag).toHaveBeenCalledWith(expect.anything(), 'move');
    expect(state.moveTransformDrag).toHaveBeenCalled();
    expect(state.endTransformDrag).toHaveBeenCalled();

    state.renderVisualStack?.(contextMock, bounds, vi.fn());
    expect(state.drawWebcamClips).toHaveBeenCalledWith(contextMock, bounds, 'webcam');
    expect(state.drawComposition).toHaveBeenCalledWith(contextMock, bounds, 1_280, 'image');

    await mounted.setProps({ isCropping: true });
    await nextTick();
    expect(mounted.find('.crop-overlay-box').exists()).toBe(true);
    await mounted.find('.crop-overlay-box').trigger('pointerdown');
    await mounted.find('.crop-overlay-box').trigger('pointermove');
    await mounted.find('.crop-overlay-box').trigger('pointerup');
    await mounted.find('button').trigger('click');
    expect(state.beginCropDrag).toHaveBeenCalledWith(expect.anything(), 'move');
    expect(state.moveCropDrag).toHaveBeenCalled();
    expect(state.endCropDrag).toHaveBeenCalled();
    expect(state.commitCrop).toHaveBeenCalled();
    expect(mounted.emitted('done:crop')).toHaveLength(1);
  });

  it('reacts to playback, format, duration, and transition watchers', async () => {
    const mounted = mountEditor();
    runFrame();
    vi.useFakeTimers();
    await mounted.setProps({ outputCanvas: { ...DEFAULT_OUTPUT_CANVAS, width: 600, height: 600 } });
    await nextTick();
    expect(mounted.find('canvas').classes()).toContain('is-format-transitioning');
    vi.advanceTimersByTime(260);
    await nextTick();
    expect(mounted.find('canvas').classes()).not.toContain('is-format-transitioning');
    vi.useRealTimers();

    await mounted.setProps({ isPlaying: true, duration: 0, playbackState: 'playing' });
    await nextTick();
    runFrame();
    expect(state.syncPlayback).toHaveBeenCalledWith(true);
    expect(mounted.emitted('update:isPlaying')).toBeUndefined();
    expect(mounted.emitted('update:currentTime')).toBeUndefined();

    vi.useFakeTimers();
    await mounted.setProps({ isPlaying: true, duration: 2, currentTime: 1.5, playbackState: 'playing' });
    await nextTick();
    vi.advanceTimersByTime(600);
    runFrame();
    expect(mounted.emitted('update:currentTime')).toBeUndefined();
    expect(mounted.emitted('update:isPlaying')).toBeUndefined();
    vi.useRealTimers();

    await mounted.setProps({ isPlaying: false, duration: 3, currentTime: 1, playbackState: 'paused' });
    await nextTick();
    expect(state.syncPlayback).toHaveBeenLastCalledWith(false);
    expect(state.resetCamera).toHaveBeenCalled();
  });
});
