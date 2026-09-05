import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { activeClipsAt, sourceTimeAt } from '~/media/shared';
import {
  getCaptionTransform,
  isBlurClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type CaptionClip,
  type NormalizedCrop,
  type NormalizedTransform,
} from '~/media/shared/composition-types';
import type { TransformClip } from '../editor-canvas-types';
import {
  approximateCaptionTextWidth,
  captionTextAt,
  isCaptionWrapEnabled,
  layoutCaptionText,
} from '~/media/shared/caption-text-layout';
import type { UseLayerTransformAndCropOptions } from './layer-transform-and-crop-types';

import { computeCanvasAlignmentSnapping, type AlignmentGuide } from './canvas-alignment';
import { clampNormalizedCrop, mirrorCrop } from './layer-transform-geometry';
import { editableVisualClipTransform, resizePhoneFrameTransform } from '../../composition/visual-framing';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';
import {
  clampEditedWebcamTransform,
  editableWebcamTransform,
  webcamResizePointerScale,
} from './webcam-transform-editing';
import { topmostClipIdAtPoint } from './layer-hit-testing';
import { transformClipDisplayLayout } from './layer-display-layout';
import { layerSelectionPresentation, perspectivePointerDelta } from './layer-selection-presentation';
import { resizeCroppedLayer } from './cropped-layer-resize';

const TRANSFORM_MIN = -3;
const TRANSFORM_MAX = 3;
const SIZE_MAX = 4;
type GlobalCameraClip = Exclude<TransformClip, CaptionClip>;

