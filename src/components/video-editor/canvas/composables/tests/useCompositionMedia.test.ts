import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompositionMedia } from '../useCompositionMedia';
import type { MediaFrame } from '~/media/shared';
import type { BlurClip, ClipComposition, CaptionClip, VisualClip } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';
import * as mediaShared from '~/media/shared';
import * as sceneLayers from '../../../composition/scene-layers';
import { frameContentRect, frameOuterRect } from '../../../composition/appearance/frames';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';

const testCaptionStyle = (fontSize: number) => {
  const style = createDefaultCaptionStyle(fontSize);
  return { ...style, shape: { ...style.shape, opacity: 0, blur: 0 } };
};

const drawDecoratedMedia = vi.hoisted(() => vi.fn());
const drawFrameOverlay = vi.hoisted(() => vi.fn());
const applyBlurEffect = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/appearance/render-decorated-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/appearance/render-decorated-media')>()),
  drawDecoratedMedia,
}));
vi.mock('../../../composition/appearance/frames', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/appearance/frames')>()),
  drawFrameOverlay,
}));
vi.mock('../../../composition/effects/blur-effect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/effects/blur-effect')>()),
  applyBlurEffect,
}));

const appearance = {
  cornerRadius: 'sm' as const,
  shadowSize: 'md' as const,
  shadowBlur: 12,
  shadowMode: 'solid' as const,
  shadowColor: '#000',
  shadowDirection: 'bottom' as const,
  borderEnabled: true,
  borderColor: '#f00',
  borderWidth: 2,
  frame: 'none' as const,
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
};

const visual = (kind: 'image' | 'video' | 'webcam', id: string, assetId: string, order: number): VisualClip => ({
  id,
  kind,
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 100,
  sourceDurationMs: 1_000,
  playbackRate: 1.5,
  enabled: true,
  order,
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  appearance,
  isMirrored: true,
  isMirroredY: true,
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
  order: 5,
  transform: { x: 0.2, y: 0.3, width: 0.6, height: 0.2 },
  caption: {
    type: 'text',
    sentences: [{ id: 'sentence', text: 'Hello', startMs: 200, endMs: 900, words: [] }],
    style: {
      ...testCaptionStyle(42),
      color: '#fff',
      fontSize: 32,
      shadowColor: '#000',
      shadowBlur: 4,
      placement: 'center',
      wrap: true,
      shape: testCaptionStyle(42).shape,
      outlineColor: '#111',
      outlineWidth: 8,
      extrusionDepth: 0,
    },
  },
});

const blur = (): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.3, width: 0.3, height: 0.2 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
});

const keyboardCaption = (): CaptionClip => ({
  ...caption(),
  id: 'keyboard-caption',
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'windows',
    sourceSessionId: 'session-1',
    style: caption().caption.style,
  },
});

const composition = (): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'image-asset',
      kind: 'image',
      name: 'Image',
      fileName: 'image.png',
      durationMs: 2_000,
      width: 100,
      height: 80,
      src: 'image.png',
      origin: 'project',
    },
    {
      id: 'video-asset',
      kind: 'video',
      name: 'Video',
      fileName: 'video.mp4',
      durationMs: 2_000,
      width: 640,
      height: 360,
      src: 'video.mp4',
      origin: 'project',
    },
    {
      id: 'webcam-asset',
      kind: 'video',
      name: 'Webcam',
      fileName: 'camera.mp4',
      durationMs: 2_000,
      width: 320,
      height: 240,
      src: 'camera.mp4',
      origin: 'session',
    },
    {
      id: 'sound-asset',
      kind: 'audio',
      name: 'Sound',
      fileName: 'sound.wav',
      durationMs: 2_000,
      width: null,
      height: null,
      src: 'sound.wav',
      origin: 'project',
    },
  ],
  clips: [
    visual('image', 'image', 'image-asset', 1),
    visual('video', 'video', 'video-asset', 2),
    visual('webcam', 'webcam', 'webcam-asset', 3),
    caption(),
  ],
});

