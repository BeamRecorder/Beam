import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useCompositionAudioWaveforms } from './useCompositionAudioWaveforms';
import { calculateSnapThresholdMs, collectSnapTargets, snapValue } from './timeline-snap';
import { timelinePlaybackScrollDelta, timelineThumbnailSlots } from './timeline-viewport';
import { clampTimelineZoom, zoomTimelineByWheel } from './timeline-zoom';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export function useTimelineViewport(
  props: TimelineTracksProps,
  emit: TimelineTracksEmits,
  durationMs: Ref<number>,
  activeSnapTimeMs: Ref<number | null>,
) {
  const tracksScrollRef = ref<HTMLDivElement | null>(null);
  const sidebarScrollRef = ref<HTMLDivElement | null>(null);
  const tracksViewportRef = ref<HTMLDivElement | null>(null);
  const ticksAreaRef = ref<HTMLDivElement | null>(null);
  const rulerWidth = ref(0);
  const currentDuration = computed(() => {
    const ms = typeof durationMs.value === 'number' && Number.isFinite(durationMs.value) ? durationMs.value : 1_000;
    return Math.max(1, ms / 1_000);
  });
  const tracksWidthStyle = computed(() => ({
    width: `calc(${props.zoomLevel}% + 230px)`,
    minWidth: 'calc(100% + 230px)',
  }));
  const scrubPreviewTime = ref<number | null>(null);
  const displayedPlayheadTime = computed(() => scrubPreviewTime.value ?? props.currentTime);
  const playheadStyle = computed(() => ({
    left: `${currentDuration.value > 0 ? (displayedPlayheadTime.value / currentDuration.value) * 100 : 0}%`,
  }));
  const rulerLabelStep = computed(() => {
    const dur = Math.max(0.1, currentDuration.value);
    const width = Math.max(1, rulerWidth.value);
    const pixelsPerSecond = width / dur;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pixelsPerSecond >= 68) ?? 600;
    return Math.max(1, step);
  });
  const rulerTickStep = computed(() => {
    const step = rulerLabelStep.value <= 5 ? 1 : Math.max(1, Math.round(rulerLabelStep.value / 5));
    return Math.max(1, step);
  });
  const rulerSeconds = computed(() => {
    const step = rulerTickStep.value;
    const dur = currentDuration.value;
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(step) || step <= 0) return [];
    const maxSecond = Math.min(36_000, Math.ceil(dur));
    const result: number[] = [];
    for (let second = 0; second <= maxSecond; second += step) {
      result.push(second);
      if (result.length > 2_000) break;
    }
    return result;
  });
  const rulerMarkerStyle = (second: number) => ({ left: `${(second / Math.max(1, currentDuration.value)) * 100}%` });
  const isRulerLabel = (second: number) => {
    const step = rulerLabelStep.value;
    return step > 0 && second % step === 0;
  };
  const formatRulerLabel = (second: number) =>
    second < 60 ? `${second}s` : `${Math.floor(second / 60)}:${(second % 60).toString().padStart(2, '0')}`;

  const visibleStartSecond = ref(0);
  const visibleEndSecond = ref(0);
  const viewportReady = ref(false);
  const {
    slices: audioWaveforms,
    errors: audioWaveformErrors,
    status: audioWaveformStatus,
  } = useCompositionAudioWaveforms(
    () => props.composition,
    () => ({
      startSeconds: viewportReady.value ? visibleStartSecond.value : 0,
      endSeconds: viewportReady.value ? visibleEndSecond.value : 0,
      pixelsPerSecond: rulerWidth.value / Math.max(1, currentDuration.value),
    }),
  );
  const thumbnailSlots = computed(() =>
    viewportReady.value
      ? timelineThumbnailSlots(
          currentDuration.value,
          visibleStartSecond.value,
          visibleEndSecond.value,
          rulerWidth.value / Math.max(1, currentDuration.value),
        )
      : [],
  );

  let scrollFrame: number | null = null;
  let scrubFrame: number | null = null;
  let zoomFrame: number | null = null;
  let pendingZoom: number | null = null;
  let pendingScrubTime: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const updateVisibleRange = () => {
    const scroll = tracksScrollRef.value;
    const ticks = ticksAreaRef.value;
    if (!scroll || !ticks || currentDuration.value <= 0) return;
    const scrollRect = scroll.getBoundingClientRect();
    const ticksRect = ticks.getBoundingClientRect();
    const timelineWidth = Math.max(1, ticksRect.width || ticks.clientWidth);
    rulerWidth.value = timelineWidth;
    const startPixel = Math.max(0, Math.min(timelineWidth, scrollRect.left - ticksRect.left));
    const endPixel = Math.max(0, Math.min(timelineWidth, scrollRect.right - ticksRect.left));
    visibleStartSecond.value = (startPixel / timelineWidth) * currentDuration.value;
    visibleEndSecond.value = (endPixel / timelineWidth) * currentDuration.value;
    viewportReady.value = true;
  };
  const onScroll = () => {
    if (sidebarScrollRef.value && tracksScrollRef.value) {
      sidebarScrollRef.value.scrollTop = tracksScrollRef.value.scrollTop;
    }
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      updateVisibleRange();
    });
  };
  const followPlayback = () => {
    if (!props.isPlaying || scrubPreviewTime.value !== null) return;
    const scroll = tracksScrollRef.value;
    const ticks = ticksAreaRef.value;
    if (!scroll || !ticks || currentDuration.value <= 0) return;
    const scrollRect = scroll.getBoundingClientRect();
    const ticksRect = ticks.getBoundingClientRect();
    const timelineWidth = Math.max(1, ticksRect.width || ticks.clientWidth);
    const currentTime = Number.isFinite(props.currentTime)
      ? Math.max(0, Math.min(currentDuration.value, props.currentTime))
      : 0;
    const playheadX = ticksRect.left + (currentTime / currentDuration.value) * timelineWidth;
    const delta = timelinePlaybackScrollDelta(playheadX, scrollRect.left, scrollRect.right);
    if (Math.abs(delta) < 1) return;
    scroll.scrollLeft += delta;
    updateVisibleRange();
  };
  let autoScrollRaf: number | null = null;
  let autoScrollSpeed = 0;
  const updateAutoScroll = (clientX: number) => {
    const scrollEl = tracksScrollRef.value;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const rightZone = rect.right - 50;
    const leftZone = rect.left + 50;
    if (clientX > rightZone) {
      const intensity = Math.min(1, (clientX - rightZone) / 50);
      autoScrollSpeed = Math.round(4 + intensity * 10);
    } else if (clientX < leftZone) {
      const intensity = Math.min(1, (leftZone - clientX) / 50);
      autoScrollSpeed = -Math.round(4 + intensity * 10);
    } else {
      autoScrollSpeed = 0;
    }
    if (autoScrollSpeed !== 0 && autoScrollRaf === null) {
      autoScrollRaf = requestAnimationFrame(() => {
        autoScrollRaf = null;
        if (scrollEl && autoScrollSpeed !== 0) {
          scrollEl.scrollLeft += autoScrollSpeed;
          updateVisibleRange();
        }
      });
    }
  };
  const stopAutoScroll = () => {
    autoScrollSpeed = 0;
    if (autoScrollRaf !== null) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
  };
  onMounted(() => {
    updateVisibleRange();
    followPlayback();
    if (!tracksScrollRef.value) return;
    resizeObserver = new ResizeObserver(onScroll);
    resizeObserver.observe(tracksScrollRef.value);
    if (tracksViewportRef.value) resizeObserver.observe(tracksViewportRef.value);
  });
  watch(
    () => [props.duration, props.zoomLevel],
    () => {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        updateVisibleRange();
      });
    },
    { flush: 'post' },
  );
  watch(() => [props.currentTime, props.isPlaying], followPlayback, { flush: 'post' });
  onUnmounted(() => {
    resizeObserver?.disconnect();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
    if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
  });

  const percentageStyle = (startMs: number, lengthMs: number) => ({
    left: `${(startMs / durationMs.value) * 100}%`,
    width: `${(lengthMs / durationMs.value) * 100}%`,
  });
  const timeAt = (clientX: number) => {
    const target = ticksAreaRef.value;
    if (!target) return 0;
    const rect = target.getBoundingClientRect();
    const fraction = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.round(Math.max(0, fraction) * durationMs.value);
  };
  const centeredStartAt = (clientX: number, lengthMs: number) => {
    const maximumStart = Math.max(0, durationMs.value - lengthMs);
    return Math.round(Math.max(0, Math.min(maximumStart, timeAt(clientX) - lengthMs / 2)));
  };
  let lastScrubX = 0;
  let lastScrubTimestamp = 0;
  let cachedSnapTargets: ReturnType<typeof collectSnapTargets> | null = null;
  const calculateScrubSnap = (clientX: number) => {
    const rawTimeMs = Math.min(durationMs.value, timeAt(clientX));
    if (props.isSnappingEnabled === false) {
      activeSnapTimeMs.value = null;
      return rawTimeMs;
    }
    const now = performance.now();
    const speedPxPerMs = Math.abs(clientX - lastScrubX) / Math.max(1, now - lastScrubTimestamp);
    lastScrubX = clientX;
    lastScrubTimestamp = now;
    const thresholdMs = calculateSnapThresholdMs(durationMs.value, rulerWidth.value, speedPxPerMs < 0.8 ? 14 : 8);
    const snap = snapValue(
      rawTimeMs,
      cachedSnapTargets ??
        collectSnapTargets({
          composition: props.composition,
          zoomElements: props.zoomElements,
          currentTime: props.currentTime,
          duration: props.duration,
          ignorePlayhead: true,
        }),
      thresholdMs,
    );
    activeSnapTimeMs.value = snap?.snappedValueMs ?? null;
    return snap?.snappedValueMs ?? rawTimeMs;
  };
  const scheduleScrubAt = (clientX: number) => {
    pendingScrubTime = calculateScrubSnap(clientX);
    scrubPreviewTime.value = pendingScrubTime / 1_000;
    if (scrubFrame !== null) return;
    scrubFrame = requestAnimationFrame(() => {
      scrubFrame = null;
      if (pendingScrubTime !== null) emit('update:currentTime', pendingScrubTime / 1_000);
      pendingScrubTime = null;
    });
  };
  const flushScrubAt = (clientX: number) => {
    pendingScrubTime = calculateScrubSnap(clientX);
    scrubPreviewTime.value = pendingScrubTime / 1_000;
    if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
    scrubFrame = null;
    if (pendingScrubTime !== null) emit('update:currentTime', pendingScrubTime / 1_000);
    pendingScrubTime = null;
    scrubPreviewTime.value = null;
    activeSnapTimeMs.value = null;
    cachedSnapTargets = null;
  };
  const beginScrub = (event: PointerEvent) => {
    cachedSnapTargets = collectSnapTargets({
      composition: props.composition,
      zoomElements: props.zoomElements,
      currentTime: props.currentTime,
      duration: props.duration,
      ignorePlayhead: true,
    });
    scheduleScrubAt(event.clientX);
    const move = (next: PointerEvent) => scheduleScrubAt(next.clientX);
    const end = (next: PointerEvent) => {
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
    pendingZoom = clampTimelineZoom(zoomTimelineByWheel(pendingZoom ?? props.zoomLevel, event.deltaY));
    if (zoomFrame !== null) return;
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = null;
      if (pendingZoom !== null) emit('update:zoomLevel', pendingZoom);
      pendingZoom = null;
    });
  };

  return {
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
  };
}
