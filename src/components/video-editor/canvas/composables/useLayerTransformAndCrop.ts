import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import type { VideoWindowBounds } from './useCameraZoom';
import { activeClipsAt } from '~/media/shared';
import {
  getCaptionTransform,
  isVisualClip,
  type CaptionClip,
  type ClipComposition,
  type NormalizedCrop,
  type NormalizedTransform,
  type VisualClip,
} from '~/media/shared/composition-types';
import {
  approximateCaptionTextWidth,
  captionTextAt,
  isCaptionWrapEnabled,
  layoutCaptionText,
  type CaptionTextMeasurer,
} from '~/media/shared/caption-text-layout';
import { computeWebcamLayout, webcamSettingsForAppearance } from '../../composition/webcam/webcam-zoom';
import type { OutputCanvasSettings } from '../output-canvas';

import { computeCanvasAlignmentSnapping, type AlignmentGuide } from './canvas-alignment';

const TRANSFORM_MIN = -3;
const TRANSFORM_MAX = 3;
const SIZE_MAX = 4;
type TransformClip = VisualClip | CaptionClip;

const clampWebcamTransform = (value: NormalizedTransform): NormalizedTransform => {
  const width = Math.min(1, Math.max(0.02, value.width));
  const height = Math.min(1, Math.max(0.02, value.height));
  return {
    x: Math.min(1 - width, Math.max(0, value.x)),
    y: Math.min(1 - height, Math.max(0, value.y)),
    width,
    height,
  };
};

export interface UseLayerTransformAndCropOptions {
  composition: () => ClipComposition;
  currentTime: () => number;
  selectedTransformClip: () => TransformClip | null;
  videoWindowBounds: () => VideoWindowBounds | null;
  overlayWindowBounds: () => VideoWindowBounds | null;
  isCropping: () => boolean | undefined;
  outputCanvas: () => OutputCanvasSettings;
  measureCaptionText?: CaptionTextMeasurer;
  zoomScale?: () => number;
  onUpdateTransform: (transform: NormalizedTransform) => void;
  onPreviewTransform: (transform: NormalizedTransform) => void;
  onUpdateCrop: (crop: NormalizedCrop) => void;
  onSelectTransformClip: (clipId: string) => void;
}

