import type { Clip } from '~/media/shared/composition-types';

export const timelineSpanStyle = (startMs: number, lengthMs: number, durationSeconds: number, timelineWidthPx = 0) => {
  const durationMs = Math.max(1, durationSeconds * 1_000);
  const translate =
    timelineWidthPx > 0
      ? `${(startMs / durationMs) * timelineWidthPx}px`
      : `${(startMs / Math.max(1, lengthMs)) * 100}%`;
  return {
    left: '0',
    width: `${(lengthMs / durationMs) * 100}%`,
    transform: `translate3d(${translate}, 0, 0)`,
  };
};

export const timelineClipStyle = (clip: Clip, durationSeconds: number, timelineWidthPx = 0) =>
  timelineSpanStyle(clip.timelineStartMs, clip.timelineDurationMs, durationSeconds, timelineWidthPx);

export const timelineFrameStyle = (clip: Clip, relativeMs: number, durationMs: number) => ({
  left: `${(relativeMs / Math.max(1, clip.timelineDurationMs)) * 100}%`,
  width: `${(durationMs / Math.max(1, clip.timelineDurationMs)) * 100}%`,
});

export const timelineTransitionStyle = (clip: Clip, edge: 'entry' | 'exit') => ({
  width: `${((clip.transitions?.[edge]?.durationMs ?? 0) / Math.max(1, clip.timelineDurationMs)) * 100}%`,
});
