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