const mediaFrame = (clipId: string, width: number, height: number): MediaFrame => ({
  clipId,
  bitmap: { clipId } as unknown as ImageBitmap,
  timestampSeconds: 0.5,
  durationSeconds: 0.04,
  width,
  height,
  byteSize: width * height * 4,
  close: vi.fn(),
});

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn((value: string) => ({ width: value.length * 10 })),
    translate: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    globalAlpha: 1,
  }) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionMedia>;

const mountComposable = (initialComposition = composition(), initiallyCropping = false) => {
  const compositionRef = ref(initialComposition);
  const currentTime = ref(0.5);
  const selected = ref<VisualClip | CaptionClip | null>(null);
  const draft = ref<VisualClip['transform'] | null>(null);
  const cropping = ref(initiallyCropping);
  const frames = new Map([
    ['video', mediaFrame('video', 640, 360)],
    ['webcam', mediaFrame('webcam', 320, 240)],
  ]);
  const frameFor = vi.fn((clipId: string) => frames.get(clipId) ?? null);
  const onRenderOnce = vi.fn();
  const keyboardCursorPosition = ref<{ x: number; y: number } | null>(null);
  const Harness = defineComponent({
    setup() {
      state = useCompositionMedia({
        composition: () => compositionRef.value,
        currentTime: () => currentTime.value,
        frameFor,
        selectedTransformClip: () => selected.value,
        transformDraft: () => draft.value,
        isCropping: () => cropping.value,
        outputCanvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, width: 1_600, height: 900 }),
        captionViewport: () => ({ x: 0, y: 0, width: 800, height: 450 }),
        keyboardCursorPosition: () => keyboardCursorPosition.value,
        onRenderOnce,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return {
    compositionRef,
    currentTime,
    selected,
    draft,
    cropping,
    frameFor,
    frames,
    onRenderOnce,
    keyboardCursorPosition,
  };
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('useCompositionMedia', () => {
  it('reconciles only image assets and drops empty image sources', async () => {
    const mounted = mountComposable();
    expect(state.images.has('image-asset')).toBe(true);
    expect(state.images.has('video-asset')).toBe(false);
    expect(state.images.has('sound-asset')).toBe(false);
    mounted.compositionRef.value = {
      ...mounted.compositionRef.value,
      assets: [{ ...mounted.compositionRef.value.assets[0], id: 'empty', src: '' }],
    };
    await nextTick();
    expect(state.images.has('image-asset')).toBe(false);
    expect(state.images.has('empty')).toBe(false);
  });

  it('uses frameFor by clip id and preserves explicit frame dimensions', () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    const ctx = context();
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 };
    state.drawComposition(ctx, bounds, 'video');
    state.drawWebcamClips(ctx, bounds, 'webcam');
    expect(mounted.frameFor).toHaveBeenCalledWith('video');
    expect(mounted.frameFor).toHaveBeenCalledWith('webcam');
    expect(drawDecoratedMedia).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        source: mounted.frames.get('video')!.bitmap,
        sourceRect: { x: 64, y: 36, width: 512, height: 288 },
        mirrored: true,
        mirroredY: true,
      }),
    );
    expect(drawDecoratedMedia).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        source: mounted.frames.get('webcam')!.bitmap,
        sourceRect: { x: 32, y: 24, width: 256, height: 192 },
        mirrored: true,
        mirroredY: true,
      }),
    );
  });

  it('marks imported image playback as alpha-aware while retaining geometric video shadows', async () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    await nextTick();

    const ctx = context();
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 'image');
    expect(drawDecoratedMedia).toHaveBeenLastCalledWith(
      ctx,
      expect.objectContaining({ source: image, shadowFollowsSourceAlpha: true }),
    );

    drawDecoratedMedia.mockClear();
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 'video');
    expect(drawDecoratedMedia).toHaveBeenLastCalledWith(
      ctx,
      expect.objectContaining({
        source: mounted.frames.get('video')!.bitmap,
        shadowFollowsSourceAlpha: false,
      }),
    );
  });

  it('keeps webcam overlays screen-anchored while a higher blur affects the composed pixels below it', () => {
    const base = composition();
    const mounted = mountComposable({ ...base, clips: [...base.clips, blur()] });
    const ctx = context();
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 2, focusX: 330, focusY: 170 };

    state.drawVisualStack(ctx, bounds, vi.fn());

    expect(ctx.translate).toHaveBeenNthCalledWith(1, 330, 170);
    expect(ctx.scale).toHaveBeenCalledWith(0.5, 0.5);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, -410, -220);
    expect(ctx.translate).toHaveBeenNthCalledWith(3, 10, 20);
    expect(applyBlurEffect).toHaveBeenCalledWith(ctx, expect.objectContaining({ id: 'blur' }), {
      x: 170,
      y: 140,
      width: 240,
      height: 80,
    });
    expect(drawDecoratedMedia.mock.invocationCallOrder.at(-1)).toBeLessThan(
      applyBlurEffect.mock.invocationCallOrder[0],
    );
    expect(mounted.frameFor).toHaveBeenCalledWith('webcam');
  });

  it('uses supplied resolved layers without resolving the scene again', () => {
    const mounted = mountComposable();
    const video = mounted.compositionRef.value.clips.find((clip) => clip.id === 'video') as VisualClip;
    const resolvedLayers = {
      screen: null,
      cameraVisuals: [],
      webcams: [],
      visualStack: [video],
      captions: [],
    };
    const resolveLayers = vi.spyOn(sceneLayers, 'resolveCompositionSceneLayers').mockImplementation(() => {
      throw new Error('drawVisualStack should reuse the supplied scene layers');
    });

    state.drawVisualStack(context(), { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 }, vi.fn(), resolvedLayers);

    expect(resolveLayers).not.toHaveBeenCalled();
    expect(drawDecoratedMedia).toHaveBeenCalled();
  });

  it('uses supplied caption layers without querying active clips or resolving the scene again', () => {
    const mounted = mountComposable();
    const captionClip = mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip;
    const resolvedLayers = {
      screen: null,
      cameraVisuals: [],
      webcams: [],
      visualStack: [],
      captions: [captionClip],
    };
    const activeClips = vi.spyOn(mediaShared, 'activeClipsAt').mockImplementation(() => {
      throw new Error('drawComposition should reuse the supplied captions');
    });
    const resolveLayers = vi.spyOn(sceneLayers, 'resolveCompositionSceneLayers').mockImplementation(() => {
      throw new Error('drawComposition should not resolve the scene when layers are supplied');
    });
    const ctx = context();

    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, undefined, resolvedLayers);

    expect(activeClips).not.toHaveBeenCalled();
    expect(resolveLayers).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('Hello', expect.any(Number), expect.any(Number));
  });

  it('plays the same preview entry transition at timeline zero and after a small offset', () => {
    const zeroStart = visual('video', 'zero-start', 'video-asset', 0);
    zeroStart.transitions = { entry: { preset: { kind: 'fade' }, durationMs: 1_000 }, exit: null };
    mountComposable({ ...composition(), clips: [zeroStart] });
    const zeroContext = context();
    state.drawVisualStack(zeroContext, { dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }, vi.fn());

    wrapper?.unmount();
    wrapper = undefined;

    const offsetStart = visual('video', 'offset-start', 'video-asset', 0);
    offsetStart.timelineStartMs = 1;
    offsetStart.transitions = { entry: { preset: { kind: 'fade' }, durationMs: 1_000 }, exit: null };
    mountComposable({ ...composition(), clips: [offsetStart] });
    const offsetContext = context();
    state.drawVisualStack(offsetContext, { dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }, vi.fn());

    expect(zeroContext.globalAlpha).toBeCloseTo(0.875, 6);
    expect(offsetContext.globalAlpha).toBeCloseTo(0.874248499, 6);
  });

  it.each([30, 60])('does not leave an empty preview frame at a contiguous exit cut (%s fps)', (fps) => {
    const first = visual('video', 'first', 'video-asset', 0);
    first.timelineDurationMs = 1_000;
    first.playbackRate = 1;
    first.transitions = { entry: null, exit: { preset: { kind: 'fade' }, durationMs: 500 } };
    const second = visual('video', 'second', 'video-asset', 1);
    second.timelineStartMs = 1_000;
    second.timelineDurationMs = 1_000;
    second.playbackRate = 1;
    second.transitions = { entry: null, exit: null };
    const mounted = mountComposable({ ...composition(), clips: [first, second] });
    mounted.frames.set('first', mediaFrame('first', 640, 360));
    mounted.frames.set('second', mediaFrame('second', 640, 360));

    const renderAt = (timeMs: number) => {
      mounted.currentTime.value = timeMs / 1_000;
      const ctx = context();
      drawDecoratedMedia.mockClear();
      state.drawVisualStack(ctx, { dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }, vi.fn());
      const call = drawDecoratedMedia.mock.calls[0];
      return {
        source: (call?.[1] as { source?: unknown } | undefined)?.source,
        alpha: ctx.globalAlpha,
        count: drawDecoratedMedia.mock.calls.length,
      };
    };
    const frameMs = 1_000 / fps;

    const before = renderAt(1_000 - frameMs);
    expect(before.source).toMatchObject({ clipId: 'first' });
    expect(before.count).toBe(1);
    expect(before.alpha).toBeCloseTo((frameMs / 500) ** 3, 8);

    const atCut = renderAt(1_000);
    expect(atCut.source).toMatchObject({ clipId: 'second' });
    expect(atCut.count).toBe(1);
    expect(atCut.alpha).toBe(1);

    const after = renderAt(1_000 + frameMs);
    expect(after.source).toMatchObject({ clipId: 'second' });
    expect(after.count).toBe(1);
    expect(after.alpha).toBe(1);
  });

  it('keeps loading frames absent and renders captions and loaded images', () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    const ctx = context();
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 };
    mounted.frameFor.mockReturnValue(null);
    (mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip).caption.style.wrap =
      false;
    state.drawComposition(ctx, bounds, 'video');
    expect(drawDecoratedMedia).not.toHaveBeenCalled();
    state.drawComposition(ctx, bounds, 'image');
    state.drawComposition(ctx, bounds, 'caption');
    expect(drawDecoratedMedia).toHaveBeenCalledWith(ctx, expect.objectContaining({ source: image }));
    expect(ctx.fillText).toHaveBeenCalledWith('Hello', expect.any(Number), expect.any(Number), expect.any(Number));
    mounted.frames.set('video', mediaFrame('video', 1_920, 1_080));
    mounted.frameFor.mockImplementation((clipId: string) => mounted.frames.get(clipId) ?? null);
    state.drawComposition(ctx, bounds, 'video');
    expect(drawDecoratedMedia).toHaveBeenLastCalledWith(
      ctx,
      expect.objectContaining({ sourceRect: { x: 192, y: 108, width: 1_536, height: 864 } }),
    );
  });

  it('applies fit, portrait and circle framing consistently to imported video and image clips', () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400 };
    const presets = ['fit', 'portrait', 'circle'] as const;

    for (const kind of ['image', 'video'] as const) {
      const source = kind === 'image' ? { width: 100, height: 80 } : { width: 640, height: 360 };
      const clip = mounted.compositionRef.value.clips.find((entry) => entry.id === kind) as VisualClip;
      for (const preset of presets) {
        clip.cameraFramingPreset = preset;
        drawDecoratedMedia.mockClear();
        state.drawComposition(context(), bounds, kind);
        const options = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
          rect: { x: number; y: number; width: number; height: number };
          sourceRect?: { x: number; y: number; width: number; height: number };
          mask?: string;
        };
        const expectedAspect = preset === 'fit' ? source.width / source.height : preset === 'portrait' ? 9 / 16 : 1;
        expect(options.rect.width / options.rect.height).toBeCloseTo(expectedAspect, 8);
        expect(options.rect.x).toBeCloseTo(90 + (400 - options.rect.width) / 2, 8);
        expect(options.rect.y).toBeCloseTo(100 + (160 - options.rect.height) / 2, 8);
        expect(options.mask).toBe(preset === 'circle' ? 'circle' : undefined);
        if (preset === 'fit') expect(options.sourceRect).toBeUndefined();
        else {
          expect(options.sourceRect).toBeDefined();
          expect(options.sourceRect!.x).toBeCloseTo((source.width - options.sourceRect!.width) / 2, 8);
          expect(options.sourceRect!.y).toBeCloseTo((source.height - options.sourceRect!.height) / 2, 8);
        }
      }
    }
  });

  it('temporarily removes a selected phone frame and uses source-fit geometry while cropping', () => {
    const phone = {
      ...visual('video', 'phone', 'video-asset', 2),
      appearance: { ...appearance, frame: 'iphone-16-max' as const },
    };
    const mounted = mountComposable({ ...composition(), clips: [phone] }, true);
    mounted.selected.value = phone;
    mounted.frames.set('phone', mediaFrame('phone', 640, 360));
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400 };

    state.drawComposition(context(), bounds, 'phone');
    const cropped = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
      appearance: VisualClip['appearance'];
      rect: { x: number; y: number; width: number; height: number };
      sourceRect?: unknown;
    };

    expect(cropped.appearance).toMatchObject({ frame: 'none' });
    expect(cropped.sourceRect).toBeUndefined();
    expect(cropped.rect.width / cropped.rect.height).toBeCloseTo(16 / 9, 8);
    expect(cropped.rect).toMatchObject({ x: expect.any(Number), y: 100, height: 160 });
    expect(cropped.rect.x).toBeCloseTo(90 + (400 - cropped.rect.width) / 2, 8);

    mounted.cropping.value = false;
    drawDecoratedMedia.mockClear();
    state.drawComposition(context(), bounds, 'phone');
    const normal = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
      appearance: VisualClip['appearance'];
      rect: { x: number; y: number; width: number; height: number };
    };
    expect(normal.appearance).toMatchObject({ frame: 'iphone-16-max' });
    expect(normal.rect).toEqual({ x: 90, y: 100, width: 400, height: 160 });
  });

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'renders the full source first and overlays the fixed %s chrome while cropping',
    (frame) => {
      const phone = {
        ...visual('video', `phone-${frame}`, 'video-asset', 2),
        appearance: { ...appearance, frame },
      };
      const mounted = mountComposable({ ...composition(), clips: [phone] }, true);
      mounted.selected.value = phone;
      mounted.frames.set(phone.id, mediaFrame(phone.id, 640, 360));
      const ctx = context();
      const bounds = { dx: 10, dy: 20, dw: 800, dh: 400 };
      const layout = { x: 90, y: 100, width: 400, height: 160 };
      const expectedOuter = frameOuterRect(layout, frame);

      drawDecoratedMedia.mockClear();
      drawFrameOverlay.mockClear();
      state.drawComposition(ctx, bounds, phone.id);

      const mediaCall = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
        source: unknown;
        sourceRect?: unknown;
        appearance: VisualClip['appearance'];
        rect: { x: number; y: number; width: number; height: number };
      };
      expect(mediaCall.source).toBe(mounted.frames.get(phone.id)!.bitmap);
      expect(mediaCall.sourceRect).toBeUndefined();
      expect(mediaCall.appearance).toMatchObject({ frame: 'none' });
      expect(mediaCall.rect.width / mediaCall.rect.height).toBeCloseTo(16 / 9, 8);
      expect(mediaCall.rect.x).toBeCloseTo(layout.x + (layout.width - mediaCall.rect.width) / 2, 8);
      expect(mediaCall.rect.y).toBeCloseTo(layout.y, 8);

      expect(drawFrameOverlay).toHaveBeenCalledTimes(1);
      const [overlayContext, overlayRect, overlayFrame, overlayTitle, overlayFrameColor, overlayWindows] =
        drawFrameOverlay.mock.calls[0]!;
      expect(overlayContext).toBe(ctx);
      expect(overlayFrame).toBe(frame);
      expect(overlayTitle).toBe(phone.name);
      expect(overlayFrameColor).toBe(phone.appearance.frameColor);
      expect(overlayWindows).toMatchObject({
        showMenu: phone.appearance.frameShowMenu,
        showScrollbars: phone.appearance.frameShowScrollbars,
        chromeScale: phone.appearance.frameChromeScale,
      });
      expect(overlayRect.x).toBeCloseTo(expectedOuter.x, 8);
      expect(overlayRect.y).toBeCloseTo(expectedOuter.y, 8);
      expect(overlayRect.width).toBeCloseTo(expectedOuter.width, 8);
      expect(overlayRect.height).toBeCloseTo(expectedOuter.height, 8);
      expect(drawDecoratedMedia.mock.invocationCallOrder[0]).toBeLessThan(drawFrameOverlay.mock.invocationCallOrder[0]);

      mounted.cropping.value = false;
      drawDecoratedMedia.mockClear();
      drawFrameOverlay.mockClear();
      state.drawComposition(ctx, bounds, phone.id);
      const normalCall = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
        appearance: VisualClip['appearance'];
        rect: { x: number; y: number; width: number; height: number };
      };
      expect(normalCall.appearance).toMatchObject({ frame });
      expect(normalCall.rect).toEqual(layout);
      expect(drawFrameOverlay).not.toHaveBeenCalled();
    },
  );

  it.each(['safari', 'windows-95'] as const)('keeps the %s frame while cropping into its content viewport', (frame) => {
    const clip = {
      ...visual('video', `desktop-${frame}`, 'video-asset', 2),
      appearance: { ...appearance, frame },
    };
    const mounted = mountComposable({ ...composition(), clips: [clip] }, true);
    mounted.selected.value = clip;
    mounted.frames.set(clip.id, mediaFrame(clip.id, 640, 360));
    const ctx = context();
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400 };
    const layout = { x: 90, y: 100, width: 400, height: 160 };

    drawDecoratedMedia.mockClear();
    drawFrameOverlay.mockClear();
    state.drawComposition(ctx, bounds, clip.id);
    const cropped = drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
      sourceRect?: { x: number; y: number; width: number; height: number };
      appearance: VisualClip['appearance'];
      rect: { x: number; y: number; width: number; height: number };
    };
    const content = frameContentRect(layout, frame, {
      showMenu: clip.appearance.frameShowMenu,
      showScrollbars: clip.appearance.frameShowScrollbars,
      chromeScale: clip.appearance.frameChromeScale,
    });
    expect(cropped.appearance).toMatchObject({ frame });
    expect(cropped.rect).toEqual(layout);
    expect(cropped.sourceRect ?? { x: 0, y: 0, width: 640, height: 360 }).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    });
    expect(content.x).toBeGreaterThanOrEqual(layout.x);
    expect(content.y).toBeGreaterThanOrEqual(layout.y);
    expect(content.width).toBeLessThanOrEqual(layout.width);
    expect(content.height).toBeLessThanOrEqual(layout.height);
    expect(drawFrameOverlay).not.toHaveBeenCalled();

    mounted.cropping.value = false;
    drawDecoratedMedia.mockClear();
    drawFrameOverlay.mockClear();
    state.drawComposition(ctx, bounds, clip.id);
    expect(drawDecoratedMedia.mock.calls.at(-1)?.[1]).toMatchObject({ appearance: { frame } });
    expect(drawFrameOverlay).not.toHaveBeenCalled();
  });

  it('wraps caption text into multiple lines without passing a max width when enabled', () => {
    const mounted = mountComposable();
    const captionClip = mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip;
    captionClip.transform = { x: 0.2, y: 0.3, width: 0.1, height: 0.2 };
    captionClip.caption.style = {
      ...captionClip.caption.style,
      customText: 'One two three four',
      wrap: true,
      outlineColor: 'transparent',
      extrusionDepth: 0,
    };
    const ctx = context();
    const fillText = ctx.fillText as ReturnType<typeof vi.fn>;
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 'caption');
    expect(fillText.mock.calls.length).toBeGreaterThan(1);
    expect(fillText.mock.calls.every((call: unknown[]) => call.length === 3)).toBe(true);
    expect(ctx.font).toBe('normal 800 16px sans-serif');
  });

  it('keeps a single constrained fillText call when wrapping is disabled', () => {
    const mounted = mountComposable();
    const captionClip = mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip;
    captionClip.caption.style = {
      ...captionClip.caption.style,
      customText: 'One two three four',
      wrap: false,
      outlineColor: 'transparent',
      extrusionDepth: 0,
    };
    const ctx = context();
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 'caption');
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith(
      'One two three four',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('uses the preview cursor position for keyboard captions and falls back to fixed placement', () => {
    const keyboard = keyboardCaption();
    const base = composition();
    const mounted = mountComposable({
      ...base,
      clips: [...base.clips.filter((clip) => clip.kind !== 'caption'), keyboard],
    });
    const fixed = context();
    state.drawComposition(fixed, { dx: 0, dy: 0, dw: 800, dh: 450 }, 'keyboard-caption');
    const fixedX = (fixed.fillText as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as number;

    mounted.keyboardCursorPosition.value = { x: 700, y: 350 };
    const followed = context();
    state.drawComposition(followed, { dx: 0, dy: 0, dw: 800, dh: 450 }, 'keyboard-caption');
    const followedX = (followed.fillText as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as number;

    expect(fixedX).toBeDefined();
    expect(followedX).toBeDefined();
    expect(followedX).not.toBe(fixedX);
  });

  it('applies transform drafts and omits crop while cropping', async () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    mounted.selected.value = mounted.compositionRef.value.clips.find((clip) => clip.id === 'image') as VisualClip;
    mounted.draft.value = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
    mounted.cropping.value = true;
    await nextTick();
    state.drawComposition(context(), { dx: 0, dy: 0, dw: 800, dh: 400 }, 'image');
    expect(drawDecoratedMedia).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        rect: { x: 320, y: 160, width: 160, height: 80 },
      }),
    );
  });

  it('keeps a committed bottom crop at the source scale while reopening its full editing layout', async () => {
    const mounted = mountComposable();
    const image = state.images.get('image-asset')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    const clip = mounted.compositionRef.value.clips.find((entry) => entry.id === 'image') as VisualClip;
    clip.crop = { x: 0, y: 0.75, width: 1, height: 0.25 };
    clip.isMirrored = false;
    clip.isMirroredY = false;
    mounted.selected.value = clip;
    await nextTick();

    const bounds = { dx: 0, dy: 0, dw: 800, dh: 400 };
    const render = () => {
      drawDecoratedMedia.mockClear();
      state.drawComposition(context(), bounds, clip.id);
      return drawDecoratedMedia.mock.calls.at(-1)?.[1] as {
        rect: { x: number; y: number; width: number; height: number };
        sourceRect?: { x: number; y: number; width: number; height: number };
      };
    };

    expect(render()).toEqual(
      expect.objectContaining({
        sourceRect: { x: 0, y: 60, width: 100, height: 20 },
        rect: { x: 80, y: 200, width: 400, height: 40 },
      }),
    );

    mounted.cropping.value = true;
    await nextTick();
    expect(render()).toEqual(
      expect.objectContaining({
        sourceRect: { x: 0, y: 0, width: 100, height: 80 },
        rect: { x: 80, y: 80, width: 400, height: 160 },
      }),
    );

    mounted.cropping.value = false;
    await nextTick();
    expect(render()).toEqual(
      expect.objectContaining({
        sourceRect: { x: 0, y: 60, width: 100, height: 20 },
        rect: { x: 80, y: 200, width: 400, height: 40 },
      }),
    );
  });
});