export function useLayerTransformAndCrop(options: UseLayerTransformAndCropOptions) {
  const transformDraft = ref<NormalizedTransform | null>(null);
  const cropDraft = ref<NormalizedCrop | null>(null);
  const activeGuideLines = ref<AlignmentGuide[]>([]);
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
  const baseTransformFor = (clip: TransformClip) =>
    clip.kind === 'caption' ? captionTransformFor(clip) : clip.transform;
  const usesGlobalCamera = (clip: TransformClip | null): clip is GlobalCameraClip =>
    Boolean(
      clip &&
      (clip.kind === 'screen' ||
        clip.kind === 'video' ||
        clip.kind === 'image' ||
        clip.kind === 'color' ||
        clip.kind === 'shape' ||
        clip.kind === 'blur'),
    );
  const boundsFor = (clip: TransformClip | null) => {
    if (clip?.kind === 'screen') return options.videoWindowBounds();
    return options.overlayWindowBounds() ?? options.videoWindowBounds();
  };
  const transformFor = (clip: TransformClip): NormalizedTransform => {
    const transform = baseTransformFor(clip);
    const bounds = boundsFor(clip);
    if (clip.kind !== 'blur' || clip.shape === 'rectangle' || !bounds) return transform;
    const size = Math.min(transform.width * bounds.dw, transform.height * bounds.dh);
    const width = size / bounds.dw;
    const height = size / bounds.dh;
    return {
      x: transform.x + (transform.width - width) / 2,
      y: transform.y + (transform.height - height) / 2,
      width,
      height,
    };
  };

  const displayLayoutFor = (clip: TransformClip, transform = transformFor(clip)) => {
    const bounds = boundsFor(clip);
    if (!bounds) return null;
    return transformClipDisplayLayout({
      composition: options.composition(),
      clip,
      transform,
      bounds,
      isCropping: Boolean(options.isCropping()),
    });
  };

  watch(
    () => options.selectedTransformClip()?.id,
    () => {
      if (!transformDrag) transformDraft.value = null;
      cropDraft.value = null;
    },
  );

  const transformSelection = computed(() => {
    const clip = options.selectedTransformClip();
    if (!clip) return null;
    const active = clip.enabled && sourceTimeAt(clip, options.currentTime() * 1_000) !== null;
    if (!active) return null;
    const transform = transformDraft.value ?? transformFor(clip);
    const layout = displayLayoutFor(clip, transform);
    const viewport = options.overlayWindowBounds() ?? options.videoWindowBounds();
    if (!layout || !viewport) return null;
    return { layout, viewport };
  });
  const transformSelectionViewportStyle = computed(() => {
    const selection = transformSelection.value;
    if (!selection) return { display: 'none' };
    return {
      left: `${selection.viewport.dx}px`,
      top: `${selection.viewport.dy}px`,
      width: `${selection.viewport.dw}px`,
      height: `${selection.viewport.dh}px`,
    };
  });
  const transformSelectionPresentation = computed(() =>
    layerSelectionPresentation(transformSelection.value, options.selectedTransformClip()?.kind !== 'caption'),
  );
  const transformHandleStyle = computed(() => transformSelectionPresentation.value.handleStyle);
  const transformHandlePositions = computed(() => transformSelectionPresentation.value.handlePositions);
  const transformPerspectiveCorners = computed(() => transformSelectionPresentation.value.perspectiveCorners);
  const transformResizeCorners = computed<ResizeCorner[] | undefined>(() => {
    const clip = options.selectedTransformClip();
    if (clip?.kind === 'caption' && isCaptionWrapEnabled(clip.caption.style)) return ['left', 'right'];
    if (clip && isVisualClip(clip) && isPhoneFrame(clip.appearance.frame))
      return ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
    if (clip?.kind === 'blur' && clip.shape !== 'rectangle')
      return ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
    return undefined;
  });

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
  const beginCropDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (event.button !== 0) return;
    cropDrag = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      value: displayCrop(cropValue.value),
    };
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
        clampNormalizedCrop({
          ...cropDrag.value,
          x: cropDrag.value.x + dx,
          y: cropDrag.value.y + dy,
        }),
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
      clampNormalizedCrop({
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
    options.onUpdateCrop(clampNormalizedCrop(cropDraft.value ?? cropValue.value));
    cropDraft.value = null;
  };

  const beginTransformDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (event.button !== 0) return;
    const clip = options.selectedTransformClip();
    if (!clip) return;
    let transform = transformDraft.value ?? transformFor(clip);
    const bounds = boundsFor(clip);
    if (clip.kind === 'webcam' && bounds)
      transform = editableWebcamTransform(options.composition(), clip, bounds, transform);
    else if (isVisualClip(clip) && bounds)
      transform = editableVisualClipTransform(options.composition(), clip, transform, bounds);
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
    const webcamResizeScale =
      clip.kind === 'webcam' && transformDrag.kind === 'resize' ? webcamResizePointerScale(clip, bounds.scale) : 1;
    const scale = usesGlobalCamera(clip) ? bounds.scale || 1 : webcamResizeScale;
    const vScale = options.zoomScale?.() ?? 1;
    const initial = transformDrag.transform;
    const projectionBounds = options.overlayWindowBounds() ?? bounds;
    const screenDelta = {
      x: (clientX - transformDrag.startX) / vScale,
      y: (clientY - transformDrag.startY) / vScale,
    };
    const pointerDelta =
      clip.kind === 'caption'
        ? screenDelta
        : perspectivePointerDelta(
            displayLayoutFor(clip, initial),
            projectionBounds,
            transformDrag.kind === 'resize' ? transformDrag.corner : undefined,
            screenDelta,
          );
    const dx = pointerDelta.x / Math.max(1, bounds.dw * scale);
    const dy = pointerDelta.y / Math.max(1, bounds.dh * scale);
    if (transformDrag.kind === 'move') {
      let moved = {
        ...initial,
        x: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, initial.x + dx)),
        y: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, initial.y + dy)),
      };

      const currentTimeMs = options.currentTime() * 1_000;
      const otherTargets = activeClipsAt(options.composition(), currentTimeMs)
        .filter(
          (c): c is TransformClip =>
            (c.kind === 'caption' || isVisualClip(c) || isColorClip(c) || isShapeClip(c) || isBlurClip(c)) &&
            c.id !== clip.id &&
            c.enabled,
        )
        .map((c) => {
          const t = transformFor(c);
          return { id: c.id, x: t.x, y: t.y, width: t.width, height: t.height };
        });

      const snapResult = computeCanvasAlignmentSnapping(moved, otherTargets, 0.015);
      moved.x = snapResult.x;
      moved.y = snapResult.y;
      activeGuideLines.value = snapResult.guides;

      transformDraft.value = clip.kind === 'webcam' ? clampEditedWebcamTransform(clip, moved, bounds.scale) : moved;
      return;
    }
    if (isVisualClip(clip) && isPhoneFrame(clip.appearance.frame))
      return void (transformDraft.value = resizePhoneFrameTransform(
        options.composition(),
        clip,
        initial,
        bounds,
        { x: dx, y: dy },
        transformDrag.corner,
      ));
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
    const lockedAspect = clip.kind === 'blur' && (clip.shape === 'square' || clip.shape === 'circle');
    const preserveAspect = lockedAspect || (clip.kind !== 'blur' && !freeAspect);
    const ratio = lockedAspect ? bounds.dw / bounds.dh : initial.height / initial.width;
    const corner = horizontal && vertical;
    const width = Math.min(
      SIZE_MAX,
      Math.max(0.02, corner && preserveAspect ? rawWidth : horizontal ? rawWidth : initial.width),
    );
    const height = Math.min(
      SIZE_MAX,
      Math.max(0.02, corner && preserveAspect ? width * ratio : vertical ? rawHeight : initial.height),
    );
    const resized = {
      x: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, left ? initial.x + initial.width - width : initial.x)),
      y: Math.min(TRANSFORM_MAX, Math.max(TRANSFORM_MIN, top ? initial.y + initial.height - height : initial.y)),
      width,
      height,
    };
    const cropped = isVisualClip(clip)
      ? resizeCroppedLayer(clip, initial, resized, transformDrag.corner, corner && preserveAspect)
      : resized;
    transformDraft.value = clip.kind === 'webcam' ? clampEditedWebcamTransform(clip, cropped, bounds.scale) : cropped;
  };

  const moveTransformDrag = (event: PointerEvent) => {
    applyTransformDrag(event.clientX, event.clientY, event.shiftKey);
  };
  const updateAspectMode = (event: KeyboardEvent) => {
    if (event.key === 'Shift' && transformDrag)
      applyTransformDrag(transformDrag.lastX, transformDrag.lastY, event.type === 'keydown');
  };
  const endTransformDrag = (event: PointerEvent) => {
    activeGuideLines.value = [];
    if (!transformDrag) return;
    if (transformDraft.value) options.onUpdateTransform(transformDraft.value);
    transformDrag = null;
    transformDraft.value = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const clipIdAt = (
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    canvas: HTMLCanvasElement | null,
  ): string | null => {
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const logicalWidth = canvas.clientWidth || canvasRect.width;
    const logicalHeight = canvas.clientHeight || canvasRect.height;
    const x = ((event.clientX - canvasRect.left) * logicalWidth) / canvasRect.width;
    const y = ((event.clientY - canvasRect.top) * logicalHeight) / canvasRect.height;

    const viewport = options.overlayWindowBounds() ?? options.videoWindowBounds();
    if (
      !viewport ||
      x < viewport.dx ||
      x > viewport.dx + viewport.dw ||
      y < viewport.dy ||
      y > viewport.dy + viewport.dh
    )
      return null;

    const active = activeClipsAt(options.composition(), options.currentTime() * 1_000);
    // Captions are rendered after the visual stack. Within each space, lower
    // order values are drawn last and are therefore the first raycast target.
    const clips = [
      ...active.filter((clip): clip is CaptionClip => clip.kind === 'caption'),
      ...active.filter(
        (clip): clip is GlobalCameraClip =>
          isVisualClip(clip) || isColorClip(clip) || isShapeClip(clip) || isBlurClip(clip),
      ),
    ];
    // The screen layer participates in occlusion, but its existing dedicated
    // selection path owns the actual screen selection.
    return topmostClipIdAtPoint(clips, { x, y }, displayLayoutFor);
  };

  const selectVisualAt = (event: PointerEvent, canvas: HTMLCanvasElement | null) => {
    const clipId = clipIdAt(event, canvas);
    if (!clipId) return false;
    options.onSelectTransformClip(clipId);
    return true;
  };

  onMounted(() => {
    window.addEventListener('keydown', updateAspectMode);
    window.addEventListener('keyup', updateAspectMode);
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', updateAspectMode);
    window.removeEventListener('keyup', updateAspectMode);
  });

  return {
    transformDraft,
    cropDraft,
    transformSelectionViewportStyle,
    transformHandleStyle,
    transformHandlePositions,
    transformPerspectiveCorners,
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
    clipIdAt,
    selectVisualAt,
  };
}
