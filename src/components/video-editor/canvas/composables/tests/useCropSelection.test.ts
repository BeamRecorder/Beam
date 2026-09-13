import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  COMPOSITION_SCHEMA_VERSION,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import type { TransformClip } from '../../editor-canvas-types';
import { useCropSelection } from '../useCropSelection';
import type { CropDisplayLayout, UseLayerTransformAndCropOptions } from '../layer-transform-and-crop-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';

const sourceSize = { width: 100, height: 80 };

const sourceAsset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'asset',
  kind: 'image',
  name: 'Asset',
  fileName: 'asset.png',
  durationMs: 1_000,
  width: sourceSize.width,
  height: sourceSize.height,
  src: 'asset.png',
  origin: 'project',
  ...overrides,
});

const visualClip = (overrides: Partial<VisualClip> = {}): VisualClip => ({
  id: 'clip',
  kind: 'image',
  name: 'Image',
  assetId: 'asset',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const compositionFor = (clip: VisualClip): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [sourceAsset()],
  clips: [clip],
  keyboardCaptionSessions: [],
});

const pointer = (target: HTMLElement, overrides: Partial<PointerEvent> = {}) =>
  ({
    clientX: 0,
    clientY: 0,
    button: 0,
    pointerId: 1,
    type: 'pointermove',
    currentTarget: target,
    stopPropagation: vi.fn(),
    ...overrides,
  }) as unknown as PointerEvent;

type MountedCropSelection = {
  state: ReturnType<typeof useCropSelection>;
  selected: ReturnType<typeof ref<TransformClip | null>>;
  composition: ReturnType<typeof ref<ClipComposition>>;
  cropping: ReturnType<typeof ref<boolean>>;
  onPreviewCrop: ReturnType<typeof vi.fn>;
  onUpdateCrop: ReturnType<typeof vi.fn>;
  target: HTMLElement;
  wrapper: VueWrapper;
};

type MountCropSelectionOptions = {
  selected?: TransformClip | null;
  composition?: ClipComposition;
  layout?: ReturnType<CropDisplayLayout>;
  zoomScale?: number;
  hasPointerCapture?: boolean;
  withPreview?: boolean;
};

const mountedWrappers: VueWrapper[] = [];

const mountCropSelection = (
  initial: Partial<VisualClip> = {},
  mountOptions: MountCropSelectionOptions = {},
): MountedCropSelection => {
  const clip = visualClip(initial);
  const selected = ref<TransformClip | null>(mountOptions.selected === undefined ? clip : mountOptions.selected);
  const composition = ref(mountOptions.composition ?? compositionFor(clip));
  const cropping = ref(true);
  const onPreviewCrop = vi.fn();
  const onUpdateCrop = vi.fn();
  const target = document.createElement('div');
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn().mockReturnValue(mountOptions.hasPointerCapture ?? true),
    releasePointerCapture: vi.fn(),
  });

  const options: UseLayerTransformAndCropOptions = {
    composition: () => composition.value,
    currentTime: () => 0.5,
    selectedTransformClip: () => selected.value,
    videoWindowBounds: () => ({ dx: 0, dy: 0, dw: 100, dh: 80, scale: 1 }),
    overlayWindowBounds: () => ({ dx: 0, dy: 0, dw: 100, dh: 80, scale: 1 }),
    isCropping: () => cropping.value,
    outputCanvas: () => ({ width: 100, height: 80, preset: 'custom', showBackground: true }),
    zoomScale: mountOptions.zoomScale === undefined ? undefined : () => mountOptions.zoomScale ?? 1,
    onUpdateTransform: vi.fn(),
    ...(mountOptions.withPreview === false ? {} : { onPreviewCrop }),
    onUpdateCrop,
    onSelectTransformClip: vi.fn(),
  };

  let state!: ReturnType<typeof useCropSelection>;
  const Harness = defineComponent({
    setup: () => {
      state = useCropSelection(options, () =>
        mountOptions.layout === undefined ? { left: 0, top: 0, width: 100, height: 80 } : mountOptions.layout,
      );
      return () => h('div');
    },
  });
  const wrapper = mount(Harness);
  mountedWrappers.push(wrapper);

  return { state, selected, composition, cropping, onPreviewCrop, onUpdateCrop, target, wrapper };
};

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

