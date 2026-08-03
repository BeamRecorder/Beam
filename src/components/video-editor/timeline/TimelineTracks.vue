<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  Camera,
  GripVertical,
  Image as ImageIcon,
  Mic,
  MousePointer,
  Sparkles,
  Type,
  Video,
  Volume2,
} from "@lucide/vue";
import type { ExportProgress } from "../../export/export-types";
import type { ZoomElement } from "../zoom/zoom-types";
import {
  isAudioClip,
  isCaptionClip,
  isVisualClip,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type VisualClip,
} from "../composition/composition-types";
import TimelineClip from "./TimelineClip.vue";
import { useCompositionAudioWaveforms } from "./composables/useCompositionAudioWaveforms";
import { useTranslate } from "~/i18n/useTranslate";
import {
  calculateSnapThresholdMs,
  collectSnapTargets,
  snapSpan,
  snapValue,
} from "./composables/timeline-snap";

const { t } = useTranslate("TimelineTracks");
const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    zoomLevel: number;
    exportProgress?: ExportProgress | null;
    zoomElements: ZoomElement[];
    selectedZoomId: string | null;
    composition: ClipComposition;
    selectedClipId: string | null;
    isSnappingEnabled?: boolean;
  }>(),
  { isSnappingEnabled: true },
);
const emit = defineEmits<{
  (event: "update:currentTime", value: number): void;
  (event: "update:zoomLevel", value: number): void;
  (event: "select:zoom", zoomId: string): void;
  (event: "select:clip", clipId: string): void;
  (event: "toggle:clip", clipId: string): void;
  (event: "trim:clip", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "move:clip", payload: { id: string; startMs: number }): void;
  (event: "trim:zoom", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "move:zoom", payload: { id: string; startMs: number; endMs: number }): void;
  (event: "add:zoom", timeMs: number): void;
  (event: "add:caption", timeMs: number): void;
  (event: "reorder:clip", payload: { id: string; targetIndex: number }): void;
}>();

const DEFAULT_ZOOM_DURATION_MS = 1_200;
const DEFAULT_CAPTION_DURATION_MS = 2_000;
const MIN_DURATION_MS = 40;
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
const systemAudioClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "system"));
const microphoneClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "microphone"));
const importedAudioClips = computed(() => orderedClips.value.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.role === "imported"));
const assets = computed(() => new Map(props.composition.assets.map((asset) => [asset.id, asset])));
const assetFor = (clip: Clip) => isCaptionClip(clip) ? null : assets.value.get(clip.assetId) ?? null;
const { bars: audioBars } = useCompositionAudioWaveforms(() => props.composition, () => props.duration);

const tracksScrollRef = ref<HTMLDivElement | null>(null);
const tracksViewportRef = ref<HTMLDivElement | null>(null);
const ticksAreaRef = ref<HTMLDivElement | null>(null);
const rulerWidth = ref(0);
const tracksWidthStyle = computed(() => ({
  width: `calc(${props.zoomLevel}% + 230px)`,
  minWidth: "calc(100% + 230px)",
}));
const scrubPreviewTime = ref<number | null>(null);
const displayedPlayheadTime = computed(() => scrubPreviewTime.value ?? props.currentTime);
const playheadStyle = computed(() => ({ left: `${props.duration > 0 ? displayedPlayheadTime.value / props.duration * 100 : 0}%` }));
const rulerLabelStep = computed(() => {
  const pixelsPerSecond = rulerWidth.value / Math.max(1, props.duration);
  return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => step * pixelsPerSecond >= 68) ?? 600;
});
const rulerTickStep = computed(() => rulerLabelStep.value <= 5 ? 1 : rulerLabelStep.value / 5);
const rulerSeconds = computed(() => {
  const result: number[] = [];
  for (let second = 0; second <= Math.ceil(props.duration); second += rulerTickStep.value) result.push(second);
  return result;
});
const rulerMarkerStyle = (second: number) => ({ left: `${second / Math.max(1, props.duration) * 100}%` });
const isRulerLabel = (second: number) => second % rulerLabelStep.value === 0;
const formatRulerLabel = (second: number) => second < 60
  ? `${second}s`
  : `${Math.floor(second / 60)}:${(second % 60).toString().padStart(2, "0")}`;

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
  visibleStartSecond.value = startPixel / Math.max(1, ticks.clientWidth) * props.duration;
  visibleEndSecond.value = endPixel / Math.max(1, ticks.clientWidth) * props.duration;
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
  left: `${startMs / durationMs.value * 100}%`,
  width: `${lengthMs / durationMs.value * 100}%`,
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
const emitScrub = (timeMs: number) => emit("update:currentTime", timeMs / 1_000);
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
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    flushScrubAt(next.clientX);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
};
const handleWheel = (event: WheelEvent) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  emit("update:zoomLevel", Math.max(100, Math.min(500, props.zoomLevel + (event.deltaY < 0 ? 15 : -15))));
};

