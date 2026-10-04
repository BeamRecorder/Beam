export interface TimelineThumbnailSlot {
  timelineSeconds: number;
  durationSeconds: number;
}

export const TARGET_THUMBNAIL_WIDTH_PX = 96;
export const THUMBNAIL_OVERSCAN_SLOTS = 2;
export const PLAYBACK_FOLLOW_TARGET_RATIO = 0.15;
export const PLAYBACK_FOLLOW_RIGHT_EDGE_RATIO = 0.9;

const THUMBNAIL_STEPS_SECONDS = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1_200];

const roundedSeconds = (value: number) => Math.round(value * 1_000) / 1_000;

export const timelinePlaybackScrollDelta = (playheadX: number, viewportLeft: number, viewportRight: number) => {
  if (![playheadX, viewportLeft, viewportRight].every(Number.isFinite)) return 0;
  const viewportWidth = viewportRight - viewportLeft;
  if (viewportWidth <= 0) return 0;
  const followBoundary = viewportLeft + viewportWidth * PLAYBACK_FOLLOW_RIGHT_EDGE_RATIO;
  if (playheadX >= viewportLeft && playheadX <= followBoundary) return 0;
  return playheadX - (viewportLeft + viewportWidth * PLAYBACK_FOLLOW_TARGET_RATIO);
};

export const timelineThumbnailStep = (pixelsPerSecond: number, targetWidth = TARGET_THUMBNAIL_WIDTH_PX) => {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return 1;
  const idealStep = Math.max(THUMBNAIL_STEPS_SECONDS[0]!, targetWidth / pixelsPerSecond);
  return THUMBNAIL_STEPS_SECONDS.reduce((closest, candidate) =>
    Math.abs(Math.log(candidate / idealStep)) < Math.abs(Math.log(closest / idealStep)) ? candidate : closest,
  );
};

export const timelineThumbnailSlots = (
  duration: number,
  visibleStart: number,
  visibleEnd: number,
  pixelsPerSecond: number,
  overscanSlots = THUMBNAIL_OVERSCAN_SLOTS,
): TimelineThumbnailSlot[] => {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const step = timelineThumbnailStep(pixelsPerSecond);
  const firstIndex = Math.max(0, Math.floor(Math.max(0, visibleStart) / step) - overscanSlots);
  const lastIndex = Math.min(
    Math.ceil(duration / step) - 1,
    Math.ceil(Math.max(visibleStart, visibleEnd) / step) + overscanSlots,
  );
  return Array.from({ length: Math.max(0, lastIndex - firstIndex + 1) }, (_, offset) => {
    const timelineSeconds = roundedSeconds((firstIndex + offset) * step);
    return {
      timelineSeconds,
      durationSeconds: roundedSeconds(Math.min(step, duration - timelineSeconds)),
    };
  });
};

export const timelineSecondsInView = (
  duration: number,
  visibleStart: number,
  visibleEnd: number,
  bufferSeconds = 3,
) => {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const first = Math.max(0, Math.floor(visibleStart) - bufferSeconds);
  const last = Math.min(Math.ceil(duration) - 1, Math.ceil(visibleEnd) + bufferSeconds);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
};

export const timelineRulerSecondsInView = (duration: number, visibleSeconds: readonly number[]) => {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return [...new Set([0, ...visibleSeconds, Math.floor(duration)])].sort((left, right) => left - right);
};

export const timelinePercentStyle = (duration: number, second: number) => ({
  left: `${(second / duration) * 100}%`,
  width: `${100 / duration}%`,
});
