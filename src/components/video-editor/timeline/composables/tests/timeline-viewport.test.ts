import { describe, expect, it } from 'vitest';
import {
  timelinePercentStyle,
  timelineRulerSecondsInView,
  timelineSecondsInView,
  timelineThumbnailSlots,
  timelineThumbnailStep,
} from '../timeline-viewport';

describe('timeline viewport', () => {
  it('adapts thumbnail spacing from three minutes at low zoom to three seconds at high zoom', () => {
    expect(timelineThumbnailStep(0.5)).toBe(180);
    expect(timelineThumbnailStep(32)).toBe(3);
  });

  it('bounds a forty-minute timeline to viewport slots plus slot overscan', () => {
    const slots = timelineThumbnailSlots(2_400, 600, 660, 32);
    expect(slots.length).toBeLessThan(40);
    expect(slots[0]).toEqual({ timelineSeconds: 594, durationSeconds: 3 });
    expect(slots.at(-1)).toEqual({ timelineSeconds: 666, durationSeconds: 3 });
    expect(slots.every((slot) => slot.timelineSeconds >= 600 - 2 * 3 && slot.timelineSeconds <= 660 + 2 * 3)).toBe(
      true,
    );
  });

  it('limits thumbnails to the visible interval plus a small buffer', () => {
    expect(timelineSecondsInView(120, 40, 43)).toEqual([37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
  });

  it('clamps thumbnail intervals at both ends of the recording', () => {
    expect(timelineSecondsInView(5, -4, 2)).toEqual([0, 1, 2, 3, 4]);
  });

  it('does not render virtual items for an empty or invalid timeline', () => {
    expect(timelineSecondsInView(0, 0, 1)).toEqual([]);
    expect(timelineRulerSecondsInView(Number.NaN, [0, 1])).toEqual([]);
  });

  it('keeps the first and final ruler labels available', () => {
    expect(timelineRulerSecondsInView(65, [10, 11, 12])).toEqual([0, 10, 11, 12, 65]);
  });

  it('positions a frame against the full timeline, not the viewport', () => {
    expect(timelinePercentStyle(100, 25)).toEqual({ left: '25%', width: '1%' });
  });
});
