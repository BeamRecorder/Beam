import { computed, ref } from 'vue';
import { Camera, CircleDashed, Image as ImageIcon, Video } from '@lucide/vue';
import { DEFAULT_ZOOM_DURATION_MS, type ZoomElement } from '../../zoom/zoom-types';
import {
  isAudioClip,
  isCaptionClip,
  isCompositingClip,
  isKeyboardCaptionClip,
  isTextCaptionClip,
  type AudioClip,
  type Clip,
  type MediaAsset,
  type BlurClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan, snapValue } from './timeline-snap';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import { useTimelineViewport } from './useTimelineViewport';
import { useTimelineZoomInteractions } from './useTimelineZoomInteractions';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';
import { groupVisualTimelineTracks, previewVisualTrackOrder } from './visual-timeline-tracks';
import { visualMoveDeltaBounds, visualTrimBounds } from '../../composition/engine/visual-track-layout';
import { previewClipMove, previewClipTrim } from './timeline-composition-preview';
import { useVisualTrackReorder } from './useVisualTrackReorder';
export type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export { DEFAULT_ZOOM_DURATION_MS } from '../../zoom/zoom-types';
export const DEFAULT_CAPTION_DURATION_MS = 2_000;
export const MIN_DURATION_MS = 40;

export function useTimelineTracks(props: TimelineTracksProps, emit: TimelineTracksEmits, t: (key: string) => string) {
  const newZoomDurationMs = computed(() =>
    Number.isFinite(props.newZoomDurationMs)
      ? Math.max(200, Math.round(props.newZoomDurationMs ?? DEFAULT_ZOOM_DURATION_MS))
      : DEFAULT_ZOOM_DURATION_MS,
  );
  const previewDurationMs = ref<number | null>(null);
  const durationMs = computed(() => {
    const raw = typeof props.duration === 'number' && Number.isFinite(props.duration) ? props.duration * 1_000 : 0;
    const preview =
      typeof previewDurationMs.value === 'number' && Number.isFinite(previewDurationMs.value)
        ? previewDurationMs.value
        : 0;
    return Math.max(1_000, Math.round(Math.max(raw, preview)));
  });
  const orderedClips = computed(() => [...props.composition.clips].sort((left, right) => left.order - right.order));
  const baseVisualClips = computed(() => orderedClips.value.filter(isCompositingClip));
  const baseVisualTracks = computed(() => groupVisualTimelineTracks(baseVisualClips.value));
  const visualOrderPreview = ref<string[] | null>(null);
  const visualTracks = computed(() => previewVisualTrackOrder(baseVisualTracks.value, visualOrderPreview.value));
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
  const assetFor = (clip: Clip) =>
    isCaptionClip(clip) || clip.kind === 'blur' ? null : (assets.value.get(clip.assetId) ?? null);

  const activeSnapTimeMs = ref<number | null>(null);
  const {
    tracksScrollRef,
    sidebarScrollRef,
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
    updateAutoScroll,
    stopAutoScroll,
    percentageStyle,
    timeAt,
    centeredStartAt,
    beginScrub,
    handleWheel,
  } = useTimelineViewport(props, emit, durationMs, activeSnapTimeMs);

  const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
  const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
  const activeTrimState = ref<{ ids: string[]; edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null>(
    null,
  );
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
    return state?.ids.includes(id) ? { edge: state.edge, durationMs: state.durationMs, atLimit: state.atLimit } : null;
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

  const resolveMsPerPx = () => {
    const ticks = ticksAreaRef.value;
    const scroll = tracksScrollRef.value;
    const baseDurationMs = Math.max(1, Math.round(props.duration * 1_000));
    const width = Math.max(
      1,
      rulerWidth.value ||
        (ticks ? ticks.getBoundingClientRect().width : 0) ||
        (scroll ? scroll.getBoundingClientRect().width : 0) ||
        1_000,
    );
    return { baseDurationMs, width, msPerPx: baseDurationMs / width };
  };

  const beginClipMove = (event: PointerEvent, clip: Clip) => {
    if ((event.target as HTMLElement).closest('.trim-handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = linkedIdsFor(clip);
    movingClipIds.value = ids;
    const initialVisualTrack = baseVisualTracks.value.find((track) =>
      track.clips.some((entry) => entry.id === clip.id),
    );
    const initialVisualTrackOrder = initialVisualTrack ? baseVisualTracks.value.map((track) => track.id) : null;
    const initialVisualTrackIndex = initialVisualTrack ? initialVisualTrackOrder!.indexOf(initialVisualTrack.id) : -1;
    const pointerStartX = event.clientX;
    const initialScrollLeft = tracksScrollRef.value?.scrollLeft ?? 0;
    const { baseDurationMs, width: baseRulerWidth, msPerPx } = resolveMsPerPx();
    const originalStartMs = clip.timelineStartMs;
    const clipLengthMs = clip.timelineDurationMs;
    const moveBounds = visualMoveDeltaBounds(props.composition.clips, new Set(ids));

    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreClipIds: ids,
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);

    let finalStartMs = originalStartMs;
    let lastVisualSwapTime = 0;
    const applyMove = (next: PointerEvent) => {
      updateAutoScroll(next.clientX);
      const currentScrollLeft = tracksScrollRef.value?.scrollLeft ?? 0;
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft);
      const deltaMs = Math.max(moveBounds.min, Math.min(moveBounds.max, Math.round(deltaPx * msPerPx)));
      const proposedStartMs = Math.max(0, originalStartMs + deltaMs);
      const snap =
        props.isSnappingEnabled !== false
          ? snapSpan(proposedStartMs, clipLengthMs, snapTargets, snapThresholdMs)
          : null;
      if (snap) {
        finalStartMs = Math.max(
          originalStartMs + moveBounds.min,
          Math.min(originalStartMs + moveBounds.max, Math.max(0, snap.snappedStartMs)),
        );
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        finalStartMs = proposedStartMs;
        activeSnapTimeMs.value = null;
      }
      if (finalStartMs + clipLengthMs > baseDurationMs) {
        previewDurationMs.value = finalStartMs + clipLengthMs;
      } else {
        previewDurationMs.value = null;
      }
      previewLinked(ids, finalStartMs, clipLengthMs);
      emit('preview:composition', previewClipMove(props.composition, clip, finalStartMs));
      if (initialVisualTrack && initialVisualTrackOrder) {
        const row = document.elementFromPoint?.(next.clientX, next.clientY)?.closest<HTMLElement>('.visual-track');
        const targetTrackId = row?.dataset.trackId;
        if (targetTrackId && targetTrackId !== initialVisualTrack.id) {
          const order = [...(visualOrderPreview.value ?? initialVisualTrackOrder)];
          const from = order.indexOf(initialVisualTrack.id);
          const to = order.indexOf(targetTrackId);
          const now = Date.now();
          if (from >= 0 && to >= 0 && from !== to && now - lastVisualSwapTime >= 150) {
            order.splice(from, 1);
            order.splice(to, 0, initialVisualTrack.id);
            visualOrderPreview.value = order;
            draggedTrackId.value = initialVisualTrack.id;
            lastVisualSwapTime = now;
          }
        }
      }
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const cleanup = () => {
      stopAutoScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      clearLinkedPreview(ids);
      previewDurationMs.value = null;
      movingClipIds.value = [];
      activeSnapTimeMs.value = null;
      emit('preview:composition', null);
      if (initialVisualTrack) {
        requestAnimationFrame(() => {
          visualOrderPreview.value = null;
          draggedTrackId.value = null;
        });
      }
    };
    const end = () => {
      moveUpdates.flush();
      if (initialVisualTrack && visualOrderPreview.value) {
        const finalVisualIndex = visualOrderPreview.value.indexOf(initialVisualTrack.id);
        if (finalVisualIndex >= 0 && finalVisualIndex !== initialVisualTrackIndex) {
          emit('reorder:clip', { id: clip.id, targetIndex: finalVisualIndex });
        }
      }
      cleanup();
      if (finalStartMs !== originalStartMs) emit('move:clip', { id: clip.id, startMs: finalStartMs });
    };
    const cancel = () => {
      moveUpdates.cancel();
      cleanup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };
  const beginClipTrim = (event: PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();
    const ids = linkedIdsFor(clip);
    const pointerStartX = event.clientX;
    const initialScrollLeft = tracksScrollRef.value?.scrollLeft ?? 0;
    const { baseDurationMs, width: baseRulerWidth, msPerPx } = resolveMsPerPx();
    const originalStartMs = clip.timelineStartMs;
    const originalEndMs = clip.timelineStartMs + clip.timelineDurationMs;
    const asset = assetFor(clip);
    const maxLeftExpansionMs =
      asset?.durationMs != null ? Math.round(clip.sourceInMs / Math.max(0.01, clip.playbackRate)) : Infinity;
    const trackBounds = visualTrimBounds(props.composition.clips, new Set(ids), edge);
    const minStartMs = Math.max(0, originalStartMs - maxLeftExpansionMs, trackBounds.min);

    const remainingSourceMs =
      asset?.durationMs != null ? Math.max(0, asset.durationMs - (clip.sourceInMs + clip.sourceDurationMs)) : Infinity;
    const maxRightExpansionMs =
      asset?.durationMs != null ? Math.round(remainingSourceMs / Math.max(0.01, clip.playbackRate)) : Infinity;
    const maxEndMs = Math.min(originalEndMs + maxRightExpansionMs, trackBounds.max);

    const snapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: displayedPlayheadTime.value,
      duration: props.duration,
      ignoreClipIds: ids,
    });
    const snapThresholdMs = calculateSnapThresholdMs(baseDurationMs, baseRulerWidth);

    let finalTimeMs = edge === 'start' ? originalStartMs : originalEndMs;
    const applyMove = (next: PointerEvent) => {
      updateAutoScroll(next.clientX);
      const currentScrollLeft = tracksScrollRef.value?.scrollLeft ?? 0;
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft);
      const deltaMs = Math.round(deltaPx * msPerPx);
      const raw = edge === 'start' ? originalStartMs + deltaMs : originalEndMs + deltaMs;
      let proposedTimeMs =
        edge === 'start'
          ? Math.max(minStartMs, Math.min(originalEndMs - MIN_DURATION_MS, raw))
          : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(maxEndMs, raw));

      const snap = props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
      if (snap) {
        proposedTimeMs =
          edge === 'start'
            ? Math.max(minStartMs, Math.min(originalEndMs - MIN_DURATION_MS, snap.snappedValueMs))
            : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(maxEndMs, snap.snappedValueMs));
        activeSnapTimeMs.value = snap.targetMs;
      } else {
        activeSnapTimeMs.value = null;
      }

      finalTimeMs = proposedTimeMs;
      const isAtLimit =
        (edge === 'start' && raw <= minStartMs && Number.isFinite(minStartMs)) ||
        (edge === 'end' && raw >= maxEndMs && Number.isFinite(maxEndMs));

      const startMs = edge === 'start' ? finalTimeMs : originalStartMs;
      const endMs = edge === 'end' ? finalTimeMs : originalEndMs;
      previewDurationMs.value = endMs > baseDurationMs ? endMs : null;
      previewLinked(ids, startMs, endMs - startMs);
      emit('preview:composition', previewClipTrim(props.composition, clip, edge, finalTimeMs));
      activeTrimState.value = { ids, edge, durationMs: endMs - startMs, atLimit: isAtLimit };
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const cleanup = () => {
      stopAutoScroll();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      clearLinkedPreview(ids);
      previewDurationMs.value = null;
      activeTrimState.value = null;
      activeSnapTimeMs.value = null;
      emit('preview:composition', null);
    };
    const end = () => {
      moveUpdates.flush();
      cleanup();
      const original = edge === 'start' ? originalStartMs : originalEndMs;
      if (finalTimeMs !== original) emit('trim:clip', { id: clip.id, edge, timeMs: finalTimeMs });
    };
    const cancel = () => {
      moveUpdates.cancel();
      cleanup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  const { beginZoomMove, beginZoomTrim } = useTimelineZoomInteractions({
    props,
    emit,
    tracksScrollRef,
    displayedPlayheadTime,
    activeSnapTimeMs,
    previewDurationMs,
    zoomPreview,
    activeTrimState,
    resolveMsPerPx,
    updateAutoScroll,
    stopAutoScroll,
  });

  const hoverZoomTimeMs = ref<number | null>(null);
  const hoverCaptionTimeMs = ref<number | null>(null);
  const occupied = (startMs: number, endMs: number, intervals: Array<{ startMs: number; endMs: number }>) =>
    intervals.some((interval) => interval.startMs < endMs && interval.endMs > startMs);
  const hoverAt = (event: MouseEvent, kind: 'zoom' | 'caption') => {
    if (kind === 'zoom') {
      const duration = newZoomDurationMs.value;
      const startMs = centeredStartAt(event.clientX, duration);
      hoverZoomTimeMs.value = occupied(startMs, startMs + duration, props.zoomElements) ? null : startMs;
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
      const duration = newZoomDurationMs.value;
      const startMs = centeredStartAt(event.clientX, duration);
      if (!occupied(startMs, startMs + duration, props.zoomElements)) emit('add:zoom', startMs);
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
  const handleVisualTrackHeader = (clips: Clip[]) => {
    if (clips[0]?.kind !== 'webcam') {
      toggleGroup(clips);
      return;
    }
    const timeMs = props.currentTime * 1_000;
    const cameraClips = clips.filter((clip): clip is VisualClip => clip.kind === 'webcam');
    const selected = [...cameraClips].sort((left, right) => {
      const distance = (clip: VisualClip) =>
        timeMs < clip.timelineStartMs
          ? clip.timelineStartMs - timeMs
          : timeMs >= clip.timelineStartMs + clip.timelineDurationMs
            ? timeMs - (clip.timelineStartMs + clip.timelineDurationMs)
            : 0;
      return distance(left) - distance(right) || left.timelineStartMs - right.timelineStartMs;
    })[0];
    if (selected) emit('select:clip', selected.id);
  };
  const iconForVisual = (clip: VisualClip | BlurClip) =>
    clip.kind === 'blur' ? CircleDashed : clip.kind === 'image' ? ImageIcon : clip.kind === 'webcam' ? Camera : Video;
  const labelForVisual = (clip: VisualClip | BlurClip) =>
    clip.kind === 'blur'
      ? t('blur')
      : clip.kind === 'screen'
        ? t('video')
        : clip.kind === 'webcam'
          ? t('webcam')
          : clip.name;
  const zoomScale = (depth: number) => [1.25, 1.5, 1.8, 2.2, 3.5, 5][Math.max(0, Math.min(5, depth - 1))] ?? 1.25;

  const { draggedTrackId, beginReorder } = useVisualTrackReorder({ baseVisualTracks, visualOrderPreview, emit });

  return {
    durationMs,
    orderedClips,
    baseVisualClips,
    baseVisualTracks,
    visualOrderPreview,
    visualTracks,
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
    sidebarScrollRef,
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
    handleVisualTrackHeader,
    iconForVisual,
    labelForVisual,
    zoomScale,
    draggedTrackId,
    beginReorder,
    newZoomDurationMs,
    DEFAULT_CAPTION_DURATION_MS,
  };
}
