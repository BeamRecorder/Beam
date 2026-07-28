import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useThumbnails } from "../waveform/useThumbnails";
import { useWaveform } from "../waveform/useWaveform";
import type { ZoomElement } from "../../zoom/zoom-types";
import type { ProjectEditorData } from "../../../../api/types/capture-api";
import type { ProjectComposition } from "../../composition/composition-types";
import { cameraLayers } from "../../composition/webcam/camera-composition";
import { visualTracks } from "../../composition/visual-stack";
import { sessionSegments, timelineToSourceMs } from "../../composition/base-video-ranges";
import { useCompositionAudioWaveforms } from './useCompositionAudioWaveforms';
import {
  timelinePercentStyle,
  timelineRulerSecondsInView,
  timelineSecondsInView,
} from "./timeline-viewport";

export interface TimelineTracksProps {
  currentTime: number;
  duration: number;
  sourceDurationMs: number;
  zoomLevel: number;
  videoSrc: string | null;
  editorData?: ProjectEditorData | null;
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  isCameraEnabled: boolean;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ProjectComposition;
  selectedCompositionLayerId: string | null;
  selectedCameraLayerId: string | null;
}

export type TimelineTracksEmit = (event: any, ...args: any[]) => void;

export function useTimelineTracks(
  props: TimelineTracksProps,
  emit: TimelineTracksEmit,
) {
  const DEFAULT_ZOOM_DURATION_MS = 1200;
  const DEFAULT_CAPTION_DURATION_MS = 1200;

  // Layer computeds
  const captionLayers = computed(() =>
    props.composition.layers.filter((layer) => layer.kind === "caption"),
  );
  const cameraLayersList = computed(() => cameraLayers(props.composition));
  const cameraAssetIds = computed(
    () => new Set(cameraLayersList.value.map((layer) => layer.assetId)),
  );
  const cameraLayersResult = computed(() => cameraLayersList.value);
  const compositionVisualLayers = computed(() =>
    props.composition.layers
      .filter((layer) => (layer.kind === "video" || layer.kind === "image") && !cameraAssetIds.value.has(layer.assetId))
      .sort((left, right) => left.order - right.order),
  );
  const compositionAudioLayers = computed(() =>
    props.composition.layers.filter((layer) => layer.kind === 'audio'),
  );
  const visualTrackOrder = computed(() => visualTracks(props.composition));
  const visualTrackIndex = (id: string) =>
    visualTrackOrder.value.findIndex((track) => track.id === id);
  const visualTrackStyle = (id: string) => ({
    order: visualTrackIndex(id),
  });
  const { bars: compositionAudioBars } = useCompositionAudioWaveforms(() => props.composition, () => props.duration);
  const mainVideoLayer = computed(
    () => null,
  );
  const baseVideoSegments = computed(() => {
    return sessionSegments(props.composition, props.sourceDurationMs).map((segment) => ({
      id: `base-video:${segment.id}`,
      startMs: segment.timelineStartMs,
      endMs: segment.timelineEndMs,
      playbackRate: segment.playbackRate,
      deleted: !segment.active,
    })).filter((segment) => !segment.deleted);
  });

  const layerStyle = (startMs: number, endMs: number) => ({
    left: `${props.duration > 0 ? startMs / (props.duration * 10) : 0}%`,
    width: `${props.duration > 0 ? (endMs - startMs) / (props.duration * 10) : 0}%`,
  });
  const cutStyle = (timeMs: number) => ({
    left: `${props.duration > 0 ? (timeMs / (props.duration * 1000)) * 100 : 0}%`,
  });

  const zoomElementStyle = (element: ZoomElement) => ({
    left: `${props.duration > 0 ? (element.startMs / 1000 / props.duration) * 100 : 0}%`,
    width: `${props.duration > 0 ? ((element.endMs - element.startMs) / 1000 / props.duration) * 100 : 0}%`,
  });

  // DOM Refs
  const tracksScrollRef = ref<HTMLDivElement | null>(null);
  const tracksViewportRef = ref<HTMLDivElement | null>(null);
  const ticksAreaRef = ref<HTMLDivElement | null>(null);

  // Real Waveform Logic
  const {
    peaks: systemPeaks,
    generateWaveformFromAudioBuffer: genSystemWaveform,
  } = useWaveform();
  const { peaks: micPeaks, generateWaveformFromAudioBuffer: genMicWaveform } =
    useWaveform();

  const systemAudioBuffer = ref<AudioBuffer | null>(null);
  const micAudioBuffer = ref<AudioBuffer | null>(null);

  const decodeAudio = async (source: string) => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Unable to read audio asset: ${source}`);
    const context = new OfflineAudioContext(1, 1, 44_100);
    return context.decodeAudioData(await response.arrayBuffer());
  };

  const visibleStartSecond = ref(0);
  const visibleEndSecond = ref(0);
  const TIMELINE_BUFFER_SECONDS = 3;
  const visibleTimelineSeconds = computed(() =>
    timelineSecondsInView(
      props.duration,
      visibleStartSecond.value,
      visibleEndSecond.value,
      TIMELINE_BUFFER_SECONDS,
    ),
  );
  const visibleRulerSeconds = computed(() =>
    timelineRulerSecondsInView(props.duration, visibleTimelineSeconds.value),
  );

  const systemAudioTrack = computed(() =>
    props.editorData?.tracks.find((t) => t.kind === "system-audio"),
  );
  const micAudioTrack = computed(() =>
    props.editorData?.tracks.find((t) => t.kind === "microphone"),
  );
  const hasPlayableAudio = (track: typeof systemAudioTrack.value) =>
    Boolean(
      track &&
        track.status !== "failed" &&
        track.assets.some((asset) => asset.exists && Boolean(asset.src)),
    );
  const hasSystemAudioTrack = computed(() => hasPlayableAudio(systemAudioTrack.value));
  const hasMicrophoneTrack = computed(() => hasPlayableAudio(micAudioTrack.value));

  // Fetch audio files once when tracks are loaded
  watch(
    () => systemAudioTrack.value?.assets?.[0]?.src,
    async (src) => {
      if (!src) {
        systemAudioBuffer.value = null;
        return;
      }
      try {
        systemAudioBuffer.value = await decodeAudio(src);
      } catch (err) {
        console.error("Failed to load system audio track:", err);
      }
    },
    { immediate: true },
  );

  watch(
    () => micAudioTrack.value?.assets?.[0]?.src,
    async (src) => {
      if (!src) {
        micAudioBuffer.value = null;
        return;
      }
      try {
        micAudioBuffer.value = await decodeAudio(src);
      } catch (err) {
        console.error("Failed to load mic audio track:", err);
      }
    },
    { immediate: true },
  );

  const getNormalizedBars = (peaks: Float32Array | null, maxBarHeight = 22) => {
    if (!peaks || peaks.length === 0) return [];
    const len = peaks.length / 2;
    const amps = new Float32Array(len);
    let maxAmp = 0.0001;

    for (let i = 0; i < len; i++) {
      const min = peaks[i * 2];
      const max = peaks[i * 2 + 1];
      const amp = Math.max(0, max - min);
      amps[i] = amp;
      if (amp > maxAmp) maxAmp = amp;
    }

    const bars: number[] = [];
    const scale = maxAmp > 0.01 ? maxBarHeight / maxAmp : maxBarHeight * 5;

    for (let i = 0; i < len; i++) {
      const height = Math.max(
        2,
        Math.min(maxBarHeight, Math.round(amps[i] * scale)),
      );
      bars.push(height);
    }
    return bars;
  };

  const systemBars = computed(() => getNormalizedBars(systemPeaks.value));
  const micBars = computed(() => getNormalizedBars(micPeaks.value));

  const waveformStyle = computed(() => {
    return {
      position: "absolute" as const,
      left: "0%",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "2px",
    };
  });
  const compositionAudioBarHeight = (height: number, volume = 100) =>
    Math.max(1, Math.round(height * Math.max(0, Math.min(200, volume)) / 100));

  const updateWaveforms = () => {
    if (!props.duration || props.duration <= 0) return;
    const width = tracksViewportRef.value?.clientWidth || 1000;
    const targetPoints = Math.max(100, Math.min(1200, Math.floor(width / 3)));

    if (systemAudioBuffer.value) {
      genSystemWaveform(
        systemAudioBuffer.value,
        0,
        props.duration,
        targetPoints,
      );
    }
    if (micAudioBuffer.value) {
      genMicWaveform(micAudioBuffer.value, 0, props.duration, targetPoints);
    }
  };

  watch(
    () => [
      systemAudioBuffer.value,
      micAudioBuffer.value,
      props.duration,
      props.zoomLevel,
    ],
    () => {
      updateWaveforms();
    },
  );

  // Ctrl + Wheel Zoom
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 15 : -15;
      const newZoom = Math.max(100, Math.min(500, props.zoomLevel + zoomDelta));
      emit("update:zoomLevel", newZoom);
    }
  };

  const cameraMediaSrc = computed(() => {
    const layer = cameraLayersResult.value[0];
    if (!layer || !("assetId" in layer)) return null;
    const asset = props.composition.media.find((m) => m.id === layer.assetId);
    return asset?.src ?? null;
  });

  // Thumbnail extraction composables
  const { thumbnails, requestVisibleFrames } = useThumbnails(
    computed(() => props.videoSrc),
  );

  const {
    thumbnails: webcamThumbnails,
    requestVisibleFrames: requestWebcamFrames,
  } = useThumbnails(cameraMediaSrc);

  // Width & Scrubbing
  const tracksWidthStyle = computed(() => {
    return {
      width: `calc(${props.zoomLevel}% + 230px)`,
      minWidth: "calc(100% + 230px)",
    };
  });

  const thumbnailStyle = (second: number) =>
    timelinePercentStyle(props.duration, second);
  const sourceSecondAtTimelineSecond = (second: number) => {
    const sourceMs = timelineToSourceMs(
      props.composition,
      second * 1000,
      props.sourceDurationMs,
    );
    return sourceMs === null ? null : Math.floor(sourceMs / 1000);
  };
  const thumbnailAtTimelineSecond = (second: number) => {
    const sourceSecond = sourceSecondAtTimelineSecond(second);
    return sourceSecond === null ? undefined : thumbnails[sourceSecond];
  };
  const rulerMarkerStyle = (second: number) => ({
    left: timelinePercentStyle(props.duration, second).left,
  });
  const cameraThumbnailSeconds = (layer: { startMs: number; endMs: number }) =>
    visibleTimelineSeconds.value.filter(
      (second) =>
        second >= Math.floor(layer.startMs / 1000) &&
        second < Math.ceil(layer.endMs / 1000),
    );
  const cameraThumbnailStyle = (
    second: number,
    layer: { startMs: number; endMs: number },
  ) => {
    const durationMs = Math.max(1, layer.endMs - layer.startMs);
    return {
      left: `${((second * 1000 - layer.startMs) / durationMs) * 100}%`,
      width: `${(1000 / durationMs) * 100}%`,
    };
  };

  const ticksAreaWidth = ref(0);
  let ticksResizeObserver: ResizeObserver | null = null;

  const updateTicksWidth = () => {
    if (ticksAreaRef.value) {
      ticksAreaWidth.value = ticksAreaRef.value.clientWidth;
    }
  };

  const playheadStyle = computed(() => {
    const percentage =
      props.duration > 0 ? props.currentTime / props.duration : 0;
    const x = percentage * ticksAreaWidth.value;
    return {
      transform: `translate3d(${x}px, 0, 0)`,
    };
  });

  let isDragging = false;
  let dragRect: { left: number; width: number } | null = null;
  let rafId: number | null = null;

  const handleScrub = (clientX: number) => {
    if (!ticksAreaRef.value || !props.duration) return;
    const rect = dragRect || ticksAreaRef.value.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickX = clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * props.duration;
    emit(
      "update:currentTime",
      Math.max(0, Math.min(props.duration, targetTime)),
    );
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    if (ticksAreaRef.value) {
      const rect = ticksAreaRef.value.getBoundingClientRect();
      dragRect = { left: rect.left, width: rect.width };
    }
    handleScrub(e.clientX);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const clientX = e.clientX;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (isDragging) {
        handleScrub(clientX);
      }
    });
  };

  const handleMouseUp = () => {
    isDragging = false;
    dragRect = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };

  const updateVisibleThumbnails = () => {
    if (!tracksScrollRef.value || !tracksViewportRef.value || !props.videoSrc)
      return;

    const scrollLeft = tracksScrollRef.value.scrollLeft;
    const clientWidth = tracksScrollRef.value.clientWidth;
    const scrollWidth = tracksViewportRef.value.scrollWidth;

    const startPercent = scrollLeft / scrollWidth;
    const endPercent = (scrollLeft + clientWidth) / scrollWidth;

    const startSecond = Math.max(0, Math.floor(startPercent * props.duration));
    const endSecond = Math.min(
      Math.max(0, Math.ceil(props.duration) - 1),
      Math.ceil(endPercent * props.duration),
    );

    visibleStartSecond.value = startSecond;
    visibleEndSecond.value = endSecond;

    const visibleSeconds: number[] = [];
    for (let s = startSecond; s <= endSecond; s++) {
      visibleSeconds.push(s);
    }

    if (visibleSeconds.length > 0) {
      requestVisibleFrames([...new Set(visibleSeconds.map(sourceSecondAtTimelineSecond).filter((second): second is number => second !== null))]);
      if (cameraMediaSrc.value) {
        requestWebcamFrames(visibleSeconds);
      }
    }
  };

  let scrollFrame: number | null = null;
  const onScroll = () => {
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      updateVisibleThumbnails();
    });
  };

  watch(
    () => [props.zoomLevel, props.videoSrc, props.duration],
    () => {
      setTimeout(updateVisibleThumbnails, 50);
    },
    { immediate: true },
  );

  watch(
    () => props.currentTime,
    (time) => {
      if (!tracksScrollRef.value || !ticksAreaRef.value || isDragging) return;

      const scrollContainer = tracksScrollRef.value;
      const ticksArea = ticksAreaRef.value;

      const percentage = time / props.duration;
      const playheadX = 120 + percentage * ticksArea.clientWidth;

      const leftBound = scrollContainer.scrollLeft + 80;
      const rightBound =
        scrollContainer.scrollLeft + scrollContainer.clientWidth - 80;

      if (playheadX < leftBound || playheadX > rightBound) {
        scrollContainer.scrollTo({
          left: playheadX - scrollContainer.clientWidth / 2,
          behavior: "smooth",
        });
      }
    },
  );

  const resetScrollPosition = () => {
    if (tracksScrollRef.value) {
      tracksScrollRef.value.scrollLeft = 80;
    }
  };

  onMounted(() => {
    updateVisibleThumbnails();
    updateTicksWidth();
    if (ticksAreaRef.value) {
      ticksResizeObserver = new ResizeObserver(updateTicksWidth);
      ticksResizeObserver.observe(ticksAreaRef.value);
    }
    setTimeout(resetScrollPosition, 50);
  });

  onUnmounted(() => {
    ticksResizeObserver?.disconnect();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    handleMouseUp();
  });

  watch(
    () => props.videoSrc,
    () => {
      setTimeout(resetScrollPosition, 50);
    },
  );

  const isZoomOccupied = (startMs: number, endMs: number) => {
    return props.zoomElements.some(
      (item) => item.startMs < endMs && item.endMs > startMs,
    );
  };

  const isCaptionOccupied = (startMs: number, endMs: number) => {
    return captionLayers.value.some(
      (layer) => layer.startMs < endMs && layer.endMs > startMs,
    );
  };

  const hoverZoomTimeMs = ref<number | null>(null);
  const hoverCaptionTimeMs = ref<number | null>(null);

  const handleTrackClick = (e: MouseEvent, action: "zoom" | "caption") => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || !props.duration) return;
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const timeMs = Math.round(percentage * props.duration * 1000);
    if (action === "zoom") {
      if (isZoomOccupied(timeMs, timeMs + DEFAULT_ZOOM_DURATION_MS)) return;
      emit("add:zoom", timeMs);
    } else if (action === "caption") {
      if (isCaptionOccupied(timeMs, timeMs + DEFAULT_CAPTION_DURATION_MS))
        return;
      emit("add:caption", timeMs);
    }
  };

  const onTrackMouseMove = (e: MouseEvent, action: "zoom" | "caption") => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || !props.duration) return;
    const mouseX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
    const timeMs = Math.round(percentage * props.duration * 1000);
    if (action === "zoom") {
      if (isZoomOccupied(timeMs, timeMs + DEFAULT_ZOOM_DURATION_MS)) {
        hoverZoomTimeMs.value = null;
      } else {
        hoverZoomTimeMs.value = timeMs;
      }
    } else {
      if (isCaptionOccupied(timeMs, timeMs + DEFAULT_CAPTION_DURATION_MS)) {
        hoverCaptionTimeMs.value = null;
      } else {
        hoverCaptionTimeMs.value = timeMs;
      }
    }
  };

  const onTrackMouseLeave = (action: "zoom" | "caption") => {
    if (action === "zoom") {
      hoverZoomTimeMs.value = null;
    } else {
      hoverCaptionTimeMs.value = null;
    }
  };

  const isTrimming = ref(false);
  const activeTrimState = ref<{
    id: string;
    edge: "start" | "end";
    timeMs: number;
    durationMs?: number;
  } | null>(null);

  const formatTrimTime = (ms: number) => {
    const totalSeconds = Math.max(0, ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const millis = Math.floor((totalSeconds % 1) * 10);
    return `${mins > 0 ? `${mins}:` : ""}${secs.toString().padStart(2, "0")}.${millis}s`;
  };

  const beginTrimDrag = (
    e: PointerEvent,
    id: string,
    edge: "start" | "end",
    clipStartMs?: number,
    clipEndMs?: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    isTrimming.value = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    let lastTimeMs: number | null = null;
    let pendingRaf: number | null = null;

    const getTimeMsFromEvent = (moveEv: PointerEvent) => {
      if (!ticksAreaRef.value || !props.duration) return 0;
      const rect = ticksAreaRef.value.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const mouseX = moveEv.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
      return Math.round(percentage * props.duration * 1000);
    };

    const updateTrimState = (timeMs: number) => {
      let durationMs: number | undefined;
      if (clipStartMs !== undefined && clipEndMs !== undefined) {
        durationMs = edge === "start" ? Math.max(0, clipEndMs - timeMs) : Math.max(0, timeMs - clipStartMs);
      }
      activeTrimState.value = { id, edge, timeMs, durationMs };
    };

    const initialTimeMs = getTimeMsFromEvent(e);
    updateTrimState(initialTimeMs);

    const onPointerMove = (moveEv: PointerEvent) => {
      const timeMs = getTimeMsFromEvent(moveEv);
      lastTimeMs = timeMs;
      updateTrimState(timeMs);
      if (pendingRaf !== null) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = null;
        if (lastTimeMs !== null) {
          emit("preview:clip-edge", { id, edge, timeMs: lastTimeMs });
        }
      });
    };

    const onPointerUp = (upEv: PointerEvent) => {
      isTrimming.value = false;
      activeTrimState.value = null;
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf);
        pendingRaf = null;
      }
      const finalTimeMs = lastTimeMs ?? getTimeMsFromEvent(upEv);
      emit("trim:clip-edge", { id, edge, timeMs: finalTimeMs });

      if (target.hasPointerCapture(upEv.pointerId)) {
        target.releasePointerCapture(upEv.pointerId);
      }
      target.removeEventListener("pointermove", onPointerMove as EventListener);
      target.removeEventListener("pointerup", onPointerUp as EventListener);
      target.removeEventListener("pointercancel", onPointerUp as EventListener);
    };

    target.addEventListener("pointermove", onPointerMove as EventListener);
    target.addEventListener("pointerup", onPointerUp as EventListener);
    target.addEventListener("pointercancel", onPointerUp as EventListener);
  };

  const beginMoveDrag = (
    e: PointerEvent,
    id: string,
    clipStartMs: number,
    clipEndMs: number,
  ) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(".trim-handle") ||
      target.closest(".camera-actions")
    ) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const clipDuration = clipEndMs - clipStartMs;
    const pointerTarget = e.currentTarget as HTMLElement;
    pointerTarget.setPointerCapture(e.pointerId);

    const getTimeMsFromEvent = (moveEv: PointerEvent) => {
      if (!ticksAreaRef.value || !props.duration) return 0;
      const rect = ticksAreaRef.value.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const mouseX = moveEv.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
      return Math.round(percentage * props.duration * 1000);
    };

    const initialMouseTimeMs = getTimeMsFromEvent(e);
    const mouseOffsetMs = initialMouseTimeMs - clipStartMs;

    let lastStartMs = clipStartMs;
    let pendingRaf: number | null = null;

    const onPointerMove = (moveEv: PointerEvent) => {
      const currentMouseTimeMs = getTimeMsFromEvent(moveEv);
      let newStartMs = currentMouseTimeMs - mouseOffsetMs;
      const maxStartMs = Math.max(0, Math.round(props.duration * 1000) - clipDuration);
      newStartMs = Math.max(0, Math.min(maxStartMs, newStartMs));
      const newEndMs = newStartMs + clipDuration;

      lastStartMs = newStartMs;

      if (pendingRaf !== null) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = null;
        emit("preview:move-clip", { id, startMs: newStartMs, endMs: newEndMs });
      });
    };

    const onPointerUp = (upEv: PointerEvent) => {
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf);
        pendingRaf = null;
      }
      const finalStartMs = lastStartMs;
      const finalEndMs = finalStartMs + clipDuration;
      emit("move:clip-position", { id, startMs: finalStartMs, endMs: finalEndMs });

      if (pointerTarget.hasPointerCapture(upEv.pointerId)) {
        pointerTarget.releasePointerCapture(upEv.pointerId);
      }
      pointerTarget.removeEventListener("pointermove", onPointerMove as EventListener);
      pointerTarget.removeEventListener("pointerup", onPointerUp as EventListener);
      pointerTarget.removeEventListener("pointercancel", onPointerUp as EventListener);
    };

    pointerTarget.addEventListener("pointermove", onPointerMove as EventListener);
    pointerTarget.addEventListener("pointerup", onPointerUp as EventListener);
    pointerTarget.addEventListener("pointercancel", onPointerUp as EventListener);
  };

  return {
    captionLayers,
    compositionVisualLayers,
    compositionAudioLayers,
    visualTrackOrder,
    visualTrackIndex,
    visualTrackStyle,
    compositionAudioBars,
    cameraLayers: cameraLayersResult,
    mainVideoLayer,
    baseVideoSegments,
    layerStyle,
    cutStyle,
    zoomElementStyle,
    tracksScrollRef,
    tracksViewportRef,
    ticksAreaRef,
    systemAudioBuffer,
    micAudioBuffer,
    hasSystemAudioTrack,
    hasMicrophoneTrack,
    systemBars,
    micBars,
    waveformStyle,
    compositionAudioBarHeight,
    visibleTimelineSeconds,
    visibleRulerSeconds,
    thumbnailStyle,
    thumbnailAtTimelineSecond,
    rulerMarkerStyle,
    cameraThumbnailSeconds,
    cameraThumbnailStyle,
    handleWheel,
    thumbnails,
    webcamThumbnails,
    tracksWidthStyle,
    playheadStyle,
    handleMouseDown,
    handleTrackClick,
    hoverZoomTimeMs,
    hoverCaptionTimeMs,
    onTrackMouseMove,
    onTrackMouseLeave,
    onScroll,
    beginTrimDrag,
    beginMoveDrag,
    activeTrimState,
    formatTrimTime,
  };
}
