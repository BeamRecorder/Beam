import type { Clip } from '~/media/shared/composition-types';

export const timelineClipStyle = (clip: Clip, durationSeconds: number, timelineWidthPx = 0) => {
  const durationMs = Math.max(1, durationSeconds * 1_000);
  const translate =
    timelineWidthPx > 0
      ? `${(clip.timelineStartMs / durationMs) * timelineWidthPx}px`
      : `${(clip.timelineStartMs / Math.max(1, clip.timelineDurationMs)) * 100}%`;
  return {
    left: '0',
    width: `${(clip.timelineDurationMs / durationMs) * 100}%`,
    transform: `translate3d(${translate}, 0, 0)`,
  };
};

export const timelineFrameStyle = (clip: Clip, relativeMs: number, durationMs: number) => ({
  left: `${(relativeMs / Math.max(1, clip.timelineDurationMs)) * 100}%`,
  width: `${(durationMs / Math.max(1, clip.timelineDurationMs)) * 100}%`,
});

export const timelineTransitionStyle = (clip: Clip, edge: 'entry' | 'exit') => ({
  width: `${((clip.transitions?.[edge]?.durationMs ?? 0) / Math.max(1, clip.timelineDurationMs)) * 100}%`,
});
