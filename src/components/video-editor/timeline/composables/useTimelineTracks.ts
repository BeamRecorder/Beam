import { computed, ref } from 'vue';
import { DEFAULT_ZOOM_DURATION_MS, type ZoomElement } from '../../zoom/zoom-types';
import {
  isAudioClip,
  isCaptionClip,
  isColorClip,
  isShapeClip,
  isCompositingClip,
  isKeyboardCaptionClip,
  isTextCaptionClip,
  type AudioClip,
  type Clip,
  type MediaAsset,
} from '~/media/shared/composition-types';
import { calculateSnapThresholdMs, collectSnapTargets, snapSpan } from './timeline-snap';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import { useTimelineViewport } from './useTimelineViewport';
import { useTimelineZoomInteractions } from './useTimelineZoomInteractions';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';
import { timelineVisualScale } from './timeline-coordinate-space';
import { groupVisualTimelineTracks, previewVisualTrackOrder } from './visual-timeline-tracks';
import { visualMoveDeltaBounds } from '../../composition/engine/visual-track-layout';
import { previewClipMove } from './timeline-composition-preview';
import { useVisualTrackReorder } from './useVisualTrackReorder';
import { useTimelineClipTrim } from './useTimelineClipTrim';
import { groupImportedAudioTimelineTracks } from './audio-timeline-tracks';
import { useCaptionLayerReorder } from './useCaptionLayerReorder';
import { groupTextCaptionLayers } from '../../composition/engine/caption-layer-layout';
import { useTimelineAddPlacement } from './useTimelineAddPlacement';
export type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export { DEFAULT_ZOOM_DURATION_MS } from '../../zoom/zoom-types';

