import { activeClipsAt } from '~/media/shared';
import {
  isBlurClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type NormalizedTransform,
} from '~/media/shared/composition-types';
import { onUnmounted, shallowRef, watch } from 'vue';
import { transformCaptionFollowsCursor, type ClipTransformUpdate, type TransformClip } from '../editor-canvas-types';
import type { CanvasRect } from './layer-transform-geometry';
import type { VideoWindowBounds } from './useCameraZoom';
import { perspectivePointerDelta } from './layer-selection-presentation';
import { editableVisualClipTransform } from '../../composition/visual-framing';
import { clampEditedWebcamTransform, editableWebcamTransform } from './webcam-transform-editing';
import { computeCanvasAlignmentSnapping, type AlignmentGuide } from './canvas-alignment';

interface SelectedLayerMoveOptions {
  composition: () => Parameters<typeof activeClipsAt>[0];
  currentTime: () => number;
  selectedClipIds: () => readonly string[];
  clipIdAt: (event: PointerEvent, canvas: HTMLCanvasElement | null, includeScreen?: boolean) => string | null;
  transformFor: (clip: TransformClip) => NormalizedTransform;
  boundsFor: (clip: TransformClip) => VideoWindowBounds | null;
  displayLayoutFor: (clip: TransformClip, transform: NormalizedTransform) => CanvasRect | null;
  zoomScale: () => number;
  onUpdate: (transforms: ClipTransformUpdate[]) => void;
  onGuides?: (guides: AlignmentGuide[]) => void;
}

interface SelectedLayerMoveEntry {
  clip: TransformClip;
  transform: NormalizedTransform;
  bounds: VideoWindowBounds;
  layout: CanvasRect | null;
}

interface SelectedLayerMoveGesture {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  target: HTMLElement;
  entries: SelectedLayerMoveEntry[];
}

const isTransformClip = (clip: ReturnType<typeof activeClipsAt>[number]): clip is TransformClip =>
  clip.kind === 'caption' || isVisualClip(clip) || isColorClip(clip) || isShapeClip(clip) || isBlurClip(clip);

const usesGlobalCamera = (clip: TransformClip) =>
  clip.kind === 'screen' ||
  clip.kind === 'video' ||
  clip.kind === 'image' ||
  clip.kind === 'color' ||
  clip.kind === 'shape' ||
  clip.kind === 'blur';

export function useSelectedLayerMove(options: SelectedLayerMoveOptions) {
  const drafts = shallowRef<Record<string, NormalizedTransform>>({});
  let gesture: SelectedLayerMoveGesture | null = null;

  const clear = () => {
    gesture = null;
    drafts.value = {};
    options.onGuides?.([]);
  };
  const begin = (event: PointerEvent, canvas: HTMLCanvasElement | null) => {
    const selectedIds = options.selectedClipIds();
    if (event.button !== 0 || selectedIds.length < 2) return false;
    const selected = new Set(selectedIds);
    const hitId = options.clipIdAt(event, canvas, true);
    if (!hitId || !selected.has(hitId)) return false;
    const entries = activeClipsAt(options.composition(), options.currentTime() * 1_000).flatMap((clip) => {
      if (!selected.has(clip.id) || clip.locked || !isTransformClip(clip) || transformCaptionFollowsCursor(clip))
        return [];
      const bounds = options.boundsFor(clip);
      if (!bounds) return [];
      let transform = options.transformFor(clip);
      if (clip.kind === 'webcam') transform = editableWebcamTransform(options.composition(), clip, bounds, transform);
      else if (isVisualClip(clip))
        transform = editableVisualClipTransform(options.composition(), clip, transform, bounds);
      return [{ clip, transform, bounds, layout: options.displayLayoutFor(clip, transform) }];
    });
    if (!entries.some(({ clip }) => clip.id === hitId)) return false;
    event.preventDefault();
    event.stopPropagation();
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      target: event.currentTarget as HTMLElement,
      entries,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    return true;
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const delta = {
      x: (event.clientX - gesture.startX) / options.zoomScale(),
      y: (event.clientY - gesture.startY) / options.zoomScale(),
    };
    if (!gesture.moved && Math.hypot(delta.x, delta.y) < 4) return true;
    gesture.moved = true;
    const movedDrafts = Object.fromEntries(
      gesture.entries.map(({ clip, transform, bounds, layout }) => {
        const pointerDelta =
          clip.kind === 'caption' ? delta : perspectivePointerDelta(layout, bounds, undefined, delta);
        const scale = usesGlobalCamera(clip) ? bounds.scale || 1 : 1;
        const moved = {
          ...transform,
          x: Math.min(3, Math.max(-3, transform.x + pointerDelta.x / Math.max(1, bounds.dw * scale))),
          y: Math.min(3, Math.max(-3, transform.y + pointerDelta.y / Math.max(1, bounds.dh * scale))),
        };
        return [clip.id, clip.kind === 'webcam' ? clampEditedWebcamTransform(clip, moved, bounds.scale) : moved];
      }),
    );
    const values = Object.values(movedDrafts);
    const left = Math.min(...values.map(({ x }) => x));
    const top = Math.min(...values.map(({ y }) => y));
    const right = Math.max(...values.map(({ x, width }) => x + width));
    const bottom = Math.max(...values.map(({ y, height }) => y + height));
    const selected = new Set(gesture.entries.map(({ clip }) => clip.id));
    const otherTargets = activeClipsAt(options.composition(), options.currentTime() * 1_000).flatMap((clip) => {
      if (selected.has(clip.id) || !clip.enabled || !isTransformClip(clip) || transformCaptionFollowsCursor(clip))
        return [];
      const transform = options.transformFor(clip);
      return [{ id: clip.id, ...transform }];
    });
    const snap = computeCanvasAlignmentSnapping(
      { x: left, y: top, width: right - left, height: bottom - top },
      otherTargets,
      0.015,
    );
    const snapX = snap.x - left;
    const snapY = snap.y - top;
    drafts.value = Object.fromEntries(
      Object.entries(movedDrafts).map(([id, transform]) => [
        id,
        { ...transform, x: transform.x + snapX, y: transform.y + snapY },
      ]),
    );
    options.onGuides?.(snap.guides);
    return true;
  };
  const end = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const finished = gesture;
    const transforms = Object.entries(drafts.value).map(([id, transform]) => ({ id, transform }));
    clear();
    if (finished.target.hasPointerCapture?.(event.pointerId)) finished.target.releasePointerCapture?.(event.pointerId);
    if (finished.moved && transforms.length) options.onUpdate(transforms);
    return true;
  };

  watch(() => options.selectedClipIds().join('|'), clear);
  onUnmounted(clear);
  return {
    drafts,
    draftFor: (clipId: string) => drafts.value[clipId] ?? null,
    begin,
    move,
    end,
  };
}
