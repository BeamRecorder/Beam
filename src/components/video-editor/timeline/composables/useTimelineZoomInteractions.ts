import type { Ref } from 'vue';
import type { ZoomElement } from '../../zoom/zoom-types';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan, snapValue } from './timeline-snap';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';
import { shiftTimelineSelection } from '../../composition/timeline-edit-operations';

type ZoomPreview = Record<string, { startMs: number; endMs: number }>;
type ClipPreview = Record<string, { startMs: number; durationMs: number }>;
type TrimState = { ids: string[]; edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;

const MIN_ZOOM_DURATION_MS = 40;

export function useTimelineZoomInteractions(options: {
  props: TimelineTracksProps;
  emit: TimelineTracksEmits;
  tracksScrollRef: Ref<HTMLDivElement | null>;
  displayedPlayheadTime: Ref<number>;
  activeSnapTimeMs: Ref<number | null>;
  previewDurationMs: Ref<number | null>;
  zoomPreview: Ref<ZoomPreview>;
  clipPreview: Ref<ClipPreview>;
  activeTrimState: Ref<TrimState>;
  resolveMsPerPx: () => { baseDurationMs: number; width: number; msPerPx: number; visualScale: number };
  updateAutoScroll: (clientX: number) => void;
  stopAutoScroll: () => void;
}) {
  const beginZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
    if ((event.target as HTMLElement).closest('.trim-handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerStartX = event.clientX;
    const initialScrollLeft = options.tracksScrollRef.value?.scrollLeft ?? 0;
    const { baseDurationMs, width: baseRulerWidth, msPerPx, visualScale } = options.resolveMsPerPx();
    const explicitlySelected = options.props.selectedZoomIds?.includes(zoom.id) ?? false;
    const zoomIds =
      explicitlySelected && options.props.selectedZoomIds?.length ? options.props.selectedZoomIds : [zoom.id];
    const selectedClipIds = explicitlySelected ? [...(options.props.selectedClipIds ?? [])] : [];
    const clipGroups = new Set(
      options.props.composition.clips
        .filter((clip) => selectedClipIds.includes(clip.id) && clip.groupId)
        .map((clip) => clip.groupId),
    );
    const clipIds = [
      ...new Set([
        ...selectedClipIds,
        ...options.props.composition.clips
          .filter((clip) => clip.groupId && clipGroups.has(clip.groupId))
          .map((clip) => clip.id),
      ]),
    ];
    const selectedClips = options.props.composition.clips.filter((clip) => clipIds.includes(clip.id));
    const selectedZooms = options.props.zoomElements.filter((entry) => zoomIds.includes(entry.id));
    const selectionStartMs = Math.min(
      ...selectedClips.map((clip) => clip.timelineStartMs),
      ...selectedZooms.map((entry) => entry.startMs),
    );
    const selectionEndMs = Math.max(
      ...selectedClips.map((clip) => clip.timelineStartMs + clip.timelineDurationMs),
      ...selectedZooms.map((entry) => entry.endMs),
    );
    const selectionLengthMs = selectionEndMs - selectionStartMs;
    const isMultipleSelection = clipIds.length + zoomIds.length > 1;
    const snapTargets = collectSnapTargets({
      composition: options.props.composition,
      zoomElements: options.props.zoomElements,
      currentTime: options.displayedPlayheadTime.value,
      duration: options.props.duration,
      ignoreClipIds: clipIds,
      ignoreZoomIds: zoomIds,
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);
    let finalDeltaMs = 0;
    const applyMove = (next: PointerEvent) => {
      options.updateAutoScroll(next.clientX);
      const currentScrollLeft = options.tracksScrollRef.value?.scrollLeft ?? 0;
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft) * visualScale;
      const proposedDeltaMs = Math.max(-selectionStartMs, Math.round(deltaPx * msPerPx));
      const proposedStartMs = selectionStartMs + proposedDeltaMs;
      const snap =
        options.props.isSnappingEnabled !== false
          ? snapSpan(proposedStartMs, selectionLengthMs, snapTargets, snapThresholdMs)
          : null;
      finalDeltaMs = snap ? Math.max(-selectionStartMs, snap.snappedStartMs - selectionStartMs) : proposedDeltaMs;
      options.activeSnapTimeMs.value = snap?.targetMs ?? null;
      const preview = shiftTimelineSelection({
        composition: options.props.composition,
        zoomElements: options.props.zoomElements,
        selection: { clipIds, zoomIds },
        deltaMs: finalDeltaMs,
      });
      finalDeltaMs = preview.deltaMs;
      options.previewDurationMs.value =
        selectionEndMs + finalDeltaMs > baseDurationMs ? selectionEndMs + finalDeltaMs : null;
      options.clipPreview.value = Object.fromEntries(
        preview.composition.clips
          .filter((clip) => clipIds.includes(clip.id))
          .map((clip) => [clip.id, { startMs: clip.timelineStartMs, durationMs: clip.timelineDurationMs }]),
      );
      options.zoomPreview.value = Object.fromEntries(
        preview.zoomElements
          .filter((entry) => zoomIds.includes(entry.id))
          .map((entry) => [entry.id, { startMs: entry.startMs, endMs: entry.endMs }]),
      );
      options.emit('preview:composition', preview.composition);
    };
    const updates = createAnimationFrameCoalescer(applyMove);
    const move = updates.schedule;
    const cleanup = () => {
      options.stopAutoScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      for (const id of clipIds) delete options.clipPreview.value[id];
      for (const id of zoomIds) delete options.zoomPreview.value[id];
      options.previewDurationMs.value = null;
      options.activeSnapTimeMs.value = null;
      options.emit('preview:composition', null);
    };
    const end = () => {
      updates.flush();
      cleanup();
      if (finalDeltaMs === 0) return;
      if (isMultipleSelection) options.emit('move:selection', { clipIds, zoomIds, deltaMs: finalDeltaMs });
      else
        options.emit('move:zoom', {
          id: zoom.id,
          startMs: zoom.startMs + finalDeltaMs,
          endMs: zoom.endMs + finalDeltaMs,
        });
    };
    const cancel = () => {
      updates.cancel();
      cleanup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  const beginZoomTrim = (event: PointerEvent, zoom: ZoomElement, edge: 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();
    const pointerStartX = event.clientX;
    const initialScrollLeft = options.tracksScrollRef.value?.scrollLeft ?? 0;
    const { baseDurationMs, width: baseRulerWidth, msPerPx, visualScale } = options.resolveMsPerPx();
    let finalTimeMs = edge === 'start' ? zoom.startMs : zoom.endMs;
    const snapTargets = collectSnapTargets({
      composition: options.props.composition,
      zoomElements: options.props.zoomElements,
      currentTime: options.displayedPlayheadTime.value,
      duration: options.props.duration,
      ignoreZoomIds: [zoom.id],
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);
    const applyMove = (next: PointerEvent) => {
      options.updateAutoScroll(next.clientX);
      const currentScrollLeft = options.tracksScrollRef.value?.scrollLeft ?? 0;
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft) * visualScale;
      const raw = (edge === 'start' ? zoom.startMs : zoom.endMs) + Math.round(deltaPx * msPerPx);
      let proposed =
        edge === 'start'
          ? Math.max(0, Math.min(zoom.endMs - MIN_ZOOM_DURATION_MS, raw))
          : Math.max(zoom.startMs + MIN_ZOOM_DURATION_MS, raw);
      const snap = options.props.isSnappingEnabled !== false ? snapValue(proposed, snapTargets, snapThresholdMs) : null;
      if (snap) {
        proposed =
          edge === 'start'
            ? Math.max(0, Math.min(zoom.endMs - MIN_ZOOM_DURATION_MS, snap.snappedValueMs))
            : Math.max(zoom.startMs + MIN_ZOOM_DURATION_MS, snap.snappedValueMs);
      }
      finalTimeMs = proposed;
      options.activeSnapTimeMs.value = snap?.targetMs ?? null;
      options.previewDurationMs.value = edge === 'end' && finalTimeMs > baseDurationMs ? finalTimeMs : null;
      options.zoomPreview.value = {
        ...options.zoomPreview.value,
        [zoom.id]: {
          startMs: edge === 'start' ? finalTimeMs : zoom.startMs,
          endMs: edge === 'end' ? finalTimeMs : zoom.endMs,
        },
      };
      options.activeTrimState.value = {
        ids: [zoom.id],
        edge,
        durationMs: edge === 'start' ? zoom.endMs - finalTimeMs : finalTimeMs - zoom.startMs,
      };
    };
    const updates = createAnimationFrameCoalescer(applyMove);
    const move = updates.schedule;
    const cleanup = () => {
      options.stopAutoScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      const next = { ...options.zoomPreview.value };
      delete next[zoom.id];
      options.zoomPreview.value = next;
      options.activeTrimState.value = null;
      options.previewDurationMs.value = null;
      options.activeSnapTimeMs.value = null;
    };
    const end = () => {
      updates.flush();
      cleanup();
      const original = edge === 'start' ? zoom.startMs : zoom.endMs;
      if (finalTimeMs !== original) options.emit('trim:zoom', { id: zoom.id, edge, timeMs: finalTimeMs });
    };
    const cancel = () => {
      updates.cancel();
      cleanup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  return { beginZoomMove, beginZoomTrim };
}
