import { describe, expect, it, vi } from 'vitest';
import {
  timelineLayoutToVisualPixels,
  timelineVisualScale,
  timelineVisualToLayoutPixels,
  timelineMoveScale,
} from '../timeline-coordinate-space';

const elementWithWidths = (layoutWidth: number, visualWidth: number) => {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: visualWidth,
    bottom: 10,
    width: visualWidth,
    height: 10,
  } as DOMRect);
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    value: layoutWidth,
  });
  return element;
};

describe('timeline coordinate space', () => {
  it('uses the measured ruler and output scale for drag timing', () => {
    expect(timelineMoveScale(10, 750, elementWithWidths(1000, 750), null)).toEqual({
      baseDurationMs: 10000,
      width: 750,
      msPerPx: 10000 / 750,
      visualScale: 0.75,
    });
  });
  it('measures ticks or scroll when the ruler width is not yet published', () => {
    expect(timelineMoveScale(10, 0, elementWithWidths(1000, 1000), null).msPerPx).toBe(10);
    expect(timelineMoveScale(10, 0, null, elementWithWidths(500, 500)).msPerPx).toBe(20);
  });
  it('preserves the explicit unmeasured gesture scale without zero divisions', () => {
    expect(timelineMoveScale(10, 0, null, null)).toEqual({
      baseDurationMs: 10000,
      width: 1000,
      msPerPx: 10,
      visualScale: 1,
    });
    expect(timelineMoveScale(0, 0, null, null).baseDurationMs).toBe(1);
  });
  it.each([
    [0.75, 1_000, 750],
    [1.25, 1_000, 1_250],
  ])('maps layout and visual pixels consistently at scale %s', (scale, layoutWidth, visualWidth) => {
    const element = elementWithWidths(layoutWidth, visualWidth);

    expect(timelineVisualScale(element)).toBeCloseTo(scale);
    expect(timelineLayoutToVisualPixels(400, element)).toBeCloseTo(400 * scale);
    expect(timelineVisualToLayoutPixels(400 * scale, element)).toBeCloseTo(400);
  });

  it('falls back to identity when the element has no measurable width', () => {
    const element = elementWithWidths(0, 0);

    expect(timelineVisualScale(element)).toBe(1);
    expect(timelineLayoutToVisualPixels(400, element)).toBe(400);
    expect(timelineVisualToLayoutPixels(400, element)).toBe(400);
  });

  it('uses client width when offset width is unavailable', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      value: 1_000,
    });
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      width: 750,
    } as DOMRect);

    expect(timelineVisualScale(element)).toBeCloseTo(0.75);
  });
});