export function useLayerTransformAndCrop(options: UseLayerTransformAndCropOptions) {
  const transformDraft = ref<NormalizedTransform | null>(null);
  const cropDraft = ref<NormalizedCrop | null>(null);
  const activeGuideLines = ref<AlignmentGuide[]>([]);
  let previewFrame: number | null = null;
  let pendingPreview: NormalizedTransform | null = null;
  let transformDrag: {
    kind: 'move' | 'resize';
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    transform: NormalizedTransform;
  } | null = null;
  let cropDrag: {
    kind: 'move' | 'resize';
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    value: NormalizedCrop;
  } | null = null;

  const captionTransformFor = (clip: CaptionClip, transform = getCaptionTransform(clip)) => {
    const canvas = options.outputCanvas();
    return layoutCaptionText({
      clip,
      text: captionTextAt(clip, options.currentTime() * 1_000),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      transform,
      measureText: options.measureCaptionText ?? approximateCaptionTextWidth,
    }).transform;
  };
  const transformFor = (clip: TransformClip) => (clip.kind === 'caption' ? captionTransformFor(clip) : clip.transform);
  const boundsFor = (clip: TransformClip | null) =>
    clip?.kind === 'screen'
      ? options.videoWindowBounds()
      : (options.overlayWindowBounds() ?? options.videoWindowBounds());

  // Keep selection, crop and hit-testing in the same coordinate system as the
  // rendered canvas. A camera zoom is a projection around its focus point, not
  // just a larger width and height at the original top-left corner.
  const projectCameraRect = (
    bounds: VideoWindowBounds,
    rect: { left: number; top: number; width: number; height: number },
  ) => {
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    return {
      left: centerX + (rect.left - focusX) * scale,
      top: centerY + (rect.top - focusY) * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    };
  };

  const displayLayoutFor = (clip: TransformClip, transform = transformFor(clip)) => {
    const bounds = boundsFor(clip);
    if (!bounds) return null;
    if (clip.kind === 'webcam') {
      const layout = computeWebcamLayout(
        bounds.dw,
        bounds.dh,
        bounds.scale,
        webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        transform,
      );
      return { left: bounds.dx + layout.x, top: bounds.dy + layout.y, width: layout.width, height: layout.height };
    }
    const rect = {
      left: bounds.dx + transform.x * bounds.dw,
      top: bounds.dy + transform.y * bounds.dh,
      width: transform.width * bounds.dw,
      height: transform.height * bounds.dh,
    };
    // The canvas renderer applies the camera transform only while drawing the
    // screen track. Composition videos/images and captions are drawn afterward
    // in output space, so projecting their handles would move them away from
    // the pixels the user is seeing.
    return clip.kind === 'screen' ? projectCameraRect(bounds, rect) : rect;
  };

  watch(
    () => options.selectedTransformClip()?.id,
    () => {
      if (!transformDrag) transformDraft.value = null;
      cropDraft.value = null;
    },
  );

  const transformHandleStyle = computed(() => {
    const clip = options.selectedTransformClip();
    if (!clip) return { display: 'none' };
    const transform = transformDraft.value ?? transformFor(clip);
    const layout = displayLayoutFor(clip, transform);
    if (!layout) return { display: 'none' };
    return {
      left: `${layout.left}px`,
      top: `${layout.top}px`,
      width: `${layout.width}px`,
      height: `${layout.height}px`,
    };
  });
  const transformResizeCorners = computed<ResizeCorner[] | undefined>(() => {
    const clip = options.selectedTransformClip();
    return clip?.kind === 'caption' && isCaptionWrapEnabled(clip.caption.style) ? ['left', 'right'] : undefined;
  });

  const cropValue = computed<NormalizedCrop>(() => {
    const clip = options.selectedTransformClip();
    return (
      cropDraft.value ?? (clip && isVisualClip(clip) ? clip.crop : undefined) ?? { x: 0, y: 0, width: 1, height: 1 }
    );
  });
  const mirrored = () => {
    const clip = options.selectedTransformClip();
    return Boolean(clip && isVisualClip(clip) && clip.isMirrored);
  };
  const mirroredY = () => {
    const clip = options.selectedTransformClip();
    return Boolean(clip && isVisualClip(clip) && clip.isMirroredY);
  };
  const displayCrop = (crop: NormalizedCrop) => {
    let c = crop;
    if (mirrored()) c = { ...c, x: 1 - c.x - c.width };
    if (mirroredY()) c = { ...c, y: 1 - c.y - c.height };
    return c;
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
      left: `${layout.left}px`,
      top: `${layout.top}px`,
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
      left: `${crop.x * 100}%`,
      top: `${crop.y * 100}%`,
      width: `${crop.width * 100}%`,
      height: `${crop.height * 100}%`,
    };
  });

  const clampCrop = (value: NormalizedCrop): NormalizedCrop => {
    const width = Math.min(1, Math.max(0.05, value.width));
    const height = Math.min(1, Math.max(0.05, value.height));
    return {
      x: Math.min(1 - width, Math.max(0, value.x)),
      y: Math.min(1 - height, Math.max(0, value.y)),
      width,
      height,
    };
  };

  const beginCropDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (event.button !== 0) return;
    cropDrag = { kind, corner, startX: event.clientX, startY: event.clientY, value: displayCrop(cropValue.value) };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveCropDrag = (event: PointerEvent) => {
    if (!cropDrag) return;
    const layout = visualLayout();
    if (!layout) return;
    const vScale = options.zoomScale?.() ?? 1;
    const dx = (event.clientX - cropDrag.startX) / Math.max(1, layout.width * vScale);
    const dy = (event.clientY - cropDrag.startY) / Math.max(1, layout.height * vScale);
    if (cropDrag.kind === 'move') {
      cropDraft.value = sourceCrop(
        clampCrop({ ...cropDrag.value, x: cropDrag.value.x + dx, y: cropDrag.value.y + dy }),
      );
      return;
    }
    const left = cropDrag.corner?.includes('left');
    const top = cropDrag.corner?.includes('top');
    const horizontal = Boolean(left || cropDrag.corner?.includes('right'));
    const vertical = Boolean(top || cropDrag.corner?.includes('bottom'));
    const width = cropDrag.value.width + (horizontal ? (left ? -dx : dx) : 0);
    const height = cropDrag.value.height + (vertical ? (top ? -dy : dy) : 0);
    cropDraft.value = sourceCrop(
      clampCrop({
        x: left ? cropDrag.value.x + cropDrag.value.width - width : cropDrag.value.x,
        y: top ? cropDrag.value.y + cropDrag.value.height - height : cropDrag.value.y,
        width,
        height,
      }),
    );
  };
  const endCropDrag = (event: PointerEvent) => {
    if (cropDraft.value) options.onUpdateCrop(cropDraft.value);
    cropDrag = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  const commitCrop = () => {
    options.onUpdateCrop(clampCrop(cropDraft.value ?? cropValue.value));
    cropDraft.value = null;
  };

  const beginTransformDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (event.button !== 0) return;
    const clip = options.selectedTransformClip();
    if (!clip) return;
    const transform = transformDraft.value ?? transformFor(clip);
    event.stopPropagation();
    transformDraft.value = { ...transform };
    transformDrag = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      transform: { ...transform },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const applyTransformDrag = (clientX: number, clientY: number, freeAspect: boolean) => {
    const clip = options.selectedTransformClip();
    const bounds = boundsFor(clip);
    if (!clip || !bounds || !transformDrag) return;
    transformDrag.lastX = clientX;
    transformDrag.lastY = clientY;
    const scale = clip.kind === 'screen' ? bounds.scale || 1 : 1;
    const vScale = options.zoomScale?.() ?? 1;
    const dx = (clientX - transformDrag.startX) / Math.max(1, bounds.dw * scale * vScale);
    const dy = (clientY - transformDrag.startY) / Math.max(1, bounds.dh * scale * vScale);
    const initial = transformDrag.transform;
    if (transformDrag.kind === 'move') {
      let moved = {
        ...initial,
        x: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, initial.x + dx)),
        y: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, initial.y + dy)),
      };

      const currentTimeMs = options.currentTime() * 1_000;
      const otherTargets = activeClipsAt(options.composition(), currentTimeMs)
        .filter((c): c is TransformClip => (c.kind === 'caption' || isVisualClip(c)) && c.id !== clip.id && c.enabled)
        .map((c) => {
          const t = transformFor(c);
          return { id: c.id, x: t.x, y: t.y, width: t.width, height: t.height };
        });

      const snapResult = computeCanvasAlignmentSnapping(moved, otherTargets, 0.015);
      moved.x = snapResult.x;
      moved.y = snapResult.y;
      activeGuideLines.value = snapResult.guides;

      transformDraft.value = clip.kind === 'webcam' ? clampWebcamTransform(moved) : moved;
      return;
    }
    const left = transformDrag.corner?.includes('left');
    const top = transformDrag.corner?.includes('top');
    const horizontal = Boolean(left || transformDrag.corner?.includes('right'));
    const vertical = Boolean(top || transformDrag.corner?.includes('bottom'));
    const rawWidth = initial.width + (horizontal ? (left ? -dx : dx) : 0);
    const rawHeight = initial.height + (vertical ? (top ? -dy : dy) : 0);
    if (clip.kind === 'caption' && isCaptionWrapEnabled(clip.caption.style)) {
      if (!horizontal) return;
      const width = Math.min(SIZE_MAX, Math.max(0.02, rawWidth));
      transformDraft.value = captionTransformFor(clip, {
        x: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, left ? initial.x + initial.width - width : initial.x)),
        y: initial.y,
        width,
        height: initial.height,
      });
      return;
    }
    const ratio = initial.height / initial.width;
    const corner = horizontal && vertical;
    const width = Math.min(
      SIZE_MAX,
      Math.max(0.02, corner && !freeAspect ? rawWidth : horizontal ? rawWidth : initial.width),
    );
    const height = Math.min(
      SIZE_MAX,
      Math.max(0.02, corner && !freeAspect ? width * ratio : vertical ? rawHeight : initial.height),
    );
    const resized = {
      x: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, left ? initial.x + initial.width - width : initial.x)),
      y: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, top ? initial.y + initial.height - height : initial.y)),
      width,
      height,
    };
    transformDraft.value = clip.kind === 'webcam' ? clampWebcamTransform(resized) : resized;
  };

  const schedulePreview = (transform: NormalizedTransform) => {
    pendingPreview = transform;
    if (previewFrame !== null) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = null;
      if (pendingPreview) options.onPreviewTransform(pendingPreview);
      pendingPreview = null;
    });
  };
  const moveTransformDrag = (event: PointerEvent) => {
    applyTransformDrag(event.clientX, event.clientY, event.shiftKey);
    if (transformDraft.value) schedulePreview(transformDraft.value);
  };
  const updateAspectMode = (event: KeyboardEvent) => {
    if (event.key === 'Shift' && transformDrag)
      applyTransformDrag(transformDrag.lastX, transformDrag.lastY, event.type === 'keydown');
  };
  const endTransformDrag = (event: PointerEvent) => {
    activeGuideLines.value = [];
    if (!transformDrag) return;
    if (previewFrame !== null) cancelAnimationFrame(previewFrame);
    previewFrame = null;
    if (pendingPreview) options.onPreviewTransform(pendingPreview);
    pendingPreview = null;
    if (transformDraft.value) options.onUpdateTransform(transformDraft.value);
    transformDrag = null;
    transformDraft.value = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const selectVisualAt = (event: PointerEvent, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = rect.width / (canvas.clientWidth || 1);
    const x = (event.clientX - rect.left) / (scaleRatio || 1);
    const y = (event.clientY - rect.top) / (scaleRatio || 1);
    const clips = activeClipsAt(options.composition(), options.currentTime() * 1_000)
      .filter((clip): clip is TransformClip => clip.kind === 'caption' || isVisualClip(clip))
      .sort((a, b) => a.order - b.order);
    for (const clip of clips) {
      if (clip.kind === 'screen') continue;
      const layout = displayLayoutFor(clip);
      if (!layout) continue;
      if (x >= layout.left && x <= layout.left + layout.width && y >= layout.top && y <= layout.top + layout.height) {
        options.onSelectTransformClip(clip.id);
        return true;
      }
    }
    return false;
  };

  onMounted(() => {
    window.addEventListener('keydown', updateAspectMode);
    window.addEventListener('keyup', updateAspectMode);
  });
  onUnmounted(() => {
    if (previewFrame !== null) cancelAnimationFrame(previewFrame);
    window.removeEventListener('keydown', updateAspectMode);
    window.removeEventListener('keyup', updateAspectMode);
  });

  return {
    transformDraft,
    cropDraft,
    transformHandleStyle,
    transformResizeCorners,
    cropContainerStyle,
    cropOverlayStyle,
    activeGuideLines,
    beginTransformDrag,
    moveTransformDrag,
    endTransformDrag,
    beginCropDrag,
    moveCropDrag,
    endCropDrag,
    commitCrop,
    selectVisualAt,
  };
}
