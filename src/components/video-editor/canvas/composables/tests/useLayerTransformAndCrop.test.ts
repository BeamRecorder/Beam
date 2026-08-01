import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useLayerTransformAndCrop,
  type UseLayerTransformAndCropOptions,
} from '../useLayerTransformAndCrop';
import type {
  CaptionClip,
  ClipComposition,
  VisualClip,
} from '../../../composition/composition-types';
import type { VideoWindowBounds } from '../useCameraZoom';

const screenClip = (): VisualClip => ({
  id: 'screen', kind: 'screen', name: 'Screen', assetId: 'screen-asset',
  timelineStartMs: 0, timelineDurationMs: 10_000, sourceInMs: 0, sourceDurationMs: 10_000,
  playbackRate: 1, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 },
});

const webcamClip = (): VisualClip => ({
  id: 'webcam', kind: 'webcam', name: 'Webcam', assetId: 'webcam-asset',
  timelineStartMs: 0, timelineDurationMs: 10_000, sourceInMs: 0, sourceDurationMs: 10_000,
  playbackRate: 1, enabled: true, order: 1,
  transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
  isMirrored: true,
});

const imageClip = (): VisualClip => ({
  id: 'image', kind: 'image', name: 'Image', assetId: 'image-asset',
  timelineStartMs: 0, timelineDurationMs: 10_000, sourceInMs: 0, sourceDurationMs: 10_000,
  playbackRate: 1, enabled: true, order: 2,
  transform: { x: 0.25, y: 0.2, width: 0.5, height: 0.4 },
  crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
});

const captionClip = (): CaptionClip => ({
  id: 'caption', kind: 'caption', name: 'Caption', timelineStartMs: 0, timelineDurationMs: 10_000,
  sourceInMs: 0, sourceDurationMs: 10_000, playbackRate: 1, enabled: true, order: 3,
  caption: {
    sentences: [],
    style: { color: '#fff', fontSize: 32, shadowColor: '#000', shadowBlur: 2, placement: 'center' },
  },
});

const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [
    { id: 'screen-asset', kind: 'video', name: 'Screen', fileName: null, durationMs: 10_000, width: 1920, height: 1080, src: 'screen.mp4', origin: 'session' },
    { id: 'webcam-asset', kind: 'video', name: 'Webcam', fileName: null, durationMs: 10_000, width: 1280, height: 720, src: 'webcam.mp4', origin: 'session' },
    { id: 'image-asset', kind: 'image', name: 'Image', fileName: null, durationMs: 10_000, width: 800, height: 600, src: 'image.png', origin: 'project' },
  ],
  clips: [screenClip(), webcamClip(), imageClip(), captionClip()],
});

const bounds = (): VideoWindowBounds => ({ dx: 10, dy: 20, dw: 800, dh: 450, scale: 2, focusX: 410, focusY: 245 });

let wrapper: VueWrapper | undefined;

const pointer = (target: HTMLElement, overrides: Partial<PointerEvent> = {}) => ({
  clientX: 100, clientY: 100, pointerId: 1, shiftKey: false,
  currentTarget: target, stopPropagation: vi.fn(), preventDefault: vi.fn(),
  ...overrides,
} as unknown as PointerEvent);

