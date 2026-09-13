import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useCompositionAudioWaveforms } from './useCompositionAudioWaveforms';
import { calculateSnapThresholdMs, collectSnapTargets, snapValue } from './timeline-snap';
import { timelinePlaybackScrollDelta, timelineThumbnailSlots } from './timeline-viewport';
import { zoomTimelineByWheel } from './timeline-zoom';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';
import { timelineLayoutToVisualPixels, timelineVisualToLayoutPixels } from './timeline-coordinate-space';

const MAX_WHEEL_EVENT_AGE_MS = 200;
const WHEEL_ZOOM_IDLE_MS = 120;

export function useTimelineViewport(
  props: TimelineTracksProps,
  emit: TimelineTracksEmits,
  durationMs: Ref<number>,
  activeSnapTimeMs: Ref<number | null>,
  isMediaPreviewFrozen: Ref<boolean>,
) {
  const tracksScrollRef = ref<HTMLDivElement | null>(null);
  const sidebarScrollRef = ref<HTMLDivElement | null>(null);
  const tracksViewportRef = ref<HTMLDivElement | null>(null);
  const ticksAreaRef = ref<HTMLDivElement | null>(null);
  const rulerWidth = ref(0);
  const rulerLayoutWidth = ref(0);
  const currentDuration = computed(() => {
    const ms = typeof durationMs.value === 'number' && Number.isFinite(durationMs.value) ? durationMs.value : 1_000;
    return Math.max(1, ms / 1_000);
  });
  const previewWidthScale = computed(() => {
    const baseDurationMs = Math.round(Math.max(0, props.duration) * 1_000);
    return baseDurationMs > 0 ? durationMs.value / baseDurationMs : 1;
  });
  const tracksWidthStyle = computed(() => ({
    width: `calc(${props.zoomLevel * previewWidthScale.value}% + 230px)`,
    minWidth: `calc(${100 * previewWidthScale.value}% + 230px)`,
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
  const isWheelZooming = ref(false);
  const liveMediaViewport = computed(() => ({
    startSeconds: viewportReady.value ? visibleStartSecond.value : 0,
    endSeconds: viewportReady.value ? visibleEndSecond.value : 0,
    pixelsPerSecond: rulerWidth.value / Math.max(1, currentDuration.value),
  }));
  const mediaViewport = ref(liveMediaViewport.value);
  watch(
    [liveMediaViewport, isMediaPreviewFrozen, isWheelZooming],
    ([viewport, frozen, wheelZooming]) => {
      if (!frozen && !wheelZooming) mediaViewport.value = viewport;
    },
    { immediate: true },
  );
  const {
    slices: audioWaveforms,
    errors: audioWaveformErrors,
    status: audioWaveformStatus,
  } = useCompositionAudioWaveforms(
    () => props.composition,
    () => mediaViewport.value,
  );
  const liveThumbnailSlots = computed(() =>
    viewportReady.value
      ? timelineThumbnailSlots(
          currentDuration.value,
          visibleStartSecond.value,
          visibleEndSecond.value,
          rulerWidth.value / Math.max(1, currentDuration.value),
        )
      : [],
  );
  const stableThumbnailSlots = ref(liveThumbnailSlots.value);
  watch(
    [liveThumbnailSlots, isMediaPreviewFrozen, isWheelZooming],
    ([slots, frozen, wheelZooming]) => {
      if (!frozen && !wheelZooming) stableThumbnailSlots.value = slots;
    },
    { immediate: true },
  );
  const thumbnailSlots = computed(() => stableThumbnailSlots.value);

  let scrollFrame: number | null = null;
  let scrubFrame: number | null = null;
  let zoomFrame: number | null = null;
  let pendingZoomDeltaY: number | null = null;
  let requestedZoomLevel = props.zoomLevel;
  const unacknowledgedZoomLevels = new Set<number>();
  let wheelZoomIdleTimer: ReturnType<typeof setTimeout> | null = null;
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
    rulerLayoutWidth.value = Math.max(0, ticks.offsetWidth || ticks.clientWidth || ticksRect.width);
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
    scroll.scrollLeft += timelineVisualToLayoutPixels(delta, scroll, scrollRect.width);
    onScroll();
  };
  let autoScrollRaf: number | null = null;
  let autoScrollVelocity = 0;
  let lastAutoScrollTime: number | null = null;
  let autoScrollUpdate: ((deltaPx: number) => void) | null = null;
  const runAutoScroll = (timestamp?: number) => {
    autoScrollRaf = null;
    const scrollEl = tracksScrollRef.value;
    if (!scrollEl || autoScrollVelocity === 0) return;
    const reportedFrameTime =
      typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : (lastAutoScrollTime ?? 0) + 16;
    const frameTime =
      lastAutoScrollTime !== null && reportedFrameTime <= lastAutoScrollTime
        ? lastAutoScrollTime + 16
        : reportedFrameTime;
    const elapsedMs = lastAutoScrollTime === null ? 16 : Math.max(1, Math.min(32, frameTime - lastAutoScrollTime));
    lastAutoScrollTime = frameTime;
    const previousScrollLeft = scrollEl.scrollLeft;
    scrollEl.scrollLeft += timelineVisualToLayoutPixels((autoScrollVelocity * elapsedMs) / 1_000, scrollEl);
    const scrollDeltaLayoutPx = scrollEl.scrollLeft - previousScrollLeft;
    if (scrollDeltaLayoutPx === 0) {
      autoScrollVelocity = 0;
      lastAutoScrollTime = null;
      return;
    }
    updateVisibleRange();
    autoScrollUpdate?.(timelineLayoutToVisualPixels(scrollDeltaLayoutPx, scrollEl));
    if (autoScrollUpdate && autoScrollVelocity !== 0) {
      autoScrollRaf = requestAnimationFrame(runAutoScroll);
    }
  };
  const updateAutoScroll = (clientX: number, onScroll: ((deltaPx: number) => void) | null = null) => {
    const scrollEl = tracksScrollRef.value;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    autoScrollUpdate = onScroll;
    const rightZone = rect.right - 50;
    const leftZone = rect.left + 50;
    if (clientX > rightZone) {
      const intensity = Math.min(1, (clientX - rightZone) / 50);
      autoScrollVelocity = 60 + intensity * 300;
    } else if (clientX < leftZone) {
      const intensity = Math.min(1, (leftZone - clientX) / 50);
      autoScrollVelocity = -(60 + intensity * 300);
    } else {
      autoScrollVelocity = 0;
      lastAutoScrollTime = null;
    }
    if (autoScrollVelocity === 0 && autoScrollRaf !== null) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
    if (autoScrollVelocity !== 0 && autoScrollRaf === null) {
      autoScrollRaf = requestAnimationFrame(runAutoScroll);
    }
  };
  const stopAutoScroll = () => {
    autoScrollVelocity = 0;
    lastAutoScrollTime = null;
    autoScrollUpdate = null;
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
  watch(
    () => props.zoomLevel,
    (zoomLevel) => {
      if (unacknowledgedZoomLevels.delete(zoomLevel)) return;
      requestedZoomLevel = zoomLevel;
    },
  );
  watch(() => [props.currentTime, props.isPlaying], followPlayback, { flush: 'post' });
  onUnmounted(() => {
    resizeObserver?.disconnect();
    stopAutoScroll();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
    if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
    if (wheelZoomIdleTimer !== null) clearTimeout(wheelZoomIdleTimer);
    pendingZoomDeltaY = null;
    unacknowledgedZoomLevels.clear();
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
    let clientX = event.clientX;
    const updateScrub = (nextClientX: number) => {
      clientX = nextClientX;
      scheduleScrubAt(clientX);
      updateAutoScroll(clientX, () => scheduleScrubAt(clientX));
    };
    updateScrub(clientX);
    const move = (next: PointerEvent) => updateScrub(next.clientX);
    const end = (next: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stopAutoScroll();
      flushScrubAt(next.clientX);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };
  const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const eventAgeMs = performance.now() - event.timeStamp;
    if (event.timeStamp > 0 && eventAgeMs > MAX_WHEEL_EVENT_AGE_MS) return;
    isWheelZooming.value = true;
    if (wheelZoomIdleTimer !== null) clearTimeout(wheelZoomIdleTimer);
    wheelZoomIdleTimer = setTimeout(() => {
      wheelZoomIdleTimer = null;
      isWheelZooming.value = false;
      unacknowledgedZoomLevels.clear();
      requestedZoomLevel = props.zoomLevel;
    }, WHEEL_ZOOM_IDLE_MS);
    pendingZoomDeltaY = (pendingZoomDeltaY ?? 0) + event.deltaY;
    if (zoomFrame !== null) return;
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = null;
      const deltaY = pendingZoomDeltaY;
      pendingZoomDeltaY = null;
      if (deltaY === null || deltaY === 0) return;
      requestedZoomLevel = zoomTimelineByWheel(requestedZoomLevel, deltaY);
      unacknowledgedZoomLevels.add(requestedZoomLevel);
      emit('update:zoomLevel', requestedZoomLevel);
    });
  };

  return {
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
  };
}
