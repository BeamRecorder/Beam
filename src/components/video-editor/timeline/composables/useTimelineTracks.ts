import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { ZoomElement } from "../../zoom/zoom-types";
import {
  isAudioClip,
  isCaptionClip,
  isVisualClip,
  type AudioClip,
  type CaptionClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from "../../composition/composition-types";
import { useCompositionAudioWaveforms } from "./useCompositionAudioWaveforms";
import { timelinePercentStyle, timelineRulerSecondsInView, timelineSecondsInView } from "./timeline-viewport";

export interface TimelineTracksProps {
  currentTime: number;
  duration: number;
  zoomLevel: number;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ClipComposition;
  selectedClipId: string | null;
}

export type TimelineTracksEmit = (event: string, ...args: unknown[]) => void;
const DEFAULT_ZOOM_DURATION_MS = 1_200;
const DEFAULT_CAPTION_DURATION_MS = 2_000;
const MIN_DURATION_MS = 40;

export function useTimelineTracks(props: TimelineTracksProps, emit: TimelineTracksEmit) {
  const orderedClips = computed(() => [...props.composition.clips].sort((left, right) => left.order - right.order));
  const assets = computed(() => new Map(props.composition.assets.map((asset) => [asset.id, asset])));
  const assetFor = (clip: Clip): MediaAsset | null => clip.kind === "caption" ? null : assets.value.get(clip.assetId) ?? null;
  const screenClips = computed(() => orderedClips.value.filter((clip): clip is VisualClip => clip.kind === "screen"));
  const webcamClips = computed(() => orderedClips.value.filter((clip): clip is VisualClip => clip.kind === "webcam"));
  const visualClips = computed(() => orderedClips.value.filter((clip): clip is VisualClip => isVisualClip(clip) && clip.kind !== "screen" && clip.kind !== "webcam"));
  const captionClips = computed(() => orderedClips.value.filter(isCaptionClip));
  const systemAudioClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "system"));
  const microphoneClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "microphone"));
  const importedAudioClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "imported"));
  const { bars: audioBars } = useCompositionAudioWaveforms(() => props.composition, () => props.duration);

  const visualTracks = computed(() => {
    const tracks: Array<{ id: string; order: number }> = [];
    const screen = screenClips.value[0];
    if (screen) tracks.push({ id: "screen", order: screen.order });
    for (const clip of visualClips.value) tracks.push({ id: clip.id, order: clip.order });
    const webcam = webcamClips.value[0];
    if (webcam) tracks.push({ id: "webcam", order: webcam.order });
    return tracks.sort((left, right) => left.order - right.order);
  });
  const visualTrackIndex = (id: string) => visualTracks.value.findIndex((track) => track.id === id);
  const visualTrackStyle = (id: string) => ({ order: Math.max(0, visualTrackIndex(id)) });

  const tracksScrollRef = ref<HTMLDivElement | null>(null);
  const tracksViewportRef = ref<HTMLDivElement | null>(null);
  const ticksAreaRef = ref<HTMLDivElement | null>(null);
  const visibleStartSecond = ref(0);
  const visibleEndSecond = ref(60);
  const visibleTimelineSeconds = computed(() => timelineSecondsInView(props.duration, visibleStartSecond.value, visibleEndSecond.value, 3));
  const visibleRulerSeconds = computed(() => timelineRulerSecondsInView(props.duration, visibleTimelineSeconds.value));
  const tracksWidthStyle = computed(() => ({ width: `calc(${props.zoomLevel}% + 230px)`, minWidth: "calc(100% + 230px)" }));
  const layerStyle = (startMs: number, endMs: number) => ({
    left: `${props.duration > 0 ? startMs / (props.duration * 10) : 0}%`,
    width: `${props.duration > 0 ? Math.max(0, endMs - startMs) / (props.duration * 10) : 0}%`,
  });
  const zoomElementStyle = (element: ZoomElement) => layerStyle(element.startMs, element.endMs);
  const thumbnailStyle = (second: number) => timelinePercentStyle(props.duration, second);
  const rulerMarkerStyle = (second: number) => ({ left: timelinePercentStyle(props.duration, second).left });
  const ticksAreaWidth = ref(0);
  const playheadStyle = computed(() => ({ transform: `translate3d(${(props.duration > 0 ? props.currentTime / props.duration : 0) * ticksAreaWidth.value}px, 0, 0)` }));

  const timeAt = (clientX: number) => {
    const area = ticksAreaRef.value;
    if (!area || props.duration <= 0) return 0;
    const rect = area.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * props.duration * 1_000);
  };
  let scrubbing = false;
  const scrub = (clientX: number) => emit("update:currentTime", timeAt(clientX) / 1_000);
  const handleMouseMove = (event: MouseEvent) => { if (scrubbing) scrub(event.clientX); };
  const handleMouseUp = () => {
    scrubbing = false;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };
  const handleMouseDown = (event: MouseEvent) => {
    scrubbing = true;
    scrub(event.clientX);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };
  const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    emit("update:zoomLevel", Math.max(100, Math.min(500, props.zoomLevel + (event.deltaY < 0 ? 15 : -15))));
  };

  const updateVisibleRange = () => {
    const scroll = tracksScrollRef.value;
    const area = ticksAreaRef.value;
    if (!scroll || !area || props.duration <= 0) return;
    const timelineLeft = 200;
    const startPixel = Math.max(0, scroll.scrollLeft - timelineLeft);
    const endPixel = Math.max(0, scroll.scrollLeft + scroll.clientWidth - timelineLeft);
    visibleStartSecond.value = startPixel / Math.max(1, area.clientWidth) * props.duration;
    visibleEndSecond.value = endPixel / Math.max(1, area.clientWidth) * props.duration;
  };
  let scrollFrame: number | null = null;
  const onScroll = () => {
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = null; updateVisibleRange(); });
  };
  let resizeObserver: ResizeObserver | null = null;
  onMounted(() => {
    updateVisibleRange();
    if (ticksAreaRef.value) {
      const updateWidth = () => { ticksAreaWidth.value = ticksAreaRef.value?.clientWidth ?? 0; updateVisibleRange(); };
      resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(ticksAreaRef.value);
      updateWidth();
    }
    if (tracksScrollRef.value) tracksScrollRef.value.scrollLeft = 80;
  });
  onUnmounted(() => {
    resizeObserver?.disconnect();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    handleMouseUp();
  });
  watch(() => [props.zoomLevel, props.duration], () => requestAnimationFrame(updateVisibleRange));
  watch(() => props.currentTime, (time) => {
    const scroll = tracksScrollRef.value;
    const area = ticksAreaRef.value;
    if (!scroll || !area || scrubbing || props.duration <= 0) return;
    const playheadX = 120 + time / props.duration * area.clientWidth;
    const left = scroll.scrollLeft + 80;
    const right = scroll.scrollLeft + scroll.clientWidth - 80;
    if (playheadX < left || playheadX > right) scroll.scrollTo({ left: playheadX - scroll.clientWidth / 2, behavior: "smooth" });
  });

  const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
  const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
  const activeTrimState = ref<{ id: string; edge: "start" | "end"; durationMs: number } | null>(null);
  const displayedClip = <T extends Clip>(clip: T): T => {
    const preview = clipPreview.value[clip.id];
    return preview ? { ...clip, timelineStartMs: preview.startMs, timelineDurationMs: preview.durationMs } : clip;
  };
  const displayedZoom = (zoom: ZoomElement): ZoomElement => {
    const preview = zoomPreview.value[zoom.id];
    return preview ? { ...zoom, startMs: preview.startMs, endMs: preview.endMs } : zoom;
  };
  const trimStateFor = (id: string) => activeTrimState.value?.id === id ? activeTrimState.value : null;
  const clearClipPreview = (id: string) => {
    const next = { ...clipPreview.value };
    delete next[id];
    clipPreview.value = next;
  };
  const clearZoomPreview = (id: string) => {
    const next = { ...zoomPreview.value };
    delete next[id];
    zoomPreview.value = next;
  };

  const beginClipMove = (event: PointerEvent, clip: Clip) => {
    if ((event.target as HTMLElement).closest(".trim-handle")) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerStartMs = timeAt(event.clientX);
    const originalStartMs = clip.timelineStartMs;
    const maximumStartMs = Math.max(0, Math.round(props.duration * 1_000) - clip.timelineDurationMs);
    let finalStartMs = originalStartMs;
    const move = (next: PointerEvent) => {
      finalStartMs = Math.max(0, Math.min(maximumStartMs, originalStartMs + timeAt(next.clientX) - pointerStartMs));
      clipPreview.value = { ...clipPreview.value, [clip.id]: { startMs: finalStartMs, durationMs: clip.timelineDurationMs } };
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      clearClipPreview(clip.id);
      if (finalStartMs !== originalStartMs) emit("move:clip", { id: clip.id, startMs: finalStartMs });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginClipTrim = (event: PointerEvent, clip: Clip, edge: "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    const originalStartMs = clip.timelineStartMs;
    const originalEndMs = clip.timelineStartMs + clip.timelineDurationMs;
    let finalTimeMs = edge === "start" ? originalStartMs : originalEndMs;
    const move = (next: PointerEvent) => {
      const raw = timeAt(next.clientX);
      finalTimeMs = edge === "start"
        ? Math.max(0, Math.min(originalEndMs - MIN_DURATION_MS, raw))
        : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(Math.round(props.duration * 1_000), raw));
      const startMs = edge === "start" ? finalTimeMs : originalStartMs;
      const endMs = edge === "end" ? finalTimeMs : originalEndMs;
      clipPreview.value = { ...clipPreview.value, [clip.id]: { startMs, durationMs: endMs - startMs } };
      activeTrimState.value = { id: clip.id, edge, durationMs: endMs - startMs };
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      clearClipPreview(clip.id);
      activeTrimState.value = null;
      const original = edge === "start" ? originalStartMs : originalEndMs;
      if (finalTimeMs !== original) emit("trim:clip", { id: clip.id, edge, timeMs: finalTimeMs });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
    if ((event.target as HTMLElement).closest(".trim-handle")) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerStartMs = timeAt(event.clientX);
    const durationMs = zoom.endMs - zoom.startMs;
    const maximumStartMs = Math.max(0, Math.round(props.duration * 1_000) - durationMs);
    let finalStartMs = zoom.startMs;
    const move = (next: PointerEvent) => {
      finalStartMs = Math.max(0, Math.min(maximumStartMs, zoom.startMs + timeAt(next.clientX) - pointerStartMs));
      zoomPreview.value = { ...zoomPreview.value, [zoom.id]: { startMs: finalStartMs, endMs: finalStartMs + durationMs } };
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      clearZoomPreview(zoom.id);
      if (finalStartMs !== zoom.startMs) emit("move:zoom", { id: zoom.id, startMs: finalStartMs, endMs: finalStartMs + durationMs });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginZoomTrim = (event: PointerEvent, zoom: ZoomElement, edge: "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    let finalTimeMs = edge === "start" ? zoom.startMs : zoom.endMs;
    const move = (next: PointerEvent) => {
      finalTimeMs = edge === "start"
        ? Math.max(0, Math.min(zoom.endMs - 200, timeAt(next.clientX)))
        : Math.max(zoom.startMs + 200, Math.min(Math.round(props.duration * 1_000), timeAt(next.clientX)));
      const startMs = edge === "start" ? finalTimeMs : zoom.startMs;
      const endMs = edge === "end" ? finalTimeMs : zoom.endMs;
      zoomPreview.value = { ...zoomPreview.value, [zoom.id]: { startMs, endMs } };
      activeTrimState.value = { id: zoom.id, edge, durationMs: endMs - startMs };
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      clearZoomPreview(zoom.id);
      activeTrimState.value = null;
      const original = edge === "start" ? zoom.startMs : zoom.endMs;
      if (finalTimeMs !== original) emit("trim:zoom", { id: zoom.id, edge, timeMs: finalTimeMs });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const hoverZoomTimeMs = ref<number | null>(null);
  const hoverCaptionTimeMs = ref<number | null>(null);
  const overlaps = (startMs: number, endMs: number, ranges: Array<{ startMs: number; endMs: number }>) => ranges.some((range) => range.startMs < endMs && range.endMs > startMs);
  const captionRanges = computed(() => captionClips.value.map((clip) => ({ startMs: clip.timelineStartMs, endMs: clip.timelineStartMs + clip.timelineDurationMs })));
  const zoomRanges = computed(() => props.zoomElements.map((zoom) => ({ startMs: zoom.startMs, endMs: zoom.endMs })));
  const onTrackMouseMove = (event: MouseEvent, action: "zoom" | "caption") => {
    const timeMs = timeAt(event.clientX);
    if (action === "zoom") hoverZoomTimeMs.value = overlaps(timeMs, timeMs + DEFAULT_ZOOM_DURATION_MS, zoomRanges.value) ? null : timeMs;
    else hoverCaptionTimeMs.value = overlaps(timeMs, timeMs + DEFAULT_CAPTION_DURATION_MS, captionRanges.value) ? null : timeMs;
  };
  const onTrackMouseLeave = (action: "zoom" | "caption") => {
    if (action === "zoom") hoverZoomTimeMs.value = null;
    else hoverCaptionTimeMs.value = null;
  };
  const handleTrackClick = (event: MouseEvent, action: "zoom" | "caption") => {
    const timeMs = timeAt(event.clientX);
    if (action === "zoom") {
      if (!overlaps(timeMs, timeMs + DEFAULT_ZOOM_DURATION_MS, zoomRanges.value)) emit("add:zoom", timeMs);
    } else if (!overlaps(timeMs, timeMs + DEFAULT_CAPTION_DURATION_MS, captionRanges.value)) emit("add:caption", timeMs);
  };

  return {
    screenClips,
    webcamClips,
    visualClips,
    captionClips,
    systemAudioClips,
    microphoneClips,
    importedAudioClips,
    audioBars,
    assetFor,
    visualTrackIndex,
    visualTrackStyle,
    tracksScrollRef,
    tracksViewportRef,
    ticksAreaRef,
    visibleTimelineSeconds,
    visibleRulerSeconds,
    tracksWidthStyle,
    layerStyle,
    zoomElementStyle,
    thumbnailStyle,
    rulerMarkerStyle,
    playheadStyle,
    handleMouseDown,
    handleWheel,
    onScroll,
    displayedClip,
    displayedZoom,
    trimStateFor,
    beginClipMove,
    beginClipTrim,
    beginZoomMove,
    beginZoomTrim,
    hoverZoomTimeMs,
    hoverCaptionTimeMs,
    onTrackMouseMove,
    onTrackMouseLeave,
    handleTrackClick,
  };
}
