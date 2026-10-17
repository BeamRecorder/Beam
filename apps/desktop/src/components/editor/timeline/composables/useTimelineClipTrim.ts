import { selectionHasLocks } from '@beam/engine/composition/timeline-locks';
import { markRaw, nextTick, onScopeDispose, toRaw } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import { MIN_CLIP_DURATION_MS } from '@beam/engine/commands/clip-composition-validation';
import { clipTrimBounds } from '@beam/engine/commands/trim-clip';
import { prepareClipTrimPreview } from '@beam/engine/composition/clip-trim-preview';
import { calculateSnapThresholdMs, collectSnapTargets, snapValue } from './timeline-snap';
import type { TimelineClipTrimOptions } from './timeline-clip-trim-types';

export function useTimelineClipTrim(options: TimelineClipTrimOptions) {
  let cancelTrim: (() => void) | null = null;
  onScopeDispose(() => cancelTrim?.());
  const beginClipTrim = (event: PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    if (
      event.button > 0 ||
      selectionHasLocks(options.props.composition, [], {
        clipIds: [clip.id],
        zoomIds: [],
      })
    )
      return;
    cancelTrim?.();
    event.preventDefault();
    event.stopPropagation();
    const ids = options.linkedIdsFor(clip);
    const pointerStartX = event.clientX;
    const { baseDurationMs, width: baseRulerWidth, msPerPx } = options.resolveMsPerPx();
    const originalStartMs = clip.timelineStartMs;
    const originalEndMs = clip.timelineStartMs + clip.timelineDurationMs;
    const composition = toRaw(options.props.composition);
    const bounds = clipTrimBounds(composition, clip.id, edge);
    const previewTrim = prepareClipTrimPreview(composition, clip.id, edge);
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
    let previewTimeMs: number | null = null;
    let pointer: PointerEvent = event;
    let autoScrollQueued = false;
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
      if (previewTimeMs !== finalTimeMs) {
        previewTimeMs = finalTimeMs;
        const preview = previewTrim(finalTimeMs);
        const nextPreview = { ...options.clipPreview.value };
        for (const id of previewedIds) delete nextPreview[id];
        previewedIds = preview.clips.map((entry) => entry.id);
        for (const entry of preview.clips) {
          nextPreview[entry.id] = {
            startMs: entry.timelineStartMs,
            durationMs: entry.timelineDurationMs,
          };
        }
        options.clipPreview.value = nextPreview;
        options.previewDurationMs.value = preview.durationMs;
        options.emit('preview:composition', markRaw(preview.composition));
      }
      options.activeTrimState.value = {
        ids,
        edge,
        durationMs: endMs - startMs,
        atLimit: raw <= bounds.minMs || raw >= bounds.maxMs,
      };
      pointer = next;
      if (!autoScrollQueued) {
        autoScrollQueued = true;
        void nextTick(() => {
          autoScrollQueued = false;
          if (!trimActive) return;
          options.updateAutoScroll(pointer.clientX, (scrollDeltaPx) => {
            autoScrollDeltaPx += scrollDeltaPx;
            applyMove(pointer);
          });
        });
      }
    };
    // Publish geometry before the shared canvas frame is scheduled. An extra RAF
    // here makes the clip artwork trail its DOM handles by an entire refresh.
    const move = applyMove;
    const cleanup = () => {
      trimActive = false;
      cancelTrim = null;
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
      cleanup();
      const original = edge === 'start' ? originalStartMs : originalEndMs;
      if (finalTimeMs !== original) options.emit('trim:clip', { id: clip.id, edge, timeMs: finalTimeMs });
    };
    const cancel = () => {
      cleanup();
    };
    cancelTrim = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };
  return { beginClipTrim };
}
