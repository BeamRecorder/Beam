import { computed, ref } from 'vue';
import { Camera, Image as ImageIcon, Video } from '@lucide/vue';
import type { ZoomElement } from '../../zoom/zoom-types';
import {
  isAudioClip,
  isCaptionClip,
  isKeyboardCaptionClip,
  isTextCaptionClip,
  isVisualClip,
  type AudioClip,
  type Clip,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan, snapValue } from './timeline-snap';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import { useTimelineViewport } from './useTimelineViewport';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';
export type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export const DEFAULT_ZOOM_DURATION_MS = 1_200;
export const DEFAULT_CAPTION_DURATION_MS = 2_000;
export const MIN_DURATION_MS = 40;

export function useTimelineTracks(props: TimelineTracksProps, emit: TimelineTracksEmits, t: (key: string) => string) {
  const durationMs = computed(() => Math.max(1, Math.round(props.duration * 1_000)));
  const orderedClips = computed(() => [...props.composition.clips].sort((left, right) => left.order - right.order));
  const baseVisualClips = computed(() => orderedClips.value.filter(isVisualClip));
  const visualOrderPreview = ref<string[] | null>(null);
  const visualClips = computed(() => {
    const clips = baseVisualClips.value;
    const preview = visualOrderPreview.value;
    if (!preview) return clips;
    const byId = new Map(clips.map((clip) => [clip.id, clip]));
    return [
      ...preview.flatMap((id) => {
        const clip = byId.get(id);
        return clip ? [clip] : [];
      }),
      ...clips.filter((clip) => !preview.includes(clip.id)),
    ];
  });
  const captionClips = computed(() => orderedClips.value.filter(isCaptionClip));
  const keyboardCaptionClips = computed(() => orderedClips.value.filter(isKeyboardCaptionClip));
  const textCaptionClips = computed(() => orderedClips.value.filter(isTextCaptionClip));
  const systemAudioClips = computed(() =>
    orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'system'),
  );
  const microphoneClips = computed(() =>
    orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'microphone'),
  );
  const importedAudioClips = computed(() =>
    orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'imported'),
  );
  const assets = computed(() => new Map(props.composition.assets.map((asset: MediaAsset) => [asset.id, asset])));
  const assetFor = (clip: Clip) => (isCaptionClip(clip) ? null : (assets.value.get(clip.assetId) ?? null));

  const activeSnapTimeMs = ref<number | null>(null);
  const {
    tracksScrollRef,
    tracksViewportRef,
    ticksAreaRef,
    rulerWidth,
    tracksWidthStyle,
    scrubPreviewTime,
    displayedPlayheadTime,
    playheadStyle,
    rulerLabelStep,
    rulerTickStep,
    rulerSeconds,
    rulerMarkerStyle,
    isRulerLabel,
    formatRulerLabel,
    audioWaveforms,
    audioWaveformErrors,
    audioWaveformStatus,
    thumbnailSlots,
    onScroll,
    percentageStyle,
    timeAt,
    centeredStartAt,
    beginScrub,
    handleWheel,
  } = useTimelineViewport(props, emit, durationMs, activeSnapTimeMs);

  const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
  const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
  const activeTrimState = ref<{ ids: string[]; edge: 'start' | 'end'; durationMs: number } | null>(null);
  const movingClipIds = ref<string[]>([]);
  const displayedClip = (clip: Clip): Clip => {
    const preview = clipPreview.value[clip.id];
    return preview ? { ...clip, timelineStartMs: preview.startMs, timelineDurationMs: preview.durationMs } : clip;
  };
  const displayedZoom = (zoom: ZoomElement): ZoomElement => {
    const preview = zoomPreview.value[zoom.id];
    return preview ? { ...zoom, startMs: preview.startMs, endMs: preview.endMs } : zoom;
  };
  const trimStateFor = (id: string) => {
    const state = activeTrimState.value;
    return state?.ids.includes(id) ? { edge: state.edge, durationMs: state.durationMs } : null;
  };
  const linkedIdsFor = (clip: Clip) =>
    clip.groupId
      ? props.composition.clips.filter((entry: Clip) => entry.groupId === clip.groupId).map((entry: Clip) => entry.id)
      : [clip.id];
  const previewLinked = (ids: string[], startMs: number, duration: number) => {
    const next = { ...clipPreview.value };
    for (const id of ids) next[id] = { startMs, durationMs: duration };
    clipPreview.value = next;
  };
  const clearLinkedPreview = (ids: string[]) => {
    const next = { ...clipPreview.value };
    for (const id of ids) delete next[id];
    clipPreview.value = next;
  };

  const beginClipMove = (event: PointerEvent, clip: Clip) => {
    if ((event.target as HTMLElement).closest('.trim-handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = linkedIdsFor(clip);
    movingClipIds.value = ids;
    const pointerStartMs = timeAt(event.clientX);
    const originalStartMs = clip.timelineStartMs;
    const clipLengthMs = clip.timelineDurationMs;
    const maxStartMs = Math.max(0, durationMs.value - clipLengthMs);

    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreClipIds: ids,
    });
    const snapThresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value);

    let finalStartMs = originalStartMs;
    const applyMove = (next: PointerEvent) => {
      const proposedStartMs = Math.max(
        0,
        Math.min(maxStartMs, originalStartMs + timeAt(next.clientX) - pointerStartMs),
      );
      const snap =
        props.isSnappingEnabled !== false
          ? snapSpan(proposedStartMs, clipLengthMs, snapTargets, snapThresholdMs)
          : null;
      if (snap) {
        finalStartMs = Math.max(0, Math.min(maxStartMs, snap.snappedStartMs));
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        finalStartMs = proposedStartMs;
        activeSnapTimeMs.value = null;
      }
      previewLinked(ids, finalStartMs, clipLengthMs);
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      clearLinkedPreview(ids);
      movingClipIds.value = [];
      activeSnapTimeMs.value = null;
      if (finalStartMs !== originalStartMs) emit('move:clip', { id: clip.id, startMs: finalStartMs });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };
  const beginClipTrim = (event: PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();
    const ids = linkedIdsFor(clip);
    const originalStartMs = clip.timelineStartMs;
    const originalEndMs = clip.timelineStartMs + clip.timelineDurationMs;
    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreClipIds: ids,
    });
    const snapThresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value);

    let finalTimeMs = edge === 'start' ? originalStartMs : originalEndMs;
    const applyMove = (next: PointerEvent) => {
      const raw = timeAt(next.clientX);
      let proposedTimeMs =
        edge === 'start'
          ? Math.max(0, Math.min(originalEndMs - MIN_DURATION_MS, raw))
          : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(durationMs.value, raw));

      const snap = props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
      if (snap) {
        proposedTimeMs =
          edge === 'start'
            ? Math.max(0, Math.min(originalEndMs - MIN_DURATION_MS, snap.snappedValueMs))
            : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(durationMs.value, snap.snappedValueMs));
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        activeSnapTimeMs.value = null;
      }

      finalTimeMs = proposedTimeMs;
      const startMs = edge === 'start' ? finalTimeMs : originalStartMs;
      const endMs = edge === 'end' ? finalTimeMs : originalEndMs;
      previewLinked(ids, startMs, endMs - startMs);
      activeTrimState.value = { ids, edge, durationMs: endMs - startMs };
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      clearLinkedPreview(ids);
      activeTrimState.value = null;
      activeSnapTimeMs.value = null;
      const original = edge === 'start' ? originalStartMs : originalEndMs;
      if (finalTimeMs !== original) emit('trim:clip', { id: clip.id, edge, timeMs: finalTimeMs });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  const beginZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
    if ((event.target as HTMLElement).closest('.trim-handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerStartMs = timeAt(event.clientX);
    const lengthMs = zoom.endMs - zoom.startMs;
    const maxStartMs = Math.max(0, durationMs.value - lengthMs);
    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreZoomIds: [zoom.id],
    });
    const snapThresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value);

    let finalStartMs = zoom.startMs;
    const applyMove = (next: PointerEvent) => {
      const proposedStartMs = Math.max(0, Math.min(maxStartMs, zoom.startMs + timeAt(next.clientX) - pointerStartMs));
      const snap =
        props.isSnappingEnabled !== false ? snapSpan(proposedStartMs, lengthMs, snapTargets, snapThresholdMs) : null;
      if (snap) {
        finalStartMs = Math.max(0, Math.min(maxStartMs, snap.snappedStartMs));
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        finalStartMs = proposedStartMs;
        activeSnapTimeMs.value = null;
      }
      zoomPreview.value = {
        ...zoomPreview.value,
        [zoom.id]: { startMs: finalStartMs, endMs: finalStartMs + lengthMs },
      };
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      const next = { ...zoomPreview.value };
      delete next[zoom.id];
      zoomPreview.value = next;
      activeSnapTimeMs.value = null;
      if (finalStartMs !== zoom.startMs)
        emit('move:zoom', { id: zoom.id, startMs: finalStartMs, endMs: finalStartMs + lengthMs });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  const beginZoomTrim = (event: PointerEvent, zoom: ZoomElement, edge: 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();
    let finalTimeMs = edge === 'start' ? zoom.startMs : zoom.endMs;
    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreZoomIds: [zoom.id],
    });
    const snapThresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value);

    const applyMove = (next: PointerEvent) => {
      const raw = timeAt(next.clientX);
      let proposedTimeMs =
        edge === 'start'
          ? Math.max(0, Math.min(zoom.endMs - MIN_DURATION_MS, raw))
          : Math.max(zoom.startMs + MIN_DURATION_MS, Math.min(durationMs.value, raw));

      const snap = props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
      if (snap) {
        proposedTimeMs =
          edge === 'start'
            ? Math.max(0, Math.min(zoom.endMs - MIN_DURATION_MS, snap.snappedValueMs))
            : Math.max(zoom.startMs + MIN_DURATION_MS, Math.min(durationMs.value, snap.snappedValueMs));
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        activeSnapTimeMs.value = null;
      }

      finalTimeMs = proposedTimeMs;
      zoomPreview.value = {
        ...zoomPreview.value,
        [zoom.id]: {
          startMs: edge === 'start' ? finalTimeMs : zoom.startMs,
          endMs: edge === 'end' ? finalTimeMs : zoom.endMs,
        },
      };
      activeTrimState.value = {
        ids: [zoom.id],
        edge,
        durationMs: (edge === 'end' ? finalTimeMs : zoom.endMs) - (edge === 'start' ? finalTimeMs : zoom.startMs),
      };
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      const next = { ...zoomPreview.value };
      delete next[zoom.id];
      zoomPreview.value = next;
      activeTrimState.value = null;
      activeSnapTimeMs.value = null;
      const original = edge === 'start' ? zoom.startMs : zoom.endMs;
      if (finalTimeMs !== original) emit('trim:zoom', { id: zoom.id, edge, timeMs: finalTimeMs });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };

  const hoverZoomTimeMs = ref<number | null>(null);
  const hoverCaptionTimeMs = ref<number | null>(null);
  const occupied = (startMs: number, endMs: number, intervals: Array<{ startMs: number; endMs: number }>) =>
    intervals.some((interval) => interval.startMs < endMs && interval.endMs > startMs);
  const hoverAt = (event: MouseEvent, kind: 'zoom' | 'caption') => {
    if (kind === 'zoom') {
      const startMs = centeredStartAt(event.clientX, DEFAULT_ZOOM_DURATION_MS);
      hoverZoomTimeMs.value = occupied(startMs, startMs + DEFAULT_ZOOM_DURATION_MS, props.zoomElements)
        ? null
        : startMs;
      return;
    }
    const startMs = centeredStartAt(event.clientX, DEFAULT_CAPTION_DURATION_MS);
    const captions = textCaptionClips.value.map((clip) => ({
      startMs: clip.timelineStartMs,
      endMs: clip.timelineStartMs + clip.timelineDurationMs,
    }));
    hoverCaptionTimeMs.value = occupied(startMs, startMs + DEFAULT_CAPTION_DURATION_MS, captions) ? null : startMs;
  };
  const leaveTrack = (kind: 'zoom' | 'caption') => {
    if (kind === 'zoom') hoverZoomTimeMs.value = null;
    else hoverCaptionTimeMs.value = null;
  };
  const addAt = (event: MouseEvent, kind: 'zoom' | 'caption') => {
    event.preventDefault();
    event.stopPropagation();
    if (kind === 'zoom') {
      const startMs = centeredStartAt(event.clientX, DEFAULT_ZOOM_DURATION_MS);
      if (!occupied(startMs, startMs + DEFAULT_ZOOM_DURATION_MS, props.zoomElements)) emit('add:zoom', startMs);
      return;
    }
    const startMs = centeredStartAt(event.clientX, DEFAULT_CAPTION_DURATION_MS);
    const captions = textCaptionClips.value.map((clip) => ({
      startMs: clip.timelineStartMs,
      endMs: clip.timelineStartMs + clip.timelineDurationMs,
    }));
    if (!occupied(startMs, startMs + DEFAULT_CAPTION_DURATION_MS, captions)) emit('add:caption', startMs);
  };

  const toggleGroup = (clips: Clip[]) => {
    const enabled = !clips.some((clip) => clip.enabled);
    for (const clip of clips) if (clip.enabled !== enabled) emit('toggle:clip', clip.id);
  };
  const iconForVisual = (clip: VisualClip) =>
    clip.kind === 'image' ? ImageIcon : clip.kind === 'webcam' ? Camera : Video;
  const labelForVisual = (clip: VisualClip) =>
    clip.kind === 'screen' ? t('video') : clip.kind === 'webcam' ? t('webcam') : clip.name;
  const zoomScale = (depth: number) => [1.25, 1.5, 1.8, 2.2, 3.5, 5][Math.max(0, Math.min(5, depth - 1))] ?? 1.25;

  const draggedClipId = ref<string | null>(null);
  const beginReorder = (event: PointerEvent, clipId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const initialOrder = baseVisualClips.value.map((clip) => clip.id);
    const initialIndex = initialOrder.indexOf(clipId);
    if (initialIndex < 0) return;
    draggedClipId.value = clipId;
    visualOrderPreview.value = [...initialOrder];

    const applyMove = (next: PointerEvent) => {
      const row = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>('.visual-track');
      const targetId = row?.dataset.clipId;
      if (!targetId || targetId === clipId) return;
      const order = [...(visualOrderPreview.value ?? initialOrder)];
      const from = order.indexOf(clipId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return;
      order.splice(from, 1);
      order.splice(to, 0, clipId);
      visualOrderPreview.value = order;
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const finalIndex = visualOrderPreview.value?.indexOf(clipId) ?? initialIndex;
      if (finalIndex !== initialIndex) emit('reorder:clip', { id: clipId, targetIndex: finalIndex });
      requestAnimationFrame(() => {
        visualOrderPreview.value = null;
        draggedClipId.value = null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  return {
    durationMs,
    orderedClips,
    baseVisualClips,
    visualOrderPreview,
    visualClips,
    captionClips,
    keyboardCaptionClips,
    textCaptionClips,
    systemAudioClips,
    microphoneClips,
    importedAudioClips,
    assets,
    assetFor,
    audioWaveforms,
    audioWaveformErrors,
    audioWaveformStatus,
    tracksScrollRef,
    tracksViewportRef,
    ticksAreaRef,
    rulerWidth,
    tracksWidthStyle,
    scrubPreviewTime,
    displayedPlayheadTime,
    playheadStyle,
    rulerLabelStep,
    rulerTickStep,
    rulerSeconds,
    rulerMarkerStyle,
    isRulerLabel,
    formatRulerLabel,
    thumbnailSlots,
    onScroll,
    percentageStyle,
    timeAt,
    centeredStartAt,
    beginScrub,
    handleWheel,
    clipPreview,
    zoomPreview,
    activeTrimState,
    movingClipIds,
    activeSnapTimeMs,
    displayedClip,
    displayedZoom,
    trimStateFor,
    linkedIdsFor,
    beginClipMove,
    beginClipTrim,
    beginZoomMove,
    beginZoomTrim,
    hoverZoomTimeMs,
    hoverCaptionTimeMs,
    hoverAt,
    leaveTrack,
    addAt,
    toggleGroup,
    iconForVisual,
    labelForVisual,
    zoomScale,
    draggedClipId,
    beginReorder,
    DEFAULT_ZOOM_DURATION_MS,
    DEFAULT_CAPTION_DURATION_MS,
  };
}
