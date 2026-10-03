// @vitest-environment node
import { expect, it } from 'vitest';
import {
  panTimelineView,
  timelineTimeAt,
  timelineWheelPixels,
  zoomTimelineView,
  timelineOffsetAtAnchor,
} from './timeline-viewport';
const view = { offsetMs: 1e10, pixelsPerMs: 0.25, scrollY: 10, width: 800, height: 400 };
it('pans arbitrarily far in logical time without allocating a large canvas', () => {
  expect(timelineTimeAt(view, 400)).toBe(1e10 + 1600);
  expect(panTimelineView(view, 100, -100)).toMatchObject({ offsetMs: 1e10 + 400, scrollY: 0 });
  expect(panTimelineView(view, -100, 10).width).toBe(800);
});
it('keeps the time under the pointer identical through repeated zooms and clamps scale', () => {
  const next = zoomTimelineView(view, 2, 301);
  expect(timelineTimeAt(next, 301)).toBe(timelineTimeAt(view, 301));
  expect(zoomTimelineView(next, 0.5, 301)).toEqual(view);
  expect(zoomTimelineView(view, 1e20, 0).pixelsPerMs).toBe(1e5);
});
it('normalizes device wheel units and rejects invalid view geometry', () => {
  expect([0, 1, 2].map((mode) => timelineWheelPixels(2, mode, 400))).toEqual([2, 36, 800]);
  expect(() => timelineTimeAt({ ...view, pixelsPerMs: 0 }, 0)).toThrow();
  expect(() => panTimelineView(view, NaN, 0)).toThrow();
  expect(() => zoomTimelineView(view, 0, 0)).toThrow();
  expect(() => timelineWheelPixels(1, 3, 1)).toThrow();
});

it('anchors time at a pixel with no document-duration or native-scroll dependency', () => {
  expect(timelineOffsetAtAnchor(1000, 0.25, 100)).toBe(600);
  expect(timelineOffsetAtAnchor(-100, 0.25, 100)).toBe(-500);
  for (const args of [
    [NaN, 1, 0],
    [0, 0, 0],
    [0, 1, Infinity],
  ])
    expect(() => timelineOffsetAtAnchor(...(args as [number, number, number]))).toThrow();
});
