import { nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { MotionPlugin } from '@vueuse/motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorCanvas from '../EditorCanvas.vue';
import CanvasLoadingSkeleton from '../CanvasLoadingSkeleton.vue';
import { DEFAULT_OUTPUT_CANVAS } from '../output-canvas';
import type { CaptionClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';
import type { MediaFrame } from '~/media/shared';
import type { CursorAutoHideSettings, CursorClickEffects } from '../../../../api/types/cursor-settings';
import ResizeHandle from '../../../ui/ResizeHandle/ResizeHandle.vue';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { resolveCompositionSceneLayers } from '../../composition/scene-layers';

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
    clearCursorBounds: vi.fn(),
    clipIdAt: vi.fn(),
    selectVisualAt: vi.fn(),
    transformDraft: undefined as { value: unknown } | undefined,
    transformSelectionViewportStyle: undefined as { value: unknown } | undefined,
    transformHandlePositions: undefined as { value: unknown } | undefined,
    transformPerspectiveCorners: undefined as { value: unknown } | undefined,
    transformResizeCorners: undefined as { value: unknown } | undefined,
    transition: undefined as { value: boolean } | undefined,
    onRenderOnce: undefined as (() => void) | undefined,
    renderVisualStack: undefined as ((...args: unknown[]) => void) | undefined,
    canvasBackgroundOptions: undefined as
      | {
          previewQuality?: () => string;
          selectedBackground?: () => unknown;
          backgroundBlurPercent?: () => number;
        }
      | undefined,
    cursorBounds: undefined as { value: unknown } | undefined,
    isScreenEnabled: undefined as (() => boolean) | undefined,
    perspectiveRender: vi.fn(),
    perspectiveDispose: vi.fn(),
  },
}));

vi.mock('../../zoom/perspective-scene-compositor', () => ({
  PerspectiveSceneCompositor: class {
    render(options: {
      target: CanvasRenderingContext2D;
      bounds: { x: number; y: number; width: number; height: number };
      draw: (context: CanvasRenderingContext2D) => unknown;
    }) {
      state.perspectiveRender(options);
      options.draw(options.target);
      options.target.drawImage(
        { perspectiveSurface: true } as unknown as CanvasImageSource,
        options.bounds.x,
        options.bounds.y,
        options.bounds.width,
        options.bounds.height,
      );
    }

    dispose() {
      state.perspectiveDispose();
    }
  },
}));

