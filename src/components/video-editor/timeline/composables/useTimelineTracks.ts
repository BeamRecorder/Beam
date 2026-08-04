import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Camera, Image as ImageIcon, Video } from '@lucide/vue';
import type { ExportProgress } from '../../../export/export-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import {
  isAudioClip,
  isCaptionClip,
  isVisualClip,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '../../composition/composition-types';
import { useCompositionAudioWaveforms } from './useCompositionAudioWaveforms';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan, snapValue } from './timeline-snap';

export interface TimelineTracksProps {
  currentTime: number;
  duration: number;
  zoomLevel: number;
  exportProgress?: ExportProgress | null;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ClipComposition;
  selectedClipId: string | null;
  isSnappingEnabled?: boolean;
}

export interface TimelineTracksEmits {
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
}

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
  const { bars: audioBars } = useCompositionAudioWaveforms(
    () => props.composition,
    () => props.duration,
  );

  const tracksScrollRef = ref<HTMLDivElement | null>(null);
  const tracksViewportRef = ref<HTMLDivElement | null>(null);
  const ticksAreaRef = ref<HTMLDivElement | null>(null);
  const rulerWidth = ref(0);
  const tracksWidthStyle = computed(() => ({
    width: `calc(${props.zoomLevel}% + 230px)`,
    minWidth: 'calc(100% + 230px)',
  }));
  const scrubPreviewTime = ref<number | null>(null);
  const displayedPlayheadTime = computed(() => scrubPreviewTime.value ?? props.currentTime);
  const playheadStyle = computed(() => ({
    left: `${props.duration > 0 ? (displayedPlayheadTime.value / props.duration) * 100 : 0}%`,
  }));
  const rulerLabelStep = computed(() => {
    const pixelsPerSecond = rulerWidth.value / Math.max(1, props.duration);
    return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => step * pixelsPerSecond >= 68) ?? 600;
  });
  const rulerTickStep = computed(() => (rulerLabelStep.value <= 5 ? 1 : rulerLabelStep.value / 5));
  const rulerSeconds = computed(() => {
    const result: number[] = [];
    for (let second = 0; second <= Math.ceil(props.duration); second += rulerTickStep.value) result.push(second);
    return result;
  });
  const rulerMarkerStyle = (second: number) => ({ left: `${(second / Math.max(1, props.duration)) * 100}%` });
  const isRulerLabel = (second: number) => second % rulerLabelStep.value === 0;
  const formatRulerLabel = (second: number) =>
    second < 60 ? `${second}s` : `${Math.floor(second / 60)}:${(second % 60).toString().padStart(2, '0')}`;

  const visibleStartSecond = ref(0);
  const visibleEndSecond = ref(60);
  const visibleSeconds = computed(() => {
    const start = Math.max(0, Math.floor(visibleStartSecond.value) - 2);
    const end = Math.min(Math.max(0, Math.ceil(props.duration)), Math.ceil(visibleEndSecond.value) + 2);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });
  let scrollFrame: number | null = null;
  let scrubFrame: number | null = null;
  let pendingScrubTime: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const updateVisibleRange = () => {
    const scroll = tracksScrollRef.value;
    const ticks = ticksAreaRef.value;
    if (!scroll || !ticks) return;
    rulerWidth.value = ticks.clientWidth;
    if (props.duration <= 0) return;
    const timelineLeft = 120 + 80;
    const startPixel = Math.max(0, scroll.scrollLeft - timelineLeft);
    const endPixel = Math.max(0, scroll.scrollLeft + scroll.clientWidth - timelineLeft);
    visibleStartSecond.value = (startPixel / Math.max(1, ticks.clientWidth)) * props.duration;
    visibleEndSecond.value = (endPixel / Math.max(1, ticks.clientWidth)) * props.duration;
  };
  const onScroll = () => {
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      updateVisibleRange();
    });
  };
  onMounted(() => {
    updateVisibleRange();
    if (tracksScrollRef.value) {
      resizeObserver = new ResizeObserver(updateVisibleRange);
      resizeObserver.observe(tracksScrollRef.value);
      if (tracksViewportRef.value) resizeObserver.observe(tracksViewportRef.value);
    }
  });
  onUnmounted(() => {
    resizeObserver?.disconnect();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
  });

  const percentageStyle = (startMs: number, lengthMs: number) => ({
    left: `${(startMs / durationMs.value) * 100}%`,
    width: `${(lengthMs / durationMs.value) * 100}%`,
  });
  const timeAt = (clientX: number) => {
    const target = ticksAreaRef.value;
    if (!target) return 0;
    const rect = target.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(fraction * durationMs.value);
  };
  const centeredStartAt = (clientX: number, lengthMs: number) => {
    const maximumStart = Math.max(0, durationMs.value - lengthMs);
    return Math.round(Math.max(0, Math.min(maximumStart, timeAt(clientX) - lengthMs / 2)));
  };
  const emitScrub = (timeMs: number) => emit('update:currentTime', timeMs / 1_000);
  let lastScrubX = 0;
  let lastScrubTimestamp = 0;

  const calculateScrubSnap = (clientX: number): number => {
    const rawTimeMs = timeAt(clientX);
    if (props.isSnappingEnabled === false) {
      activeSnapTimeMs.value = null;
      return rawTimeMs;
    }

    const now = performance.now();
    const deltaX = Math.abs(clientX - lastScrubX);
    const deltaTime = Math.max(1, now - lastScrubTimestamp);
    const speedPxPerMs = deltaX / deltaTime;
    lastScrubX = clientX;
    lastScrubTimestamp = now;

    const thresholdPx = speedPxPerMs < 0.8 ? 14 : 8;
    const thresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value, thresholdPx);
    const targets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: props.currentTime,
      duration: props.duration,
      ignorePlayhead: true,
    });

    const snapResult = snapValue(rawTimeMs, targets, thresholdMs);
    if (snapResult) {
      activeSnapTimeMs.value = snapResult.snappedValueMs;
      return snapResult.snappedValueMs;
    }

    activeSnapTimeMs.value = null;
    return rawTimeMs;
  };

  const scheduleScrubAt = (clientX: number) => {
    pendingScrubTime = calculateScrubSnap(clientX);
    scrubPreviewTime.value = pendingScrubTime / 1_000;
    if (scrubFrame !== null) return;
    scrubFrame = requestAnimationFrame(() => {
      scrubFrame = null;
      if (pendingScrubTime !== null) emitScrub(pendingScrubTime);
      pendingScrubTime = null;
    });
  };
  const flushScrubAt = (clientX: number) => {
    pendingScrubTime = calculateScrubSnap(clientX);
    scrubPreviewTime.value = pendingScrubTime / 1_000;
    if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
    scrubFrame = null;
    if (pendingScrubTime !== null) emitScrub(pendingScrubTime);
    pendingScrubTime = null;
    scrubPreviewTime.value = null;
    activeSnapTimeMs.value = null;
  };
  const isScrubbing = ref(false);
  const beginScrub = (event: PointerEvent) => {
    isScrubbing.value = true;
    scheduleScrubAt(event.clientX);
    const move = (next: PointerEvent) => scheduleScrubAt(next.clientX);
    const end = (next: PointerEvent) => {
      isScrubbing.value = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      flushScrubAt(next.clientX);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };
  const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    emit('update:zoomLevel', Math.max(100, Math.min(500, props.zoomLevel + (event.deltaY < 0 ? 15 : -15))));
  };

  const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
  const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
  const activeTrimState = ref<{ ids: string[]; edge: 'start' | 'end'; durationMs: number } | null>(null);
  const movingClipIds = ref<string[]>([]);
  const activeSnapTimeMs = ref<number | null>(null);
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
    const move = (next: PointerEvent) => {
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
    const end = () => {
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
    const move = (next: PointerEvent) => {
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
    const end = () => {
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
    const move = (next: PointerEvent) => {
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
    const end = () => {
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

    const move = (next: PointerEvent) => {
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
    const end = () => {
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
    const captions = captionClips.value.map((clip) => ({
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
    const captions = captionClips.value.map((clip) => ({
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

    const move = (next: PointerEvent) => {
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
    const end = () => {
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
    systemAudioClips,
    microphoneClips,
    importedAudioClips,
    assets,
    assetFor,
    audioBars,
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
    visibleSeconds,
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