const clipPreview = ref<Record<string, { startMs: number; durationMs: number }>>({});
const zoomPreview = ref<Record<string, { startMs: number; endMs: number }>>({});
const activeTrimState = ref<{ ids: string[]; edge: "start" | "end"; durationMs: number } | null>(null);
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
const linkedIdsFor = (clip: Clip) => clip.groupId
  ? props.composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id)
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
  if ((event.target as HTMLElement).closest(".trim-handle")) return;
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
    const proposedStartMs = Math.max(0, Math.min(maxStartMs, originalStartMs + timeAt(next.clientX) - pointerStartMs));
    const snap = props.isSnappingEnabled !== false ? snapSpan(proposedStartMs, clipLengthMs, snapTargets, snapThresholdMs) : null;
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
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    clearLinkedPreview(ids);
    movingClipIds.value = [];
    activeSnapTimeMs.value = null;
    if (finalStartMs !== originalStartMs) emit("move:clip", { id: clip.id, startMs: finalStartMs });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
};
const beginClipTrim = (event: PointerEvent, clip: Clip, edge: "start" | "end") => {
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

  let finalTimeMs = edge === "start" ? originalStartMs : originalEndMs;
  const move = (next: PointerEvent) => {
    const raw = timeAt(next.clientX);
    let proposedTimeMs = edge === "start"
      ? Math.max(0, Math.min(originalEndMs - MIN_DURATION_MS, raw))
      : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(durationMs.value, raw));

    const snap = props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
    if (snap) {
      proposedTimeMs = edge === "start"
        ? Math.max(0, Math.min(originalEndMs - MIN_DURATION_MS, snap.snappedValueMs))
        : Math.max(originalStartMs + MIN_DURATION_MS, Math.min(durationMs.value, snap.snappedValueMs));
      activeSnapTimeMs.value = snap.targetMs;
    } else {
      activeSnapTimeMs.value = null;
    }

    finalTimeMs = proposedTimeMs;
    const startMs = edge === "start" ? finalTimeMs : originalStartMs;
    const endMs = edge === "end" ? finalTimeMs : originalEndMs;
    previewLinked(ids, startMs, endMs - startMs);
    activeTrimState.value = { ids, edge, durationMs: endMs - startMs };
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    clearLinkedPreview(ids);
    activeTrimState.value = null;
    activeSnapTimeMs.value = null;
    const original = edge === "start" ? originalStartMs : originalEndMs;
    if (finalTimeMs !== original) emit("trim:clip", { id: clip.id, edge, timeMs: finalTimeMs });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
};

const beginZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
  if ((event.target as HTMLElement).closest(".trim-handle")) return;
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
    const snap = props.isSnappingEnabled !== false ? snapSpan(proposedStartMs, lengthMs, snapTargets, snapThresholdMs) : null;
    if (snap) {
      finalStartMs = Math.max(0, Math.min(maxStartMs, snap.snappedStartMs));
      activeSnapTimeMs.value = snap.targetMs;
    } else {
      finalStartMs = proposedStartMs;
      activeSnapTimeMs.value = null;
    }
    zoomPreview.value = { ...zoomPreview.value, [zoom.id]: { startMs: finalStartMs, endMs: finalStartMs + lengthMs } };
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    const next = { ...zoomPreview.value };
    delete next[zoom.id];
    zoomPreview.value = next;
    activeSnapTimeMs.value = null;
    if (finalStartMs !== zoom.startMs) emit("move:zoom", { id: zoom.id, startMs: finalStartMs, endMs: finalStartMs + lengthMs });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
};
const beginZoomTrim = (event: PointerEvent, zoom: ZoomElement, edge: "start" | "end") => {
  event.preventDefault();
  event.stopPropagation();
  let finalTimeMs = edge === "start" ? zoom.startMs : zoom.endMs;
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
    let proposedTimeMs = edge === "start"
      ? Math.max(0, Math.min(zoom.endMs - MIN_DURATION_MS, raw))
      : Math.max(zoom.startMs + MIN_DURATION_MS, Math.min(durationMs.value, raw));

    const snap = props.isSnappingEnabled !== false ? snapValue(proposedTimeMs, snapTargets, snapThresholdMs) : null;
    if (snap) {
      proposedTimeMs = edge === "start"
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
        startMs: edge === "start" ? finalTimeMs : zoom.startMs,
        endMs: edge === "end" ? finalTimeMs : zoom.endMs,
      },
    };
    activeTrimState.value = { ids: [zoom.id], edge, durationMs: (edge === "end" ? finalTimeMs : zoom.endMs) - (edge === "start" ? finalTimeMs : zoom.startMs) };
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    const next = { ...zoomPreview.value };
    delete next[zoom.id];
    zoomPreview.value = next;
    activeTrimState.value = null;
    activeSnapTimeMs.value = null;
    const original = edge === "start" ? zoom.startMs : zoom.endMs;
    if (finalTimeMs !== original) emit("trim:zoom", { id: zoom.id, edge, timeMs: finalTimeMs });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
};

const hoverZoomTimeMs = ref<number | null>(null);
const hoverCaptionTimeMs = ref<number | null>(null);
const occupied = (startMs: number, endMs: number, intervals: Array<{ startMs: number; endMs: number }>) =>
  intervals.some((interval) => interval.startMs < endMs && interval.endMs > startMs);
const hoverAt = (event: MouseEvent, kind: "zoom" | "caption") => {
  if (kind === "zoom") {
    const startMs = centeredStartAt(event.clientX, DEFAULT_ZOOM_DURATION_MS);
    hoverZoomTimeMs.value = occupied(startMs, startMs + DEFAULT_ZOOM_DURATION_MS, props.zoomElements) ? null : startMs;
    return;
  }
  const startMs = centeredStartAt(event.clientX, DEFAULT_CAPTION_DURATION_MS);
  const captions = captionClips.value.map((clip) => ({ startMs: clip.timelineStartMs, endMs: clip.timelineStartMs + clip.timelineDurationMs }));
  hoverCaptionTimeMs.value = occupied(startMs, startMs + DEFAULT_CAPTION_DURATION_MS, captions) ? null : startMs;
};
const leaveTrack = (kind: "zoom" | "caption") => {
  if (kind === "zoom") hoverZoomTimeMs.value = null;
  else hoverCaptionTimeMs.value = null;
};
const addAt = (event: MouseEvent, kind: "zoom" | "caption") => {
  event.preventDefault();
  event.stopPropagation();
  if (kind === "zoom") {
    const startMs = centeredStartAt(event.clientX, DEFAULT_ZOOM_DURATION_MS);
    if (!occupied(startMs, startMs + DEFAULT_ZOOM_DURATION_MS, props.zoomElements)) emit("add:zoom", startMs);
    return;
  }
  const startMs = centeredStartAt(event.clientX, DEFAULT_CAPTION_DURATION_MS);
  const captions = captionClips.value.map((clip) => ({ startMs: clip.timelineStartMs, endMs: clip.timelineStartMs + clip.timelineDurationMs }));
  if (!occupied(startMs, startMs + DEFAULT_CAPTION_DURATION_MS, captions)) emit("add:caption", startMs);
};

const toggleGroup = (clips: Clip[]) => {
  const enabled = !clips.some((clip) => clip.enabled);
  for (const clip of clips) if (clip.enabled !== enabled) emit("toggle:clip", clip.id);
};
const iconForVisual = (clip: VisualClip) => clip.kind === "image" ? ImageIcon : clip.kind === "webcam" ? Camera : Video;
const labelForVisual = (clip: VisualClip) => clip.kind === "screen" ? t("video") : clip.kind === "webcam" ? t("webcam") : clip.name;
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
    const row = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>(".visual-track");
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
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    const finalIndex = visualOrderPreview.value?.indexOf(clipId) ?? initialIndex;
    if (finalIndex !== initialIndex) emit("reorder:clip", { id: clipId, targetIndex: finalIndex });
    requestAnimationFrame(() => {
      visualOrderPreview.value = null;
      draggedClipId.value = null;
    });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
};
</script>

