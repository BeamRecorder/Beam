import { describe, expect, it } from 'vitest';
import type { Clip } from '~/media/shared/composition-types';
import {
  timelineClipStyle,
  timelineFrameStyle,
  timelineSpanStyle,
  timelineTransitionStyle,
} from './timeline-clip-geometry';

const timelineClip = (timelineStartMs: number, timelineDurationMs: number): Clip =>
  ({
    id: 'geometry-clip',
    kind: 'video',
    timelineStartMs,
    timelineDurationMs,
  }) as Clip;

describe('timeline clip geometry', () => {
  it('keeps clip and zoom positions identical when a group moves together', () => {
    const durationSeconds = 12.75;
    const rulerWidthPx = 913.5;
    const sourceStartMs = 1_875.25;
    const groupDeltaMs = 642.75;
    const clipLengthMs = 1_125.5;
    const movedStartMs = sourceStartMs + groupDeltaMs;
    const movedClip = timelineClip(movedStartMs, clipLengthMs);

    const clipStyle = timelineClipStyle(movedClip, durationSeconds, rulerWidthPx);
    const zoomStyle = timelineSpanStyle(movedStartMs, clipLengthMs, durationSeconds, rulerWidthPx);

    expect(clipStyle).toEqual(zoomStyle);
    expect(clipStyle).toEqual({
      left: '0',
      width: `${(clipLengthMs / (durationSeconds * 1_000)) * 100}%`,
      transform: `translate3d(${(movedStartMs / (durationSeconds * 1_000)) * rulerWidthPx}px, 0, 0)`,
    });
  });

  it('uses the measured ruler width for fractional positions and recomputes when duration changes', () => {
    const startMs = 2_250.5;
    const lengthMs = 1_100.25;
    const rulerWidthPx = 1_003.75;

    const longTimeline = timelineSpanStyle(startMs, lengthMs, 20.5, rulerWidthPx);
    expect(longTimeline).toEqual({
      left: '0',
      width: `${(lengthMs / 20_500) * 100}%`,
      transform: `translate3d(${(startMs / 20_500) * rulerWidthPx}px, 0, 0)`,
    });

    const shorterTimeline = timelineSpanStyle(startMs, lengthMs, 17.25, rulerWidthPx);
    expect(shorterTimeline).toEqual({
      left: '0',
      width: `${(lengthMs / 17_250) * 100}%`,
      transform: `translate3d(${(startMs / 17_250) * rulerWidthPx}px, 0, 0)`,
    });
    expect(shorterTimeline.width).not.toBe(longTimeline.width);
    expect(shorterTimeline.transform).not.toBe(longTimeline.transform);
  });

  it('falls back to a percentage translation until the timeline width is measured', () => {
    expect(timelineSpanStyle(500, 1_000, 4)).toEqual({
      left: '0',
      width: '25%',
      transform: 'translate3d(50%, 0, 0)',
    });
    expect(timelineSpanStyle(500, 1_000, 4, 0)).toEqual(timelineSpanStyle(500, 1_000, 4));
  });

  it('preserves width during a move and changes it when trimming the clip', () => {
    const original = timelineClipStyle(timelineClip(1_000, 2_000), 10, 1_000);
    const moved = timelineClipStyle(timelineClip(3_500, 2_000), 10, 1_000);
    const trimmed = timelineClipStyle(timelineClip(3_500, 2_600), 10, 1_000);

    expect(original.width).toBe('20%');
    expect(moved.width).toBe(original.width);
    expect(moved.transform).toBe('translate3d(350px, 0, 0)');
    expect(trimmed.width).toBe('26%');
    expect(trimmed.width).not.toBe(moved.width);
  });

  it('keeps frame and transition geometry relative to the clip duration', () => {
    const clip = timelineClip(1_000, 2_000);

    expect(timelineFrameStyle(clip, 500, 250)).toEqual({ left: '25%', width: '12.5%' });
    expect(timelineTransitionStyle({ ...clip, transitions: { entry: null, exit: null } }, 'entry')).toEqual({
      width: '0%',
    });
  });
});
