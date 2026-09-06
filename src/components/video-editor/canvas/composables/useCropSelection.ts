import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isVisualClip, type NormalizedCrop } from '~/media/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import type { UseLayerTransformAndCropOptions, CropDrag, CropDisplayLayout } from './layer-transform-and-crop-types';
import { clampNormalizedCrop, mirrorCrop } from './layer-transform-geometry';
import { cropPixels, cropsEqual, cropSourceDimensions, snapCropToPixels } from '../../composition/crop/crop-pixels';

export function useCropSelection(options: UseLayerTransformAndCropOptions, displayLayoutFor: CropDisplayLayout) {
  const cropDraft = ref<NormalizedCrop | null>(null);
  let cropDrag: CropDrag | null = null;
  const clearDraft = () => {
    cropDraft.value = null;
    cropDrag = null;
    options.onPreviewCrop?.(null);
  };
  const dimensions = computed(() => {
    const clip = options.selectedTransformClip();
    return clip && isVisualClip(clip) ? cropSourceDimensions(options.composition(), clip) : null;
  });
  const normalize = (crop: NormalizedCrop) =>
    dimensions.value ? snapCropToPixels(crop, dimensions.value) : clampNormalizedCrop(crop);
  watch(() => options.selectedTransformClip()?.id, clearDraft);
  watch(
    () => options.selectedTransformClip(),
    (clip) => {
      const crop = clip && isVisualClip(clip) ? clip.crop : undefined;
      if (cropDraft.value && !cropsEqual(crop, cropDraft.value)) {
        clearDraft();
      }
    },
  );
  watch(options.isCropping, (cropping) => {
    if (!cropping) {
      clearDraft();
    }
  });
  onBeforeUnmount(clearDraft);
  const cropValue = computed<NormalizedCrop>(() => {
    const clip = options.selectedTransformClip();
    return (
      cropDraft.value ??
      (clip && isVisualClip(clip) ? clip.crop : undefined) ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }
    );
  });
  const displayCrop = (crop: NormalizedCrop) => {
    const clip = options.selectedTransformClip();
    return mirrorCrop(
      crop,
      Boolean(clip && isVisualClip(clip) && clip.isMirrored),
      Boolean(clip && isVisualClip(clip) && clip.isMirroredY),
    );
  };
  const sourceCrop = displayCrop;
  const visualLayout = () => {
    const clip = options.selectedTransformClip();
    if (!clip || clip.kind === 'caption') return null;
    return displayLayoutFor(clip);
  };
  const cropContainerStyle = computed(() => {
    if (!options.isCropping()) return { display: 'none' };
    const layout = visualLayout();
    if (!layout) return { display: 'none' };
    return {
      left: '0px',
      top: '0px',
      transform: `translate3d(${layout.left}px, ${layout.top}px, 0)`,
      width: `${layout.width}px`,
      height: `${layout.height}px`,
    };
  });
  const cropOverlayStyle = computed(() => {
    if (!options.isCropping()) return { display: 'none' };
    const layout = visualLayout();
    if (!layout) return { display: 'none' };
    const crop = displayCrop(cropValue.value);
    return {
      left: '0px',
      top: '0px',
      transform: `translate3d(${crop.x * layout.width}px, ${crop.y * layout.height}px, 0)`,
      width: `${crop.width * 100}%`,
      height: `${crop.height * 100}%`,
    };
  });
  const beginCropDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    cropDrag = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      value: displayCrop(cropValue.value),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const previewDraft = (crop: NormalizedCrop) => {
    const next = normalize(crop);
    if (cropsEqual(next, cropValue.value)) return;
    cropDraft.value = next;
    options.onPreviewCrop?.(next);
  };
  const moveCropDrag = (event: PointerEvent) => {
    if (!cropDrag) return;
    const layout = visualLayout();
    if (!layout) return;
    const vScale = options.zoomScale?.() ?? 1;
    const dx = (event.clientX - cropDrag.startX) / Math.max(1, layout.width * vScale);
    const dy = (event.clientY - cropDrag.startY) / Math.max(1, layout.height * vScale);
    if (cropDrag.kind === 'move') {
      previewDraft(
        sourceCrop({
          ...cropDrag.value,
          x: Math.min(1 - cropDrag.value.width, Math.max(0, cropDrag.value.x + dx)),
          y: Math.min(1 - cropDrag.value.height, Math.max(0, cropDrag.value.y + dy)),
        }),
      );
      return;
    }
    const left = cropDrag.corner?.includes('left');
    const top = cropDrag.corner?.includes('top');
    const horizontal = Boolean(left || cropDrag.corner?.includes('right'));
    const vertical = Boolean(top || cropDrag.corner?.includes('bottom'));
    const initial = cropDrag.value;
    const minWidth = dimensions.value ? 1 / dimensions.value.width : 0.05;
    const minHeight = dimensions.value ? 1 / dimensions.value.height : 0.05;
    const x = left ? Math.max(0, Math.min(initial.x + initial.width - minWidth, initial.x + dx)) : initial.x;
    const y = top ? Math.max(0, Math.min(initial.y + initial.height - minHeight, initial.y + dy)) : initial.y;
    const right =
      horizontal && !left
        ? Math.min(1, Math.max(x + minWidth, initial.x + initial.width + dx))
        : initial.x + initial.width;
    const bottom =
      vertical && !top
        ? Math.min(1, Math.max(y + minHeight, initial.y + initial.height + dy))
        : initial.y + initial.height;
    previewDraft(sourceCrop({ x, y, width: right - x, height: bottom - y }));
  };
  const endCropDrag = (event: PointerEvent) => {
    if (!cropDrag) return;
    if (
      !['pointercancel', 'lostpointercapture'].includes(event.type) &&
      cropDraft.value &&
      !cropsEqual(displayCrop(cropDraft.value), cropDrag.value)
    )
      options.onUpdateCrop(cropDraft.value);
    clearDraft();
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  const commitCrop = () => {
    if (cropDraft.value) options.onUpdateCrop(cropDraft.value);
    clearDraft();
  };
  const cropMeasurements = computed(() =>
    dimensions.value ? cropPixels(displayCrop(cropValue.value), dimensions.value) : null,
  );
  return {
    cropDraft,
    cropMeasurements,
    cropContainerStyle,
    cropOverlayStyle,
    beginCropDrag,
    moveCropDrag,
    endCropDrag,
    commitCrop,
  };
}
