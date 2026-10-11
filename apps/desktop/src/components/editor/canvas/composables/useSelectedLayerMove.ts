import { constrainPointerDelta } from '~/shortcuts/pointer-modifiers';
import { matchesGesture } from '~/shortcuts/action-bindings';
import { activeClipsAt } from '@beam/runtime/shared/index';
import {
  isBlurClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type NormalizedTransform,
} from '@beam/engine/shared/composition-types';
import { onUnmounted, shallowRef, watch } from 'vue';
import { transformCaptionFollowsCursor, type ClipTransformUpdate, type TransformClip } from '../editor-canvas-types';
import type { CanvasRect } from './layer-transform-geometry';
import type { VideoWindowBounds } from './useCameraZoom';
import { perspectivePointerDelta } from './layer-selection-presentation';
import { editableVisualClipTransform } from '@beam/engine/composition/visual-framing';
import { clampEditedWebcamTransform, editableWebcamTransform } from './webcam-transform-editing';
import type { AlignmentGuide } from './canvas-alignment';
import { snapDisplayedLayerTranslation } from './layer-alignment';

interface SelectedLayerMoveOptions {
  composition: () => Parameters<typeof activeClipsAt>[0];
  currentTime: () => number;
  selectedClipIds: () => readonly string[];
  clipIdAt: (event: PointerEvent, canvas: HTMLCanvasElement | null, includeScreen?: boolean) => string | null;
  transformFor: (clip: TransformClip) => NormalizedTransform;
  boundsFor: (clip: TransformClip) => VideoWindowBounds | null;
  displayLayoutFor: (clip: TransformClip, transform: NormalizedTransform) => CanvasRect | null;
  alignmentViewport: () => VideoWindowBounds | null;
  zoomScale: () => number;
  onDuplicate?: (transforms: ClipTransformUpdate[]) => void;
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
  duplicate: boolean;
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
      return [
        {
          clip,
          transform,
          bounds,
          layout: options.displayLayoutFor(clip, transform),
        },
      ];
    });
    if (!entries.some(({ clip }) => clip.id === hitId)) return false;
    event.preventDefault();
    event.stopPropagation();
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      duplicate: !!options.onDuplicate && matchesGesture(event, 'duplicate'),
      target: event.currentTarget as HTMLElement,
      entries,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    return true;
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const delta = constrainPointerDelta(
      {
        x: (event.clientX - gesture.startX) / options.zoomScale(),
        y: (event.clientY - gesture.startY) / options.zoomScale(),
      },
      event,
    );
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
    const layouts = gesture.entries.flatMap(({ clip }) => {
      const layout = options.displayLayoutFor(clip, movedDrafts[clip.id]!);
      return layout ? [layout] : [];
    });
    const selected = new Set(gesture.entries.map(({ clip }) => clip.id));
    const otherTargets = activeClipsAt(options.composition(), options.currentTime() * 1_000).flatMap((clip) => {
      if (selected.has(clip.id) || !clip.enabled || !isTransformClip(clip) || transformCaptionFollowsCursor(clip))
        return [];
      const layout = options.displayLayoutFor(clip, options.transformFor(clip));
      return layout ? [layout] : [];
    });
    const snap = matchesGesture(event, 'ignoreSnapping')
      ? { x: 0, y: 0, guides: [] }
      : snapDisplayedLayerTranslation(layouts, otherTargets, options.alignmentViewport());
    if (matchesGesture(event, 'constrain')) {
      if (delta.y === 0) snap.y = 0;
      else snap.x = 0;
    }
    drafts.value = Object.fromEntries(
      gesture.entries.map(({ clip, bounds }) => {
        const transform = movedDrafts[clip.id]!;
        const scale = usesGlobalCamera(clip) ? bounds.scale || 1 : 1;
        return [
          clip.id,
          {
            ...transform,
            x: transform.x + snap.x / Math.max(1, bounds.dw * scale),
            y: transform.y + snap.y / Math.max(1, bounds.dh * scale),
          },
        ];
      }),
    );
    options.onGuides?.(snap.guides);
    return true;
  };
  const end = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const finished = gesture;
    const transforms = Object.entries(drafts.value).map(([id, transform]) => ({
      id,
      transform,
    }));
    clear();
    if (finished.target.hasPointerCapture?.(event.pointerId)) finished.target.releasePointerCapture?.(event.pointerId);
    if (finished.moved && transforms.length) {
      if (finished.duplicate) options.onDuplicate?.(transforms);
      else options.onUpdate(transforms);
    }
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