const mountComposable = (selected: VisualClip | CaptionClip | null, cropping = false) => {
  const selectedRef = ref<VisualClip | CaptionClip | null>(selected);
  const croppingRef = ref(cropping);
  const selectedBounds = ref<VideoWindowBounds | null>(bounds());
  const overlayBounds = ref<VideoWindowBounds | null>({ dx: 0, dy: 0, dw: 800, dh: 450, scale: 1 });
  const options: UseLayerTransformAndCropOptions = {
    composition,
    currentTime: () => 1,
    selectedTransformClip: () => selectedRef.value,
    videoWindowBounds: () => selectedBounds.value,
    overlayWindowBounds: () => overlayBounds.value,
    isCropping: () => croppingRef.value,
    onUpdateTransform: vi.fn(),
    onPreviewTransform: vi.fn(),
    onUpdateCrop: vi.fn(),
    onSelectTransformClip: vi.fn(),
  };
  let state!: ReturnType<typeof useLayerTransformAndCrop>;
  const Harness = defineComponent({ setup: () => { state = useLayerTransformAndCrop(options); return () => h('div'); } });
  wrapper = mount(Harness);
  return { selectedRef, croppingRef, selectedBounds, overlayBounds, options, get state() { return state; } };
};

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('useLayerTransformAndCrop', () => {
  it('computes hidden, projected, webcam and mirrored crop styles', async () => {
    const mounted = mountComposable(null);
    expect(mounted.state.transformHandleStyle.value).toEqual({ display: 'none' });
    expect(mounted.state.cropOverlayStyle.value).toEqual({ display: 'none' });

    mounted.selectedRef.value = imageClip();
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({ left: '200px', top: '90px', width: '400px', height: '180px' });

    mounted.croppingRef.value = true;
    await nextTick();
    expect(mounted.state.cropOverlayStyle.value).toEqual({ left: '240px', top: '126px', width: '280px', height: '108px' });

    mounted.selectedRef.value = webcamClip();
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({ width: '200px', height: '112.5px' });
    expect(mounted.state.cropOverlayStyle.value).not.toEqual({ display: 'none' });

    mounted.selectedRef.value = captionClip();
    mounted.overlayBounds.value = null;
    mounted.selectedBounds.value = null;
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toEqual({ display: 'none' });
  });

  it('moves and resizes crop selections, clamps them, and commits both previews and final values', () => {
    const mounted = mountComposable(imageClip(), true);
    const target = document.createElement('div');
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const releasePointerCapture = vi.fn();
    Object.assign(target, { setPointerCapture, hasPointerCapture, releasePointerCapture });

    mounted.state.beginCropDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
    mounted.state.moveCropDrag(pointer(target, { clientX: -500, clientY: 800 }));
    expect(mounted.state.cropDraft.value).toMatchObject({ x: 0, y: 0.4 });
    mounted.state.endCropDrag(pointer(target));
    expect(mounted.options.onUpdateCrop).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0.4 }));
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    mounted.state.beginCropDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'top-left');
    mounted.state.moveCropDrag(pointer(target, { clientX: 1000, clientY: 1000 }));
    expect(mounted.state.cropDraft.value?.width).toBeGreaterThanOrEqual(0.05);
    mounted.state.commitCrop();
    expect(mounted.options.onUpdateCrop).toHaveBeenLastCalledWith(expect.objectContaining({ width: expect.any(Number) }));

    mounted.state.moveCropDrag(pointer(target));
    mounted.selectedBounds.value = null;
    mounted.state.beginCropDrag(pointer(target), 'resize', 'bottom-right');
    mounted.state.moveCropDrag(pointer(target, { clientX: 200, clientY: 200 }));
  });

  it('previews move and aspect-constrained resize transforms, including keyboard aspect updates', () => {
    const mounted = mountComposable(imageClip());
    const target = document.createElement('div');
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const releasePointerCapture = vi.fn();
    Object.assign(target, { setPointerCapture, hasPointerCapture, releasePointerCapture });

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 900, clientY: -800 }));
    expect(mounted.state.transformDraft.value).toMatchObject({ x: 1.25, y: -1.8 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    mounted.state.endTransformDrag(pointer(target));
    expect(mounted.options.onPreviewTransform).toHaveBeenCalled();
    expect(mounted.options.onUpdateTransform).toHaveBeenCalledWith(expect.objectContaining({ x: 1.25 }));

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 1000, clientY: 1000, shiftKey: false }));
    expect(mounted.state.transformDraft.value?.height).toBeCloseTo(mounted.state.transformDraft.value!.width * 0.8);
    mounted.state.moveTransformDrag(pointer(target, { clientX: -1000, clientY: -1000, shiftKey: true }));
    expect(mounted.state.transformDraft.value?.width).toBeGreaterThanOrEqual(0.02);
    mounted.state.endTransformDrag(pointer(target));
    expect(setPointerCapture).toHaveBeenCalled();
  });

  it('selects the topmost eligible visual or caption and ignores screen-only hits', () => {
    const mounted = mountComposable(imageClip());
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450 } as DOMRect);
    const event = pointer(canvas, { clientX: 300, clientY: 180 });
    expect(mounted.state.selectVisualAt(event, null)).toBe(false);
    expect(mounted.state.selectVisualAt(event, canvas)).toBe(true);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledWith('image');

    mounted.selectedRef.value = screenClip();
    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 750, clientY: 400 }), canvas)).toBe(false);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledTimes(1);
    mounted.selectedRef.value = null;
    mounted.state.beginTransformDrag(pointer(canvas), 'move');
  });
});