vi.mock('../composables/useCanvasBackground', async () => {
  const { ref } = await import('vue');
  return {
    useCanvasBackground: (
      selectedBackground: () => unknown,
      backgroundBlurPercent: () => number,
      previewQuality: () => string,
    ) => {
      state.canvasBackgroundOptions = {
        selectedBackground,
        backgroundBlurPercent,
        previewQuality,
      };
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

vi.mock('../composables/useCursorOverlay', async () => {
  const { ref } = await import('vue');
  return {
    useCursorOverlay: (options: { isScreenEnabled: () => boolean }) => {
      state.isScreenEnabled = options.isScreenEnabled;
      state.cursorBounds = ref(null);
      return {
        updateAndDrawRipplesAndCursor: state.updateCursor,
        cursorBounds: state.cursorBounds,
        clearCursorBounds: state.clearCursorBounds,
      };
    },
  };
});

vi.mock('../composables/useCameraZoom', async () => {
  const { ref } = await import('vue');
  return {
    useCameraZoom: (options: { renderVisualStack: (...args: unknown[]) => void; onRenderOnce?: () => void }) => {
      state.renderVisualStack = options.renderVisualStack;
      state.onRenderOnce = options.onRenderOnce;
      return {
        focusTargetStyle: ref({
          left: '10px',
          top: '20px',
          width: '30px',
          height: '40px',
        }),
        videoWindowBounds: ref(null),
        overlayWindowBounds: ref(null),
        drawVideoWindow: state.drawVideoWindow,
        drawInCameraSpace: state.drawInCameraSpace,
        resetCamera: () => {
          state.resetCamera();
          options.onRenderOnce?.();
        },
        resetCameraUnlessDragging: () => {
          state.resetCamera();
          options.onRenderOnce?.();
        },
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
      state.transformSelectionViewportStyle = ref({
        left: '0px',
        top: '0px',
        width: '800px',
        height: '450px',
      });
      state.transformHandlePositions = ref(undefined);
      state.transformPerspectiveCorners = ref(undefined);
      state.transformResizeCorners = ref(undefined);
      return {
        transformSelectionViewportStyle: state.transformSelectionViewportStyle,
        transformHandleStyle: ref({
          left: '1px',
          top: '2px',
          width: '100px',
          height: '80px',
        }),
        transformHandlePositions: state.transformHandlePositions,
        transformPerspectiveCorners: state.transformPerspectiveCorners,
        cropContainerStyle: ref({
          left: '3px',
          top: '4px',
          width: '90px',
          height: '70px',
        }),
        cropOverlayStyle: ref({
          left: '3px',
          top: '4px',
          width: '90px',
          height: '70px',
        }),
        activeGuideLines: ref([]),
        transformDraft: state.transformDraft,
        transformResizeCorners: state.transformResizeCorners,
        beginTransformDrag: state.beginTransformDrag,
        moveTransformDrag: state.moveTransformDrag,
        endTransformDrag: state.endTransformDrag,
        beginCropDrag: state.beginCropDrag,
        moveCropDrag: state.moveCropDrag,
        endCropDrag: state.endCropDrag,
        commitCrop: state.commitCrop,
        clipIdAt: state.clipIdAt,
        selectVisualAt: state.selectVisualAt,
      };
    },
  };
});

const effects: CursorClickEffects = {
  left: {
    springEnabled: true,
    springIntensity: 50,
    rippleEnabled: true,
    rippleSize: 30,
    rippleColor: '#f00',
  },
  right: {
    springEnabled: true,
    springIntensity: 50,
    rippleEnabled: false,
    rippleSize: 30,
    rippleColor: '#00f',
  },
};
const autoHide: CursorAutoHideSettings = { enabled: false, delaySeconds: 2, fadeDurationMs: 250 };

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
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
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
  appearance: createDefaultClipAppearance('webcam'),
  isMirrored: false,
  isMirroredY: false,
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
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const caption = (): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: -1,
  isAiGenerated: false,
  caption: {
    type: 'text',
    sentences: [
      {
        id: 'sentence',
        text: 'Original sentence',
        startMs: 0,
        endMs: 2_000,
        words: [],
      },
    ],
    style: {
      ...createDefaultCaptionStyle(40),
      customText: 'Original caption',
    },
  },
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
  schemaVersion: 6,
  keyboardCaptionSessions: [],
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
  cursorSelection: {
    packId: 'builtin:macos',
    mode: 'automatic' as const,
    cursorId: null,
  },
  cursorPack: null,
  cursorSize: 24,
  cursorColor: '#ffffff',
  enableShadow: true,
  shadowBlur: 4,
  shadowColor: '#000000',
  shadowDirection: 'bottom' as const,
  clickEffects: effects,
  autoHide,
  motion: {
    preset: 'smooth' as const,
    smoothing: 0.67,
    springMassMultiplier: 1.29,
    motionBlur: 0.4,
  },
  selectedBackground: null,
  backgroundBlurPercent: 0,
  frameFor: (clipId: string) => (clipId === 'screen' ? frame('screen') : null),
  frameVersion: 0,
  playbackState: 'paused' as const,
  playbackError: null,
  previewQuality: 'full' as const,
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
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 80 })),
    drawImage: vi.fn(),
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
  state.onRenderOnce = undefined;
  contextMock = context();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {}
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextMock);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 450,
  });
  state.drawVideoWindow.mockReturnValue(null);
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountEditor = (overrides: Record<string, unknown> = {}) => {
  wrapper = mount(EditorCanvas, {
    props: { ...props(), ...overrides },
    global: { plugins: [MotionPlugin] },
  });
  return wrapper;
};