export function useTimelineTracks(props: TimelineTracksProps, emit: TimelineTracksEmits) {
  const newZoomDurationMs = computed(() =>
    Number.isFinite(props.newZoomDurationMs)
      ? Math.max(200, Math.round(props.newZoomDurationMs ?? DEFAULT_ZOOM_DURATION_MS))
      : DEFAULT_ZOOM_DURATION_MS,
  );
  const previewDurationMs = ref<number | null>(null);
  const canonicalDurationMs = computed(() =>
    Math.max(
      1_000,
      Math.round(typeof props.duration === 'number' && Number.isFinite(props.duration) ? props.duration * 1_000 : 0),
    ),
  );
  const durationMs = computed(() => {
    const preview =
      typeof previewDurationMs.value === 'number' && Number.isFinite(previewDurationMs.value)
        ? previewDurationMs.value
        : null;
    return Math.max(1_000, Math.round(preview ?? canonicalDurationMs.value));
  });
  const layoutDurationMs = computed(() => Math.max(canonicalDurationMs.value, durationMs.value));
  const orderedClips = computed(() => [...props.composition.clips].sort((left, right) => left.order - right.order));
  const baseVisualClips = computed(() => orderedClips.value.filter(isCompositingClip));
  const baseVisualTracks = computed(() => groupVisualTimelineTracks(baseVisualClips.value));
  const visualOrderPreview = ref<string[] | null>(null);
  const visualTracks = computed(() => previewVisualTrackOrder(baseVisualTracks.value, visualOrderPreview.value));
  const captionClips = computed(() => orderedClips.value.filter(isCaptionClip));
  const keyboardCaptionClips = computed(() => orderedClips.value.filter(isKeyboardCaptionClip));
  const textCaptionClips = computed(() => orderedClips.value.filter(isTextCaptionClip));
  const baseTextCaptionLayers = computed(() => groupTextCaptionLayers(textCaptionClips.value));
  const textCaptionOrderPreview = ref<string[] | null>(null);
  const textCaptionLayers = computed(() => {
    const preview = textCaptionOrderPreview.value;
    if (!preview) return baseTextCaptionLayers.value;
    const byId = new Map(baseTextCaptionLayers.value.map((layer) => [layer.id, layer]));
    return preview.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  });
  const systemAudioClips = computed(() =>
    orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'system'),
  );
  const microphoneClips = computed(() =>
    orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'microphone'),
  );
  const importedAudioTracks = computed(() =>
    groupImportedAudioTimelineTracks(
      orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === 'imported'),
    ),
  );
  const assets = computed(() => new Map(props.composition.assets.map((asset: MediaAsset) => [asset.id, asset])));
  const assetFor = (clip: Clip) =>
    isCaptionClip(clip) || isColorClip(clip) || isShapeClip(clip) || clip.kind === 'blur'
      ? null
      : (assets.value.get(clip.assetId) ?? null);

  const activeSnapTimeMs = ref<number | null>(null);
  const activeTrimState = ref<{ ids: string[]; edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null>(
    null,
  );
  const {
    tracksScrollRef,
    sidebarScrollRef,
    tracksViewportRef,
    ticksAreaRef,
    rulerWidth,
    rulerLayoutWidth,
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
    isWheelZooming,
    onScroll,
    updateAutoScroll,
    stopAutoScroll,
    percentageStyle,
    timeAt,
    centeredStartAt,
    beginScrub,
    handleWheel,
  } = useTimelineViewport(
    props,
    emit,
    layoutDurationMs,
    activeSnapTimeMs,
    computed(() => activeTrimState.value !== null),
  );

  const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
  const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
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
    return { baseDurationMs, width, msPerPx: baseDurationMs / width, visualScale: timelineVisualScale(ticks) };
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
    const { baseDurationMs, width: baseRulerWidth, msPerPx, visualScale } = resolveMsPerPx();
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
      const deltaPx = next.clientX - pointerStartX + (currentScrollLeft - initialScrollLeft) * visualScale;
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
  const { beginClipTrim } = useTimelineClipTrim({
    props,
    emit,
    tracksScrollRef,
    displayedPlayheadTime,
    activeSnapTimeMs,
    previewDurationMs,
    clipPreview,
    activeTrimState,
    linkedIdsFor,
    clearLinkedPreview,
    resolveMsPerPx,
    updateAutoScroll,
    stopAutoScroll,
  });

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

  const {
    hoverZoomTimeMs,
    hoverZoomDurationMs,
    hoverCaptionTimeMs,
    hoverCaptionDurationMs,
    hoverVisualPlacements,
    visualKindFor,
    hoverAt,
    leaveTrack,
    addAt,
  } = useTimelineAddPlacement({
    durationMs: () => durationMs.value,
    newZoomDurationMs: () => newZoomDurationMs.value,
    zoomElements: () => props.zoomElements,
    textCaptionClips: () => textCaptionClips.value,
    timeAt,
    emit,
  });

  const selectTrack = (clips: Clip[], trackName: string, event?: MouseEvent) => {
    if (!clips.length) return;
    const timeMs = props.currentTime * 1_000;
    const ordered = [...clips].sort((left, right) => {
      const distance = (clip: Clip) =>
        timeMs < clip.timelineStartMs
          ? clip.timelineStartMs - timeMs
          : timeMs >= clip.timelineStartMs + clip.timelineDurationMs
            ? timeMs - (clip.timelineStartMs + clip.timelineDurationMs)
            : 0;
      return distance(left) - distance(right) || left.timelineStartMs - right.timelineStartMs;
    });
    emit('select:track', {
      clipIds: ordered.map((clip) => clip.id),
      primaryClipId: ordered[0]?.id ?? null,
      trackNames: [trackName],
      ...(event?.ctrlKey || event?.metaKey || event?.shiftKey ? { additive: true } : {}),
    });
  };
  const selectZoomTrack = (zooms: ZoomElement[], event?: MouseEvent) => {
    if (!zooms.length) return;
    const timeMs = props.currentTime * 1_000;
    const ordered = [...zooms].sort((left, right) => {
      const distance = (zoom: ZoomElement) =>
        timeMs < zoom.startMs ? zoom.startMs - timeMs : timeMs >= zoom.endMs ? timeMs - zoom.endMs : 0;
      return distance(left) - distance(right) || left.startMs - right.startMs;
    });
    emit('select:zoom-track', {
      zoomIds: ordered.map((zoom) => zoom.id),
      primaryZoomId: ordered[0]?.id ?? null,
      ...(event?.ctrlKey || event?.metaKey || event?.shiftKey ? { additive: true } : {}),
    });
  };
  const zoomScale = (depth: number) => [1.25, 1.5, 1.8, 2.2, 3.5, 5][Math.max(0, Math.min(5, depth - 1))] ?? 1.25;

  const { draggedTrackId, beginReorder } = useVisualTrackReorder({ baseVisualTracks, visualOrderPreview, emit });
  const { draggedCaptionId, beginCaptionReorder } = useCaptionLayerReorder({
    layers: baseTextCaptionLayers,
    orderPreview: textCaptionOrderPreview,
    emit,
  });

  return {
    durationMs,
    layoutDurationMs,
    orderedClips,
    baseVisualClips,
    baseVisualTracks,
    visualOrderPreview,
    visualTracks,
    captionClips,
    keyboardCaptionClips,
    textCaptionClips,
    textCaptionLayers,
    systemAudioClips,
    microphoneClips,
    importedAudioTracks,
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
    rulerLayoutWidth,
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
    isWheelZooming,
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
    hoverZoomDurationMs,
    hoverCaptionTimeMs,
    hoverCaptionDurationMs,
    hoverVisualPlacements,
    visualKindFor,
    hoverAt,
    leaveTrack,
    addAt,
    selectTrack,
    selectZoomTrack,
    zoomScale,
    draggedTrackId,
    beginReorder,
    draggedCaptionId,
    beginCaptionReorder,
    newZoomDurationMs,
  };
}