<template>
  <div ref="tracksScrollRef" class="timeline-tracks-container" @scroll="onScroll" @wheel="handleWheel">
    <div ref="tracksViewportRef" class="timeline-viewport" :style="tracksWidthStyle">
      <div class="timeline-ruler">
        <div class="ruler-info-spacer" />
        <div ref="ticksAreaRef" class="ruler-ticks-area" @pointerdown="beginScrub">
          <div
            v-if="exportProgress && exportProgress.totalTimeMs > 0"
            class="ruler-export-progress-bar"
            :style="{ width: `${Math.min(100, Math.max(0, exportProgress.currentTimeMs / exportProgress.totalTimeMs * 100))}%` }"
          />
          <div
            v-for="second in rulerSeconds"
            :key="second"
            class="ruler-marker"
            :class="{ 'is-major': isRulerLabel(second) }"
            :style="rulerMarkerStyle(second)"
          >
            <span v-if="isRulerLabel(second)" class="marker-label">{{ formatRulerLabel(second) }}</span>
            <span class="marker-tick" />
          </div>
          <div class="timeline-playhead" :style="playheadStyle">
            <div class="playhead-head">
              <svg width="12" height="15" viewBox="0 0 12 15" fill="var(--color-primary)">
                <path d="M0 2C0 0.89543 0.895431 0 2 0H10C11.1046 0 12 0.89543 12 2V7.5C12 8.02701 11.7919 8.53272 11.4216 8.90566L6.5 14.8596L1.57841 8.90566C1.20814 8.53272 1 8.02701 1 7.5V2Z" />
              </svg>
            </div>
          </div>
          <div
            v-if="activeSnapTimeMs !== null"
            class="timeline-snap-guide"
            :style="{ left: `${durationMs > 0 ? (activeSnapTimeMs / durationMs) * 100 : 0}%` }"
          >
            <span class="snap-guide-badge">{{ (activeSnapTimeMs / 1000).toFixed(2) }}s</span>
          </div>
        </div>
      </div>

      <div class="tracks-stack">
        <div
          v-for="clip in visualClips"
          :key="clip.id"
          class="track-row visual-track"
          :data-clip-id="clip.id"
          :class="{ disabled: !clip.enabled, dragging: draggedClipId === clip.id }"
        >
          <button type="button" class="track-info" :title="clip.name" @click="emit('toggle:clip', clip.id)">
            <span class="track-drag-handle" @click.stop @pointerdown.stop="beginReorder($event, clip.id)">
              <GripVertical class="track-grip" />
            </span>
            <component :is="iconForVisual(clip)" class="track-icon" />
            <span class="track-title">{{ labelForVisual(clip) }}</span>
          </button>
          <div class="track-content visual-content">
            <TimelineClip
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :visible-seconds="visibleSeconds"
              :selected="selectedClipId === clip.id"
              :trim-state="trimStateFor(clip.id)"
              :defer-thumbnail-requests="movingClipIds.includes(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div class="track-row cursor-track">
          <div class="track-info static-info"><MousePointer class="track-icon" /><span class="track-title">{{ t('zooms') }}</span></div>
          <div class="track-content cursor-content" :title="t('clickToAddZoom')" @pointerdown.stop @mousemove="hoverAt($event, 'zoom')" @mouseleave="leaveTrack('zoom')" @click.stop="addAt($event, 'zoom')">
            <div v-if="hoverZoomTimeMs !== null" class="cursor-zoom-indicator preview-ghost" :style="percentageStyle(hoverZoomTimeMs, DEFAULT_ZOOM_DURATION_MS)">{{ t('addZoom') }}</div>
            <button
              v-for="zoom in zoomElements"
              :key="zoom.id"
              type="button"
              class="cursor-zoom-indicator"
              :class="{ selected: selectedZoomId === zoom.id }"
              :style="percentageStyle(displayedZoom(zoom).startMs, displayedZoom(zoom).endMs - displayedZoom(zoom).startMs)"
              @click.stop="emit('select:zoom', zoom.id)"
              @pointerdown="beginZoomMove($event, zoom)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginZoomTrim($event, zoom, 'start')">
                <span v-if="trimStateFor(zoom.id)?.edge === 'start'" class="trim-side-badge">{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span>
              </span>
              <span class="clip-center-title">{{ zoomScale(zoom.depth).toFixed(2) }}×</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginZoomTrim($event, zoom, 'end')">
                <span v-if="trimStateFor(zoom.id)?.edge === 'end'" class="trim-side-badge">{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span>
              </span>
            </button>
          </div>
        </div>

        <div class="track-row annotation-track">
          <div class="track-info static-info"><Type class="track-icon" /><span class="track-title">{{ t('captions') }}</span></div>
          <div class="track-content annotation-content" :title="t('clickToAddCaption')" @pointerdown.stop @mousemove="hoverAt($event, 'caption')" @mouseleave="leaveTrack('caption')" @click.stop="addAt($event, 'caption')">
            <div v-if="hoverCaptionTimeMs !== null" class="annotation-indicator preview-ghost" :style="percentageStyle(hoverCaptionTimeMs, DEFAULT_CAPTION_DURATION_MS)">{{ t('addCaption') }}</div>
            <button
              v-for="clip in captionClips"
              :key="clip.id"
              type="button"
              class="annotation-indicator"
              :class="{ selected: selectedClipId === clip.id, disabled: !clip.enabled }"
              :style="percentageStyle(displayedClip(clip).timelineStartMs, displayedClip(clip).timelineDurationMs)"
              @click.stop="emit('select:clip', clip.id)"
              @pointerdown="beginClipMove($event, clip)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginClipTrim($event, clip, 'start')">
                <span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">{{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s</span>
              </span>
              <span class="clip-center-title"><Sparkles v-if="clip.isAiGenerated" :size="11" />{{ clip.name }}</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')">
                <span v-if="trimStateFor(clip.id)?.edge === 'end'" class="trim-side-badge">{{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s</span>
              </span>
            </button>
          </div>
        </div>

        <div v-if="systemAudioClips.length" class="track-row audio-track" :class="{ disabled: !systemAudioClips.some((clip) => clip.enabled) }">
          <button type="button" class="track-info" @click="toggleGroup(systemAudioClips)"><Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span></button>
          <div class="track-content audio-content">
            <TimelineClip
              v-for="clip in systemAudioClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :visible-seconds="visibleSeconds"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioBars[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div v-if="microphoneClips.length" class="track-row audio-track" :class="{ disabled: !microphoneClips.some((clip) => clip.enabled) }">
          <button type="button" class="track-info" @click="toggleGroup(microphoneClips)"><Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span></button>
          <div class="track-content audio-content">
            <TimelineClip
              v-for="clip in microphoneClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :visible-seconds="visibleSeconds"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioBars[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div v-for="clip in importedAudioClips" :key="clip.id" class="track-row audio-track" :class="{ disabled: !clip.enabled }">
          <button type="button" class="track-info" @click="emit('toggle:clip', clip.id)"><Volume2 class="track-icon" /><span class="track-title">{{ clip.name }}</span></button>
          <div class="track-content audio-content">
            <TimelineClip
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :visible-seconds="visibleSeconds"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioBars[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container { width: 100%; overflow-x: auto; overflow-y: hidden; border-radius: inherit; position: relative; user-select: none; }
.timeline-viewport { position: relative; display: flex; flex-direction: column; min-height: 100%; }
.timeline-ruler { height: 28px; display: flex; background: var(--color-bg-element); border-bottom: 1px solid var(--color-border); }
.ruler-info-spacer { width: 120px; flex: 0 0 120px; border-right: 1px solid var(--color-border); background: var(--color-bg-surface); }
.ruler-ticks-area { flex: 1; position: relative; height: 100%; margin-left: 80px; margin-right: 150px; cursor: ew-resize; }
.ruler-export-progress-bar { position: absolute; inset: 0 auto 0 0; background: rgba(255,90,31,.25); border-right: 2px solid var(--color-primary); pointer-events: none; z-index: 4; }
.ruler-marker { position: absolute; inset-block: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.marker-label { position: absolute; top: 4px; font-size: 8px; font-weight: 700; color: var(--text-muted); font-family: monospace; }
.marker-tick { width: 1px; height: 6px; background: var(--color-border-strong); }.is-major .marker-tick { height: 10px; background: var(--color-border-dark); }
.timeline-playhead { position: absolute; top: 0; left: 0; width: 2px; height: 600px; background: var(--color-primary); z-index: 100; pointer-events: none; }
.playhead-head { position: absolute; top: -3px; left: -5px; width: 12px; height: 15px; color: var(--color-primary); filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3)); z-index: 101; }
.timeline-snap-guide { position: absolute; top: 0; width: 2px; height: 600px; background: var(--color-primary); box-shadow: 0 0 10px var(--color-primary); z-index: 200; pointer-events: none; }
.snap-guide-badge { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); padding: 2px 6px; border-radius: var(--radius-sm); background: var(--color-primary); color: #ffffff; font-size: 9px; font-weight: 800; font-family: monospace; white-space: nowrap; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); z-index: 201; }
.tracks-stack { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; }
.track-row { display: flex; align-items: center; height: 32px; position: relative; background: var(--color-bg-element); border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.track-row.audio-track { height: 48px; }
.track-row.disabled { opacity: .35; }.track-row.dragging { opacity: .55; }
.track-info { width: 120px; height: 100%; flex: 0 0 120px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 0; border-right: 1px solid var(--color-border); background: var(--color-bg-surface); color: var(--text-secondary); cursor: pointer; text-align: left; }
.track-info:hover { background: var(--color-bg-surface-hover); }.static-info { cursor: default; }
.track-icon { width: 13px; height: 13px; flex: 0 0 auto; }.track-grip { width: 13px; height: 13px; color: var(--text-muted); }
.track-drag-handle { display: inline-flex; width: 24px; height: 100%; margin-left: -5px; align-items: center; justify-content: center; cursor: grab; touch-action: none; }
.track-drag-handle:active { cursor: grabbing; }
.track-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.track-content { flex: 1; height: 100%; position: relative; overflow: hidden; margin-left: 80px; margin-right: 150px; }
.visual-content { background: var(--color-track-video-light); }.cursor-content { background: var(--color-track-cursor-light); }.annotation-content { background: var(--color-track-annotation-light); }.audio-content { background: var(--color-track-audio-light); }
.cursor-zoom-indicator, .annotation-indicator { position: absolute; top: 4px; height: 24px; display: flex; align-items: center; justify-content: center; padding: 0 6px; border: 1px solid transparent; border-radius: var(--radius-sm); color: #fff; font-size: 8px; font-weight: 700; cursor: grab; box-shadow: var(--shadow-sm); transition: transform .15s ease, border-color .15s ease; overflow: visible; }
.cursor-zoom-indicator { background: var(--color-track-cursor); }.annotation-indicator { background: var(--color-track-annotation); }
.cursor-zoom-indicator:hover, .annotation-indicator:hover { transform: translateY(-1px); border-color: #fff; }.cursor-zoom-indicator.selected, .annotation-indicator.selected { outline: 2px solid var(--color-primary); }.annotation-indicator.disabled { opacity: .42; }
.preview-ghost { opacity: .65; border: 1.5px dashed var(--color-primary) !important; pointer-events: none; z-index: 8; box-shadow: 0 0 8px rgba(255,90,31,.3); animation: pulse-ghost 1.2s infinite alternate ease-in-out; }
@keyframes pulse-ghost { from { opacity: .45; } to { opacity: .85; } }
.trim-handle { position: absolute; top: 0; bottom: 0; width: 6px; z-index: 20; cursor: col-resize; background: rgba(255,255,255,.25); transition: background var(--fast) ease; }.trim-handle:hover { background: var(--color-primary); }.trim-handle.start { left: 0; }.trim-handle.end { right: 0; }
.trim-side-badge { position: absolute; top: 50%; transform: translateY(-50%); padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 800; font-family: monospace; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.3); }.trim-handle.start .trim-side-badge { left: 8px; }.trim-handle.end .trim-side-badge { right: 8px; }
.clip-center-title { display: inline-flex; align-items: center; gap: 4px; pointer-events: none; white-space: nowrap; }
</style>