describe('EditorCanvas', () => {
  it('defaults to full preview quality', async () => {
    mountEditor();
    await nextTick();

    expect(state.canvasBackgroundOptions?.previewQuality?.()).toBe('full');
  });

  it('keeps a 2D zoom on the direct Canvas2D preview path', async () => {
    const cameraBounds = {
      dx: 0,
      dy: 0,
      dw: 800,
      dh: 450,
      scale: 1,
      focusX: 400,
      focusY: 225,
    };
    state.drawVideoWindow.mockReturnValue(cameraBounds);
    const mounted = mountEditor({
      zoomElements: [
        {
          id: 'flat-zoom',
          sessionId: 'session',
          startMs: 0,
          endMs: 2_000,
          focus: { cx: 0.5, cy: 0.5 },
          depth: 2,
          mode: 'manual',
          projection: '2d',
          tiltIntensity: 1,
        },
      ],
    });
    await flushPromises();
    while (frames.length) runFrame();

    expect(state.perspectiveRender).not.toHaveBeenCalled();
    expect(state.drawComposition.mock.calls.some(([ctx]) => ctx === contextMock)).toBe(true);
    mounted.unmount();
    wrapper = undefined;
  });

  it('routes an active 3D zoom through the perspective surface while keeping composition overlays on target', async () => {
    const cameraBounds = {
      dx: 0,
      dy: 0,
      dw: 800,
      dh: 450,
      scale: 1,
      focusX: 400,
      focusY: 225,
    };
    state.drawVideoWindow.mockReturnValue(cameraBounds);
    const mounted = mountEditor({
      zoomElements: [
        {
          id: 'perspective-zoom',
          sessionId: 'session',
          startMs: 0,
          endMs: 2_000,
          focus: { cx: 0.75, cy: 0.25 },
          depth: 2,
          mode: 'manual',
          projection: '3d',
          tiltIntensity: 1,
        },
      ],
    });
    await flushPromises();
    while (frames.length) runFrame();

    expect(state.perspectiveRender).toHaveBeenCalled();
    expect(state.perspectiveRender).toHaveBeenCalledWith(
      expect.objectContaining({
        target: contextMock,
        bounds: expect.objectContaining({ width: 800, height: 450 }),
      }),
    );
    expect(state.drawComposition).toHaveBeenCalledWith(contextMock, cameraBounds, undefined, expect.anything());
    mounted.unmount();
    wrapper = undefined;
    expect(state.perspectiveDispose).toHaveBeenCalled();
  });

  it('uses a quality-scaled backing canvas while keeping the CSS preview and logical coordinates unchanged', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
    const mounted = mountEditor({ previewQuality: 'quarter' });
    await nextTick();

    const canvas = mounted.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(225);
    expect(canvas.style.width).toBe('');
    expect(canvas.style.height).toBe('');
    expect(mounted.get('.canvas-island').element.clientWidth).toBe(800);
    expect(mounted.find('.preview-frame').attributes('style')).toContain('--preview-aspect-ratio: 1.7777777777777777');
    expect(contextMock.setTransform).toHaveBeenCalledWith(0.5, 0, 0, 0.5, 0, 0);
    expect(state.canvasBackgroundOptions?.previewQuality?.()).toBe('quarter');
  });

  it('resizes the backing canvas and render scale when preview quality changes at runtime', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
    const mounted = mountEditor({ previewQuality: 'full' });
    await nextTick();
    const canvas = mounted.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(1_600);
    expect(canvas.height).toBe(900);

    await mounted.setProps({ previewQuality: 'half' });
    await nextTick();
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(450);
    expect(canvas.style.width).toBe('');
    expect(canvas.style.height).toBe('');
    expect(mounted.get('.canvas-island').element.clientWidth).toBe(800);
    expect(mounted.find('.preview-frame').attributes('style')).toContain('--preview-aspect-ratio: 1.7777777777777777');
    expect(contextMock.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    expect(state.canvasBackgroundOptions?.previewQuality?.()).toBe('half');
  });

  it('renders the fallback stack, loading state, preview frame, and canvas pointer handlers', async () => {
    const mounted = mountEditor({
      frameFor: () => null,
      playbackState: 'loading',
      selectedZoom: {
        id: 'zoom',
        mode: 'manual',
        start: 0,
        end: 1,
        focus: { x: 0.5, y: 0.5 },
        strength: 1,
      },
    });
    await flushPromises();
    runFrame();

    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(true);
    expect(mounted.find('.editor-canvas').classes()).toContain('is-loading-covered');
    expect(mounted.findComponent(CanvasLoadingSkeleton).props('aspectRatio')).toBe(16 / 9);
    expect(mounted.find('.preview-frame').attributes('style')).toContain('--preview-aspect-ratio: 1.7777777777777777');
    expect(state.drawBackground).toHaveBeenCalled();
    expect(state.drawWebcamClips).toHaveBeenCalledWith(expect.anything(), expect.any(Object));
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

  it('lets Manual Zoom move over composited media without selecting the media first', async () => {
    const mounted = mountEditor({
      selectedZoom: {
        id: 'manual-zoom',
        sessionId: 'session',
        startMs: 0,
        endMs: 2_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2,
        mode: 'manual',
      },
    });
    await flushPromises();
    state.selectVisualAt.mockReturnValue(true);

    await mounted.find('canvas').trigger('pointerdown', { button: 0, clientX: 400, clientY: 225 });
    await mounted.find('canvas').trigger('pointermove', { clientX: 500, clientY: 280 });
    await mounted.find('canvas').trigger('pointerup', { clientX: 500, clientY: 280 });

    expect(state.selectVisualAt).not.toHaveBeenCalled();
    expect(state.beginSelectionMove).toHaveBeenCalledOnce();
    expect(state.moveSelection).toHaveBeenCalledOnce();
    expect(state.endSelectionMove).toHaveBeenCalledOnce();
  });

  it('shows the cursor selection only on the cursor tab while paused', async () => {
    const mounted = mountEditor({ activeTab: 'cursor', isPlaying: false });
    state.cursorBounds!.value = {
      x: 200,
      y: 100,
      width: 40,
      height: 20,
      hotspot: { x: 220, y: 110 },
    };
    await nextTick();
    expect(mounted.find('.cursor-canvas-selection').exists()).toBe(true);

    await mounted.setProps({ activeTab: 'canvas' });
    expect(mounted.find('.cursor-canvas-selection').exists()).toBe(false);
    await mounted.setProps({ activeTab: 'cursor', isPlaying: true });
    expect(mounted.find('.cursor-canvas-selection').exists()).toBe(false);
  });

  it('prioritizes cursor hit-testing over canvas selection and preserves outside-cursor handling', async () => {
    const mounted = mountEditor({ activeTab: 'cursor', isPlaying: false });
    state.cursorBounds!.value = {
      x: 200,
      y: 100,
      width: 40,
      height: 20,
      hotspot: { x: 220, y: 110 },
    };
    const canvas = mounted.get('canvas');
    Object.defineProperty(canvas.element, 'clientWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(canvas.element, 'clientHeight', {
      configurable: true,
      value: 450,
    });
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 450,
      width: 800,
      height: 450,
      toJSON: () => ({}),
    });
    await nextTick();

    await canvas.trigger('pointerdown', {
      button: 0,
      clientX: 220,
      clientY: 110,
    });
    expect(mounted.emitted('select:cursor')).toHaveLength(1);
    expect(state.selectVisualAt).not.toHaveBeenCalled();

    state.selectVisualAt.mockReturnValue(true);
    await canvas.trigger('pointerdown', {
      button: 0,
      clientX: 600,
      clientY: 400,
    });
    expect(mounted.emitted('select:cursor')).toHaveLength(1);
    expect(state.selectVisualAt).toHaveBeenCalled();
  });

  it('resizes the paused cursor selection and clamps emitted size at both limits', async () => {
    const mounted = mountEditor({
      activeTab: 'cursor',
      isPlaying: false,
      cursorSize: 24,
    });
    state.cursorBounds!.value = {
      x: 200,
      y: 100,
      width: 40,
      height: 20,
      hotspot: { x: 220, y: 110 },
    };
    const canvas = mounted.get('canvas');
    Object.defineProperty(canvas.element, 'clientWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(canvas.element, 'clientHeight', {
      configurable: true,
      value: 450,
    });
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 450,
      width: 800,
      height: 450,
      toJSON: () => ({}),
    });
    await nextTick();

    const handle = mounted.find('.cursor-canvas-selection .is-top-left');
    await handle.trigger('pointerdown', {
      pointerId: 1,
      clientX: 200,
      clientY: 100,
    });
    await handle.trigger('pointermove', {
      pointerId: 1,
      clientX: 800,
      clientY: 450,
    });
    expect(mounted.emitted('update:cursor-size')).toContainEqual([16]);
    await handle.trigger('pointerup', { pointerId: 1 });

    await handle.trigger('pointerdown', {
      pointerId: 2,
      clientX: 200,
      clientY: 100,
    });
    await handle.trigger('pointermove', {
      pointerId: 2,
      clientX: 0,
      clientY: 0,
    });
    expect(mounted.emitted('update:cursor-size')).toContainEqual([128]);

    await mounted.setProps({ isPlaying: true });
    await handle.trigger('pointermove', {
      pointerId: 2,
      clientX: 300,
      clientY: 200,
    });
    expect(mounted.emitted('update:cursor-size')).toHaveLength(2);
  });

  it('re-reads the playback frame when frameVersion advances', async () => {
    vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(true);
  });

  it('disables the cursor overlay while an active screen has no frame, then re-enables it when the frame arrives', async () => {
    let available: MediaFrame | null = null;
    const mounted = mountEditor({
      frameFor: () => available,
      playbackState: 'paused',
    });
    await nextTick();

    expect(state.isScreenEnabled?.()).toBe(false);

    available = frame('screen');
    await mounted.setProps({ frameVersion: 1 });
    await nextTick();
    expect(state.isScreenEnabled?.()).toBe(true);

    available = null;
    await mounted.setProps({ frameVersion: 2 });
    await nextTick();
    expect(state.isScreenEnabled?.()).toBe(false);
  });

  it('does not flash a loading skeleton when an already rendered screen track is toggled', async () => {
    let frameAvailable = true;
    const mounted = mountEditor({
      frameFor: (clipId: string) => (clipId === 'screen' && frameAvailable ? frame('screen') : null),
    });
    await nextTick();
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(false);

    const disabledComposition = composition();
    disabledComposition.clips = disabledComposition.clips.map((clip) =>
      clip.kind === 'screen' ? { ...clip, enabled: false } : clip,
    );
    frameAvailable = false;
    await mounted.setProps({
      composition: disabledComposition,
      playbackState: 'loading',
      frameVersion: 1,
    });
    await nextTick();
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(false);
    expect(mounted.find('.preview-frame').exists()).toBe(true);

    await mounted.setProps({ composition: composition(), frameVersion: 2 });
    await nextTick();
    expect(mounted.find('.canvas-loading-skeleton').exists()).toBe(false);
  });

  it('draws through the camera window and exposes transform and crop interactions', async () => {
    const bounds = {
      dx: 0,
      dy: 0,
      dw: 800,
      dh: 450,
      scale: 1,
      focusX: 400,
      focusY: 225,
    };
    state.drawVideoWindow.mockReturnValue(bounds);
    state.updateCursor.mockImplementation((_ctx, _window, _sourceWidth, _sourceHeight, _width, drawContent) => {
      drawContent?.(() => undefined);
    });
    const mounted = mountEditor({ selectedTransformClip: webcam() });
    await flushPromises();
    runFrame();

    expect(state.drawComposition.mock.calls.some((call) => call[1] === bounds)).toBe(true);
    expect(state.updateCursor).toHaveBeenCalled();
    expect(mounted.find('.webcam-selection').exists()).toBe(true);
    await mounted.find('.webcam-selection').trigger('pointerdown');
    await mounted.find('.webcam-selection').trigger('pointermove');
    await mounted.find('.webcam-selection').trigger('pointerup');
    expect(state.beginTransformDrag).toHaveBeenCalledWith(expect.anything(), 'move');
    expect(state.moveTransformDrag).toHaveBeenCalled();
    expect(state.endTransformDrag).toHaveBeenCalled();
    await mounted.setProps({ transformHandlesMuted: true });
    expect(mounted.find('.webcam-selection').classes()).toContain('is-muted');
    await mounted.find('.webcam-selection').trigger('pointerdown');
    expect(state.beginTransformDrag).toHaveBeenCalledTimes(2);
    await mounted.setProps({ transformHandlesMuted: false });
    expect(mounted.find('.webcam-selection').classes()).not.toContain('is-muted');
    state.transformResizeCorners!.value = ['left', 'right'];
    await nextTick();
    expect(mounted.findComponent(ResizeHandle).props('corners')).toEqual(['left', 'right']);

    const positions = { 'top-left': { x: 8, y: 12 }, right: { x: 104, y: 44 } };
    state.transformHandlePositions!.value = positions;
    state.transformPerspectiveCorners!.value = [
      { x: 8, y: 12 },
      { x: 96, y: 4 },
      { x: 104, y: 44 },
      { x: 12, y: 52 },
    ];
    await nextTick();
    expect(mounted.findComponent(ResizeHandle).props('positions')).toEqual(positions);
    expect(mounted.find('.perspective-border polygon').attributes('points')).toBe('8,12 96,4 104,44 12,52');

    state.renderVisualStack?.(contextMock, bounds, vi.fn(), resolveCompositionSceneLayers(composition(), 500));
    expect(state.drawWebcamClips).toHaveBeenCalledWith(expect.anything(), bounds);
    expect(state.drawComposition).toHaveBeenCalledWith(contextMock, bounds, 'image');

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

  it('renders playback captions after the cursor overlay so captions stay above the cursor', async () => {
    const bounds = {
      dx: 0,
      dy: 0,
      dw: 800,
      dh: 450,
      scale: 1,
      focusX: 400,
      focusY: 225,
    };
    state.drawVideoWindow.mockReturnValue(bounds);
    state.drawInCameraSpace.mockImplementation(
      (_ctx: unknown, _window: unknown, drawContent: (() => void) | undefined) => drawContent?.(),
    );
    state.updateCursor.mockImplementation(
      (
        _ctx: unknown,
        _window: unknown,
        _sourceWidth: unknown,
        _sourceHeight: unknown,
        _logicalWidth: unknown,
        drawInCameraSpace: ((drawContent: () => void) => void) | undefined,
      ) => drawInCameraSpace?.(() => undefined),
    );

    mountEditor({ isPlaying: true });
    await nextTick();

    const cursorOrder = state.updateCursor.mock.invocationCallOrder[0];
    const captionOrder = state.drawComposition.mock.invocationCallOrder[0];
    expect(cursorOrder).toBeDefined();
    expect(captionOrder).toBeDefined();
    expect(captionOrder).toBeGreaterThan(cursorOrder!);
  });

  it('opens the native caption editor from the caption hit-test and restores text on Escape', async () => {
    const testCaption = caption();
    const testComposition = composition();
    testComposition.clips.push(testCaption);
    state.clipIdAt.mockReturnValue('caption');
    wrapper = mount(EditorCanvas, {
      props: {
        ...props(),
        composition: testComposition,
        selectedTransformClip: screen(),
      },
      global: { plugins: [MotionPlugin] },
      attachTo: document.body,
    });
    const mounted = wrapper;
    const island = mounted.get('.canvas-island');

    await island.trigger('dblclick', { button: 0, clientX: 400, clientY: 225 });
    await nextTick();

    expect(state.clipIdAt).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 400, clientY: 225 }),
      expect.any(HTMLCanvasElement),
    );
    expect(mounted.emitted('select:clip')).toContainEqual(['caption']);
    expect(mounted.emitted('caption-editing-start')).toHaveLength(1);
    const textarea = mounted.get('textarea').element as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(textarea.selectionEnd).toBe(textarea.value.length);

    vi.useFakeTimers();
    await mounted.get('textarea').setValue('Edited caption');
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(mounted.emitted('update:caption-text')).toContainEqual([
      { clipId: 'caption', customText: 'Edited caption' },
    ]);

    await mounted.get('textarea').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(mounted.find('textarea').exists()).toBe(false);
    expect(mounted.emitted('caption-editing-end')).toContainEqual([{ cancelled: true }]);
    expect(mounted.emitted('update:caption-text')).toContainEqual([
      { clipId: 'caption', customText: 'Original caption' },
    ]);
  });

  it('raycasts layers above an already selected recording before starting its drag', async () => {
    const mounted = mountEditor({ selectedTransformClip: screen() });
    await flushPromises();
    state.clipIdAt.mockReturnValueOnce('blur');

    await mounted.find('.webcam-selection').trigger('pointerdown', { button: 0 });
    expect(mounted.emitted('select:clip')).toContainEqual(['blur']);
    expect(state.beginTransformDrag).not.toHaveBeenCalled();

    state.clipIdAt.mockReturnValueOnce('screen');
    await mounted.find('.webcam-selection').trigger('pointerdown', { button: 0 });
    expect(state.beginTransformDrag).toHaveBeenCalledWith(expect.anything(), 'move');
  });

  it('draws global visuals with the active camera bounds', async () => {
    const cameraBounds = {
      dx: 20,
      dy: 30,
      dw: 400,
      dh: 300,
      scale: 2,
      focusX: 220,
      focusY: 180,
    };
    state.drawVideoWindow.mockReturnValue(cameraBounds);

    mountEditor({
      outputCanvas: { ...DEFAULT_OUTPUT_CANVAS, width: 600, height: 600 },
    });
    await flushPromises();
    runFrame();

    expect(state.drawComposition.mock.calls).toContainEqual(expect.arrayContaining([contextMock, cameraBounds]));
  });

  it('renders watermark-only output changes immediately without playback or seeking', async () => {
    const mounted = mountEditor();
    await flushPromises();
    while (frames.length) runFrame();
    state.drawComposition.mockClear();
    state.syncPlayback.mockClear();

    await mounted.setProps({
      outputCanvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        width: 800,
        height: 450,
        watermark: {
          ...DEFAULT_OUTPUT_CANVAS.watermark!,
          enabled: true,
          text: 'beam',
          showLogo: false,
        },
      },
    });
    await nextTick();

    expect(frames.length).toBeGreaterThan(0);
    expect(state.syncPlayback).not.toHaveBeenCalled();
    expect(mounted.emitted('update:currentTime')).toBeUndefined();
    expect(mounted.emitted('update:isPlaying')).toBeUndefined();

    runFrame();
    expect(state.drawComposition).toHaveBeenCalled();
    expect(contextMock.fillText).toHaveBeenCalledWith('Beam', expect.any(Number), expect.any(Number));
  });

  it('passes the sampled camera scale to the viewport-anchored webcam overlay', async () => {
    const cameraBounds = {
      dx: 20,
      dy: 30,
      dw: 400,
      dh: 300,
      scale: 2,
      focusX: 220,
      focusY: 180,
    };
    state.drawVideoWindow.mockReturnValue(cameraBounds);

    mountEditor();
    await flushPromises();
    runFrame();

    expect(state.drawWebcamClips).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scale: 2 }));
  });

  it('reacts to playback, format, duration, and transition watchers', async () => {
    const mounted = mountEditor();
    runFrame();
    vi.useFakeTimers();
    await mounted.setProps({
      outputCanvas: { ...DEFAULT_OUTPUT_CANVAS, width: 600, height: 600 },
    });
    await nextTick();
    expect(mounted.find('canvas').classes()).toContain('is-format-transitioning');
    vi.advanceTimersByTime(260);
    await nextTick();
    expect(mounted.find('canvas').classes()).not.toContain('is-format-transitioning');
    vi.useRealTimers();

    await mounted.setProps({
      isPlaying: true,
      duration: 0,
      playbackState: 'playing',
    });
    await nextTick();
    runFrame();
    expect(state.syncPlayback).toHaveBeenCalledWith(true);
    expect(mounted.emitted('update:isPlaying')).toBeUndefined();
    expect(mounted.emitted('update:currentTime')).toBeUndefined();

    vi.useFakeTimers();
    await mounted.setProps({
      isPlaying: true,
      duration: 2,
      currentTime: 1.5,
      playbackState: 'playing',
    });
    await nextTick();
    vi.advanceTimersByTime(600);
    runFrame();
    expect(mounted.emitted('update:currentTime')).toBeUndefined();
    expect(mounted.emitted('update:isPlaying')).toBeUndefined();
    vi.useRealTimers();

    await mounted.setProps({
      isPlaying: false,
      duration: 3,
      currentTime: 1,
      playbackState: 'paused',
    });
    await nextTick();
    expect(state.syncPlayback).toHaveBeenLastCalledWith(false);
    expect(state.resetCamera).toHaveBeenCalled();
  });

  it('keeps one playback frame scheduled while a clip-toggle transition requests redraws during rendering', async () => {
    const mounted = mountEditor({ isPlaying: false, playbackState: 'paused' });
    await flushPromises();
    while (frames.length) runFrame();

    await mounted.setProps({ isPlaying: true, playbackState: 'playing' });
    await nextTick();
    expect(frames).toHaveLength(1);

    runFrame();
    expect(frames).toHaveLength(1);

    const disabledComposition = composition();
    disabledComposition.clips = disabledComposition.clips.map((clip) =>
      clip.kind === 'screen' ? { ...clip, enabled: false } : clip,
    );
    await mounted.setProps({ composition: disabledComposition });
    await nextTick();

    // The transition capture and composition invalidation both request a redraw,
    // but they must coalesce with the frame already scheduled for playback.
    expect(frames).toHaveLength(1);

    runFrame();
    expect(frames).toHaveLength(1);
    const drawCountAfterTransitionFrame = state.drawComposition.mock.calls.length;

    // The fade's onRenderOnce callback runs from inside this draw. Playback must
    // continue with one pending frame instead of creating a second RAF chain.
    runFrame();
    expect(frames).toHaveLength(1);
    expect(state.drawComposition.mock.calls.length).toBeGreaterThan(drawCountAfterTransitionFrame);
  });

  it('coalesces a render-once request raised from inside a playback draw', async () => {
    const mounted = mountEditor({ isPlaying: false, playbackState: 'paused' });
    await flushPromises();
    while (frames.length) runFrame();

    const cameraBounds = {
      dx: 0,
      dy: 0,
      dw: 800,
      dh: 450,
      scale: 1,
      focusX: 400,
      focusY: 225,
    };
    state.drawVideoWindow.mockImplementation(() => {
      state.onRenderOnce?.();
      return cameraBounds;
    });
    expect(state.onRenderOnce).toBeDefined();

    await mounted.setProps({ isPlaying: true, playbackState: 'playing' });
    await nextTick();
    expect(frames).toHaveLength(1);

    runFrame();
    expect(frames).toHaveLength(1);

    const drawCountAfterFirstFrame = state.drawVideoWindow.mock.calls.length;
    runFrame();
    expect(frames).toHaveLength(1);
    expect(state.drawVideoWindow.mock.calls.length).toBeGreaterThan(drawCountAfterFirstFrame);
  });

  it('redraws the paused canvas when the selected manual zoom changes', async () => {
    const mounted = mountEditor({ playbackState: 'paused', isPlaying: false });
    await flushPromises();
    while (frames.length) runFrame();
    state.drawVideoWindow.mockClear();

    await mounted.setProps({
      selectedZoom: {
        id: 'manual-zoom',
        sessionId: 'session',
        startMs: 0,
        endMs: 2_000,
        focus: { cx: 0.75, cy: 0.25 },
        depth: 2,
        mode: 'manual',
      },
    });
    await nextTick();

    expect(frames.length).toBeGreaterThan(0);
    runFrame();
    expect(state.drawVideoWindow).toHaveBeenCalled();
  });

  it('coalesces playback invalidations without traversing unrelated composition data', async () => {
    const stableComposition = composition();
    let unrelatedReadCount = 0;
    Object.defineProperty(stableComposition, 'unrelatedNestedData', {
      configurable: true,
      enumerable: true,
      get: () => {
        unrelatedReadCount += 1;
        return { nested: { value: 1 } };
      },
    });
    const mounted = mountEditor({ composition: stableComposition, playbackState: 'paused', isPlaying: false });
    await flushPromises();
    while (frames.length) runFrame();
    const readsAfterInitialRender = unrelatedReadCount;
    state.drawComposition.mockClear();

    await mounted.setProps({ currentTime: 0.75, frameVersion: 1 });
    await nextTick();

    expect(unrelatedReadCount).toBe(readsAfterInitialRender);
    expect(frames).toHaveLength(1);

    runFrame();
    expect(state.drawComposition).toHaveBeenCalledTimes(1);
  });

  it('shows floating recenter button when zoomed and resets zoom on click', async () => {
    const mounted = mountEditor();
    expect(mounted.find('.recenter-button').exists()).toBe(false);

    // Zooming the canvas
    const island = mounted.get('.canvas-island');
    await island.trigger('wheel', { deltaY: -100, preventDefault: vi.fn() });
    await island.trigger('wheel', { deltaY: -100, preventDefault: vi.fn() });
    await island.trigger('wheel', { deltaY: -100, preventDefault: vi.fn() });
    await nextTick();

    expect(mounted.find('.recenter-button').exists()).toBe(true);
    await mounted.get('.recenter-button').trigger('click');
    await nextTick();

    expect(mounted.find('.recenter-button').exists()).toBe(false);
  });
});
