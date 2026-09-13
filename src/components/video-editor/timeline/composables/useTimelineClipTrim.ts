import { selectionHasLocks } from '../../composition/timeline-locks';
import { nextTick, type Ref } from 'vue';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import { MIN_CLIP_DURATION_MS } from '../../composition/engine/clip-composition-validation';
import { clipTrimBounds } from '../../composition/engine/trim-clip';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import { calculateSnapThresholdMs, collectSnapTargets, snapValue } from './timeline-snap';
import { previewClipTrim } from './timeline-composition-preview';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

type TrimState = { ids: string[]; edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
type ClipPreview = Record<string, { startMs: number; durationMs: number }>;

export function useTimelineClipTrim(options: {
  props: TimelineTracksProps;
  emit: TimelineTracksEmits;
  tracksScrollRef: Ref<HTMLDivElement | null>;
  displayedPlayheadTime: Ref<number>;
  activeSnapTimeMs: Ref<number | null>;
  previewDurationMs: Ref<number | null>;
  clipPreview: Ref<ClipPreview>;
  activeTrimState: Ref<TrimState>;
  linkedIdsFor: (clip: Clip) => string[];
  clearLinkedPreview: (ids: string[]) => void;
  resolveMsPerPx: () => {
    baseDurationMs: number;
    width: number;
    msPerPx: number;
    visualScale: number;
  };
  updateAutoScroll: (clientX: number, onScroll?: ((deltaPx: number) => void) | null) => void;
  stopAutoScroll: () => void;
}) {
  const beginClipTrim = (event: PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    if (event.button > 0 || selectionHasLocks(options.props.composition, [], { clipIds: [clip.id], zoomIds: [] }))
      return;
    event.preventDefault();
    event.stopPropagation();
    const ids = options.linkedIdsFor(clip);
    const pointerStartX = event.clientX;
    const { baseDurationMs, width: baseRulerWidth, msPerPx } = options.resolveMsPerPx();
    const originalStartMs = clip.timelineStartMs;
    const originalEndMs = clip.timelineStartMs + clip.timelineDurationMs;
    const bounds = clipTrimBounds(options.props.composition, clip.id, edge);
    const snapTargets = collectSnapTargets({
      composition: options.props.composition,
      zoomElements: options.props.zoomElements,
      currentTime: options.displayedPlayheadTime.value,
      duration: options.props.duration,
      ignoreClipIds: ids,
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);
    let finalTimeMs = edge === 'start' ? originalStartMs : originalEndMs;
    let previewedIds = ids;
    let trimActive = true;
    let autoScrollDeltaPx = 0;
    options.activeTrimState.value = {
      ids,
      edge,
      durationMs: clip.timelineDurationMs,
      atLimit: false,
    };

    const applyMove = (next: PointerEvent) => {
      const scrollBounds = options.tracksScrollRef.value?.getBoundingClientRect();
      const visibleClientX =
        scrollBounds && scrollBounds.width > 0
          ? Math.max(scrollBounds.left, Math.min(scrollBounds.right, next.clientX))
          : next.clientX;
      const deltaPx = visibleClientX - pointerStartX + autoScrollDeltaPx;
      const raw = (edge === 'start' ? originalStartMs : originalEndMs) + Math.round(deltaPx * msPerPx);
      let proposedTimeMs =
        edge === 'start'
          ? Math.max(bounds.minMs, Math.min(originalEndMs - MIN_CLIP_DURATION_MS, raw))
          : Math.max(originalStartMs + MIN_CLIP_DURATION_MS, Math.min(bounds.maxMs, raw));
      const snap =
        options.props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
      if (snap) {
        proposedTimeMs =
          edge === 'start'
            ? Math.max(bounds.minMs, Math.min(originalEndMs - MIN_CLIP_DURATION_MS, snap.snappedValueMs))
            : Math.max(originalStartMs + MIN_CLIP_DURATION_MS, Math.min(bounds.maxMs, snap.snappedValueMs));
        options.activeSnapTimeMs.value = snap.targetMs;
      } else {
        options.activeSnapTimeMs.value = null;
      }

      finalTimeMs = proposedTimeMs;
      const startMs = edge === 'start' ? finalTimeMs : originalStartMs;
      const endMs = edge === 'end' ? finalTimeMs : originalEndMs;
      const previewComposition = previewClipTrim(options.props.composition, clip, edge, finalTimeMs);
      options.clearLinkedPreview(previewedIds);
      previewedIds = changedTimingIds(options.props.composition, previewComposition);
      const nextPreview = { ...options.clipPreview.value };
      for (const entry of previewComposition.clips) {
        if (previewedIds.includes(entry.id)) {
          nextPreview[entry.id] = { startMs: entry.timelineStartMs, durationMs: entry.timelineDurationMs };
        }
      }
      options.clipPreview.value = nextPreview;
      const previewEndMs = previewComposition.clips.reduce(
        (maximum, entry) => Math.max(maximum, entry.timelineStartMs + entry.timelineDurationMs),
        endMs,
      );
      options.previewDurationMs.value = previewEndMs;
      options.emit('preview:composition', previewComposition);
      options.activeTrimState.value = {
        ids,
        edge,
        durationMs: endMs - startMs,
        atLimit: raw <= bounds.minMs || raw >= bounds.maxMs,
      };
      void nextTick(() => {
        if (!trimActive) return;
        options.updateAutoScroll(next.clientX, (scrollDeltaPx) => {
          autoScrollDeltaPx += scrollDeltaPx;
          applyMove(next);
        });
      });
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const cleanup = () => {
      trimActive = false;
      options.stopAutoScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      options.clearLinkedPreview(previewedIds);
      options.previewDurationMs.value = null;
      options.activeTrimState.value = null;
      options.activeSnapTimeMs.value = null;
      options.emit('preview:composition', null);
    };
    const end = () => {
      moveUpdates.flush();
      cleanup();
      const original = edge === 'start' ? originalStartMs : originalEndMs;
      if (finalTimeMs !== original) options.emit('trim:clip', { id: clip.id, edge, timeMs: finalTimeMs });
    };
    const cancel = () => {
      moveUpdates.cancel();
      cleanup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };
  return { beginClipTrim };
}

const changedTimingIds = (before: ClipComposition, after: ClipComposition) =>
  after.clips.flatMap((clip) => {
    const original = before.clips.find((candidate) => candidate.id === clip.id);
    return original &&
      (original.timelineStartMs !== clip.timelineStartMs || original.timelineDurationMs !== clip.timelineDurationMs)
      ? [clip.id]
      : [];
  });
