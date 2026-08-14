import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompositionMedia } from '../useCompositionMedia';
import type { MediaFrame } from '~/media/shared';
import type { ClipComposition, CaptionClip, VisualClip } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';

const drawDecoratedMedia = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/appearance/render-decorated-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/appearance/render-decorated-media')>()),
  drawDecoratedMedia,
}));

const appearance = {
  cornerRadius: 'sm' as const,
  shadowSize: 'md' as const,
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
    sentences: [{ id: 'sentence', text: 'Hello', startMs: 200, endMs: 900, words: [] }],
    style: {
      color: '#fff',
      fontSize: 32,
      shadowColor: '#000',
      shadowBlur: 4,
      placement: 'center',
      boxColor: '#111',
      boxPadding: 8,
    },
  },
});

const composition = (): ClipComposition => ({
  schemaVersion: 1,
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
  }) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionMedia>;

const mountComposable = (initialComposition = composition()) => {
  const compositionRef = ref(initialComposition);
  const currentTime = ref(0.5);
  const selected = ref<VisualClip | CaptionClip | null>(null);
  const draft = ref<VisualClip['transform'] | null>(null);
  const frames = new Map([
    ['video', mediaFrame('video', 640, 360)],
    ['webcam', mediaFrame('webcam', 320, 240)],
  ]);
  const frameFor = vi.fn((clipId: string) => frames.get(clipId) ?? null);
  const onRenderOnce = vi.fn();
  const Harness = defineComponent({
    setup() {
      state = useCompositionMedia({
        composition: () => compositionRef.value,
        currentTime: () => currentTime.value,
        frameFor,
        selectedTransformClip: () => selected.value,
        transformDraft: () => draft.value,
        isCropping: () => false,
        outputCanvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, width: 1_600, height: 900 }),
        captionViewport: () => ({ x: 0, y: 0, width: 800, height: 450 }),
        onRenderOnce,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { compositionRef, currentTime, selected, draft, frameFor, frames, onRenderOnce };
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

  it('wraps caption text into multiple lines without passing a max width when enabled', () => {
    const mounted = mountComposable();
    const captionClip = mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip;
    captionClip.transform = { x: 0.2, y: 0.3, width: 0.1, height: 0.2 };
    captionClip.caption.style = {
      ...captionClip.caption.style,
      customText: 'One two three four',
      wrap: true,
      boxColor: 'transparent',
      boxRadius: 0,
    };
    const ctx = context();
    const fillText = ctx.fillText as ReturnType<typeof vi.fn>;
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 'caption');
    expect(fillText.mock.calls.length).toBeGreaterThan(1);
    expect(fillText.mock.calls.every((call: unknown[]) => call.length === 3)).toBe(true);
    expect(ctx.font).toBe('800 16px sans-serif');
  });

  it('keeps a single constrained fillText call when wrapping is disabled', () => {
    const mounted = mountComposable();
    const captionClip = mounted.compositionRef.value.clips.find((clip) => clip.kind === 'caption') as CaptionClip;
    captionClip.caption.style = {
      ...captionClip.caption.style,
      customText: 'One two three four',
      wrap: false,
      boxColor: 'transparent',
      boxRadius: 0,
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
    await nextTick();
    state.drawComposition(context(), { dx: 0, dy: 0, dw: 800, dh: 400 }, 'image');
    expect(drawDecoratedMedia).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rect: { x: 320, y: 160, width: 160, height: 80 } }),
    );
  });
});
