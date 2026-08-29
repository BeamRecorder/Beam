import type { Ref } from 'vue';
import type { ZoomElement } from '../../zoom/zoom-types';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan, snapValue } from './timeline-snap';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

type ZoomPreview = Record<string, { startMs: number; endMs: number }>;
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
    const lengthMs = zoom.endMs - zoom.startMs;
    const snapTargets = collectSnapTargets({
      composition: options.props.composition,
      zoomElements: options.props.zoomElements,
      currentTime: options.displayedPlayheadTime.value,
      duration: options.props.duration,
      ignoreZoomIds: [zoom.id],
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);
    let finalStartMs = zoom.startMs;
    const applyMove = (next: PointerEvent) => {
      options.updateAutoScroll(next.clientX);
      const currentScrollLeft = options.tracksScrollRef.value?.scrollLeft ?? 0;
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft) * visualScale;
      const proposedStartMs = Math.max(0, zoom.startMs + Math.round(deltaPx * msPerPx));
      const snap =
        options.props.isSnappingEnabled !== false
          ? snapSpan(proposedStartMs, lengthMs, snapTargets, snapThresholdMs)
          : null;
      finalStartMs = snap ? Math.max(0, snap.snappedStartMs) : proposedStartMs;
      options.activeSnapTimeMs.value = snap?.targetMs ?? null;
      options.previewDurationMs.value = finalStartMs + lengthMs > baseDurationMs ? finalStartMs + lengthMs : null;
      options.zoomPreview.value = {
        ...options.zoomPreview.value,
        [zoom.id]: { startMs: finalStartMs, endMs: finalStartMs + lengthMs },
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
      options.previewDurationMs.value = null;
      options.activeSnapTimeMs.value = null;
    };
    const end = () => {
      updates.flush();
      cleanup();
      if (finalStartMs !== zoom.startMs)
        options.emit('move:zoom', { id: zoom.id, startMs: finalStartMs, endMs: finalStartMs + lengthMs });
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