describe('useCropSelection', () => {
  it('previews handle moves and commits exactly once at the end of a gesture', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, onPreviewCrop, onUpdateCrop } = mounted;

    const start = pointer(target);
    state.beginCropDrag(start, 'resize', 'bottom-right');
    expect(start.stopPropagation).toHaveBeenCalled();
    state.moveCropDrag(pointer(target, { clientX: 1, clientY: 1 }));
    state.moveCropDrag(pointer(target, { clientX: 5, clientY: 4 }));

    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(state.cropDraft.value).toEqual({ x: 0.1, y: 0.15, width: 0.85, height: 0.75 });
    expect(onPreviewCrop).toHaveBeenLastCalledWith(state.cropDraft.value);

    state.endCropDrag(pointer(target, { type: 'pointerup' }));

    expect(onUpdateCrop).toHaveBeenCalledTimes(1);
    expect(onUpdateCrop).toHaveBeenCalledWith({ x: 0.1, y: 0.15, width: 0.85, height: 0.75 });
    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
    expect(target.setPointerCapture as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(1);
    expect(target.releasePointerCapture as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(1);
  });

  it('publishes each changed snapped crop once and does not commit when it returns to the initial crop', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
    const { state, target, onPreviewCrop, onUpdateCrop } = mounted;
    const initial = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    const first = { x: 0.11, y: 0.1, width: 0.8, height: 0.8 };
    const second = { x: 0.12, y: 0.1, width: 0.8, height: 0.8 };

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 1.2, clientY: 0 }));
    state.moveCropDrag(pointer(target, { clientX: 1.3, clientY: 0 }));
    expect(onPreviewCrop).toHaveBeenCalledTimes(1);
    expect(onPreviewCrop).toHaveBeenLastCalledWith(first);

    state.moveCropDrag(pointer(target, { clientX: 2.3, clientY: 0 }));
    expect(onPreviewCrop).toHaveBeenCalledTimes(2);
    expect(onPreviewCrop).toHaveBeenLastCalledWith(second);

    state.moveCropDrag(pointer(target, { clientX: 0, clientY: 0 }));
    expect(onPreviewCrop).toHaveBeenCalledTimes(3);
    expect(onPreviewCrop).toHaveBeenLastCalledWith(initial);

    state.endCropDrag(pointer(target, { type: 'pointerup' }));
    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
  });

  it('cancels a pointer gesture without committing its draft', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, onPreviewCrop, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 20, clientY: 10 }));
    expect(state.cropDraft.value).not.toBeNull();

    state.endCropDrag(pointer(target, { type: 'pointercancel' }));

    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
    expect(target.releasePointerCapture as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(1);
  });

  it('cancels a gesture when pointer capture is lost', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, onPreviewCrop, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 20, clientY: 10 }));
    state.endCropDrag(pointer(target, { type: 'lostpointercapture' }));

    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
    expect(target.releasePointerCapture as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(1);
  });

  it('clears a draft and its preview when undo or redo replaces the selected clip', async () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, selected, composition, onPreviewCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 12, clientY: 8 }));
    expect(state.cropDraft.value).not.toBeNull();

    const restored = visualClip({ crop: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 } });
    selected.value = restored;
    composition.value = compositionFor(restored);
    await nextTick();

    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
  });

  it('clears a draft and preview when the selected clip id changes', async () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, selected, onPreviewCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 12, clientY: 8 }));
    selected.value = visualClip({ id: 'replacement', crop: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 } });
    await nextTick();

    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
  });

  it('keeps a draft when an external clip object has the same crop', async () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, selected, onPreviewCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 12, clientY: 8 }));
    const draft = state.cropDraft.value;
    selected.value = visualClip({ crop: draft ?? undefined });
    await nextTick();

    expect(state.cropDraft.value).toEqual(draft);
    expect(onPreviewCrop).toHaveBeenLastCalledWith(draft);
  });

  it('cancels a draft and preview when crop mode closes', async () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, target, cropping, onPreviewCrop, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 10 }));
    cropping.value = false;
    await nextTick();

    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);

    cropping.value = true;
    await nextTick();
    expect(state.cropDraft.value).toBeNull();
  });

  it('clears the preview when the composable is unmounted', () => {
    const mounted = mountCropSelection();
    const { state, target, onPreviewCrop, wrapper } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 10 }));
    wrapper.unmount();

    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
  });

  it('maps a mirrored handle edge back to the source crop before committing', () => {
    const mounted = mountCropSelection({
      isMirrored: true,
      isMirroredY: true,
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
    });
    const { state, target, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'resize', 'top-left');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 0 }));
    state.endCropDrag(pointer(target, { type: 'pointerup' }));

    expect(onUpdateCrop).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.4, height: 0.5 });
  });

  it('snaps handle edits to source pixels and preserves the opposite edge at the one-pixel minimum', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
    const { state, target, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'resize', 'top-left');
    state.moveCropDrag(pointer(target, { clientX: 1.26, clientY: 1.26 }));
    expect(state.cropDraft.value).toEqual({ x: 0.11, y: 0.1125, width: 0.79, height: 0.7875 });
    state.endCropDrag(pointer(target, { type: 'pointerup' }));

    expect(onUpdateCrop).toHaveBeenCalledWith({ x: 0.11, y: 0.1125, width: 0.79, height: 0.7875 });

    const second = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
    second.state.beginCropDrag(pointer(second.target), 'resize', 'top-left');
    second.state.moveCropDrag(pointer(second.target, { clientX: 1_000, clientY: 1_000 }));

    expect(second.state.cropDraft.value).toEqual({ x: 0.89, y: 0.8875, width: 0.01, height: 0.0125 });
    second.state.endCropDrag(pointer(second.target, { type: 'pointerup' }));
    expect(second.onUpdateCrop).toHaveBeenCalledWith({ x: 0.89, y: 0.8875, width: 0.01, height: 0.0125 });
    expect(second.state.cropDraft.value).toBeNull();
  });

  it('computes crop styles and source pixel measurements from the visible crop', async () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } });
    const { state, cropping } = mounted;

    expect(state.cropContainerStyle.value).toEqual({
      left: '0px',
      top: '0px',
      transform: 'translate3d(0px, 0px, 0)',
      width: '100px',
      height: '80px',
    });
    expect(state.cropOverlayStyle.value).toEqual({
      left: '0px',
      top: '0px',
      transform: 'translate3d(10px, 12px, 0)',
      width: '80%',
      height: '70%',
    });
    expect(state.cropMeasurements.value).toEqual({ left: 10, top: 12, right: 10, bottom: 12, width: 80, height: 56 });

    cropping.value = false;
    await nextTick();
    expect(state.cropContainerStyle.value).toEqual({ display: 'none' });
    expect(state.cropOverlayStyle.value).toEqual({ display: 'none' });
  });

  it('hides styles when the selected clip has no display layout', () => {
    const mounted = mountCropSelection({}, { layout: null });

    expect(mounted.state.cropContainerStyle.value).toEqual({ display: 'none' });
    expect(mounted.state.cropOverlayStyle.value).toEqual({ display: 'none' });
  });

  it('handles an empty selection and non-visual selection without source dimensions', () => {
    const empty = mountCropSelection({}, { selected: null });
    expect(empty.state.cropMeasurements.value).toBeNull();
    expect(empty.state.cropContainerStyle.value).toEqual({ display: 'none' });
    expect(empty.state.cropOverlayStyle.value).toEqual({ display: 'none' });

    const caption = { ...visualClip({ id: 'caption' }), kind: 'caption' } as unknown as TransformClip;
    const nonVisual = mountCropSelection({}, { selected: caption });
    expect(nonVisual.state.cropMeasurements.value).toBeNull();
    expect(nonVisual.state.cropContainerStyle.value).toEqual({ display: 'none' });
    expect(nonVisual.state.cropOverlayStyle.value).toEqual({ display: 'none' });
  });

  it('uses the normalized fallback when source dimensions are unavailable', () => {
    const clip = visualClip({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
    const composition = compositionFor(clip);
    composition.assets = [];
    const mounted = mountCropSelection(clip, { composition });
    const { state, target, onUpdateCrop } = mounted;

    expect(state.cropMeasurements.value).toBeNull();
    state.beginCropDrag(pointer(target), 'resize', 'top-left');
    state.moveCropDrag(pointer(target, { clientX: 1_000, clientY: 1_000 }));
    expect(state.cropDraft.value?.width).toBeGreaterThanOrEqual(0.05);
    expect(state.cropDraft.value?.height).toBeGreaterThanOrEqual(0.05);
    state.endCropDrag(pointer(target, { type: 'pointerup' }));
    expect(onUpdateCrop).toHaveBeenCalledTimes(1);
  });

  it('uses viewport zoom when converting pointer movement to crop movement', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }, { zoomScale: 2 });
    const { state, target } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 20, clientY: 0 }));

    expect(state.cropDraft.value?.x).toBeCloseTo(0.2);
  });

  it('ignores non-primary pointer starts and operations without an active layout', () => {
    const ignored = mountCropSelection();
    const { state, target, onPreviewCrop, onUpdateCrop } = ignored;
    state.beginCropDrag(pointer(target, { button: 2 }), 'move');
    state.moveCropDrag(pointer(target, { clientX: 20, clientY: 10 }));
    state.endCropDrag(pointer(target, { type: 'pointerup' }));
    state.commitCrop();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
    expect(onUpdateCrop).not.toHaveBeenCalled();
    expect(target.setPointerCapture as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();

    const noLayout = mountCropSelection({}, { layout: null });
    noLayout.state.beginCropDrag(pointer(noLayout.target), 'move');
    noLayout.state.moveCropDrag(pointer(noLayout.target, { clientX: 20, clientY: 10 }));
    expect(noLayout.state.cropDraft.value).toBeNull();
    noLayout.state.endCropDrag(pointer(noLayout.target, { type: 'pointercancel' }));
    expect(noLayout.onUpdateCrop).not.toHaveBeenCalled();
  });

  it('commits a pending draft through the explicit crop action', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } });
    const { state, target, onPreviewCrop, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 8 }));
    const draft = state.cropDraft.value;
    state.commitCrop();

    expect(onUpdateCrop).toHaveBeenCalledTimes(1);
    expect(onUpdateCrop).toHaveBeenCalledWith(draft);
    expect(state.cropDraft.value).toBeNull();
    expect(onPreviewCrop).toHaveBeenLastCalledWith(null);
  });

  it('does not release a pointer that is no longer captured', () => {
    const mounted = mountCropSelection(
      { crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
      { hasPointerCapture: false },
    );
    const { state, target, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 8 }));
    state.endCropDrag(pointer(target, { type: 'pointerup' }));

    expect(onUpdateCrop).toHaveBeenCalledTimes(1);
    expect(target.releasePointerCapture as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it.each(['top', 'bottom', 'left', 'right', undefined] as Array<ResizeCorner | undefined>)(
    'handles the %s resize direction',
    (corner) => {
      const mounted = mountCropSelection({ crop: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } });
      const { state, target } = mounted;

      state.beginCropDrag(pointer(target), 'resize', corner);
      state.moveCropDrag(pointer(target, { clientX: 10, clientY: 8 }));
      if (corner === undefined) expect(state.cropDraft.value).toBeNull();
      else expect(state.cropDraft.value).not.toBeNull();
      state.endCropDrag(pointer(target, { type: 'pointercancel' }));
      expect(state.cropDraft.value).toBeNull();
    },
  );

  it('works when no preview callback is provided', () => {
    const mounted = mountCropSelection({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }, { withPreview: false });
    const { state, target, onUpdateCrop } = mounted;

    state.beginCropDrag(pointer(target), 'move');
    state.moveCropDrag(pointer(target, { clientX: 10, clientY: 8 }));
    state.endCropDrag(pointer(target, { type: 'pointerup' }));

    expect(onUpdateCrop).toHaveBeenCalledTimes(1);
  });
});
