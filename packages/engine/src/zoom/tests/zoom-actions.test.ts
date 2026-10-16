import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import { recordingZoomActions, mergeActionBox } from '../zoom-actions';

const point = (
  timeMs: number,
  interactionType: CursorTelemetryPoint['interactionType'],
  cx = 0.5,
  cy = 0.5,
  visible = true,
): CursorTelemetryPoint => ({ timeMs, interactionType, cx, cy, visible });
const box = (left = 0.5, right = left, top = 0.5, bottom = top) => ({ left, right, top, bottom });

describe('recorded zoom gestures', () => {
  it('ignores movement, unmatched releases, hidden presses and empty data', () => {
    expect(recordingZoomActions([])).toEqual([]);
    expect(
      recordingZoomActions([
        point(0, 'move'),
        point(20, 'mouseup'),
        point(30, 'click', 0.5, 0.5, false),
        point(40, 'move'),
        point(50, 'mouseup'),
      ]),
    ).toEqual([]);
  });
  it.each(['click', 'double-click', 'right-click', 'middle-click'] as const)(
    'retains the full %s gesture and ignores movement after its release',
    (type) => {
      expect(
        recordingZoomActions([
          point(100, type),
          point(400, 'move', 0.7, 0.2),
          point(900, 'mouseup', 0.6, 0.4),
          point(1000, 'move', 0, 1),
        ]),
      ).toEqual([{ startMs: 100, endMs: 900, box: box(0.5, 0.7, 0.2, 0.5) }]);
    },
  );
  it('retains the duration of hidden-pointer drags without framing hidden sentinel coordinates', () => {
    expect(
      recordingZoomActions([
        point(100, 'click'),
        point(300, 'move', 0.7, 0.2),
        point(400, 'move', 0, 1, false),
        point(900, 'mouseup', 0, 1, false),
      ]),
    ).toEqual([{ startMs: 100, endMs: 900, box: box(0.5, 0.7, 0.2, 0.5) }]);
  });
  it('bounds an unreleased press by the last actual sample and closes it before a new press', () => {
    const input = [
      point(0, 'click'),
      point(25, 'mouseup'),
      point(100, 'click'),
      point(300, 'move', 0.7),
      point(500, 'click', 0.2),
    ];
    const before = structuredClone(input);
    expect(recordingZoomActions(input)).toEqual([
      { startMs: 0, endMs: 25, box: box() },
      { startMs: 100, endMs: 300, box: box(0.5, 0.7) },
      { startMs: 500, endMs: 500, box: box(0.2) },
    ]);
    expect(input).toEqual(before);
  });
  it('does not invent drags from older telemetry without recorded releases', () => {
    expect(
      recordingZoomActions([
        point(100, 'click'),
        point(300, 'move', 0.7),
        point(400, 'move', 0.1),
        point(500, 'click', 0.2),
        point(900, 'move', 1),
      ]),
    ).toEqual([
      { startMs: 100, endMs: 100, box: box() },
      { startMs: 500, endMs: 500, box: box(0.2) },
    ]);
  });
  it('keeps same-timestamp presses/releases and a late visibility change independent', () => {
    expect(recordingZoomActions([point(100, 'click'), point(100, 'mouseup'), point(200, 'move', 0, 0, false)])).toEqual(
      [{ startMs: 100, endMs: 100, box: box() }],
    );
  });
});

describe('action bounds', () => {
  it.each([
    [box(), box(), box()],
    [box(0.2, 0.4, 0.3, 0.7), box(0.1, 0.8, 0.4, 0.5), box(0.1, 0.8, 0.3, 0.7)],
    [box(0, 1, 0, 1), box(), box(0, 1, 0, 1)],
  ])('unites two boxes without mutating either', (a, b, expected) => {
    const before = structuredClone([a, b]);
    expect(mergeActionBox(a, b)).toEqual(expected);
    expect([a, b]).toEqual(before);
  });
});
