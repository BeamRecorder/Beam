// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { experimentalZoomSuggestions } from '../experimental-zoom-suggestions';
import type { ExperimentalPoint } from '../experimental-zoom-types';
const click = (
  timeMs: number,
  cx = 0.5,
  interactionType: ExperimentalPoint['interactionType'] = 'click',
): ExperimentalPoint => ({ timeMs, cx, cy: 0.5, interactionType });
describe('experimental generation boundaries', () => {
  it('keeps empty, invalid and motion-only input empty', () => {
    for (const telemetry of [
      [],
      [click(10, 0.5, 'move')],
      [click(NaN)],
      [click(0, 0.5, 'move'), click(1000, 0.5, 'move')],
    ])
      expect(experimentalZoomSuggestions({ telemetry, durationMs: 10000 })).toEqual([]);
    expect(experimentalZoomSuggestions({ telemetry: [click(1000)], durationMs: 0 })).toEqual([]);
    expect(experimentalZoomSuggestions({ telemetry: [{ timeMs: 0, cx: 0.5, cy: 0.5 }], durationMs: 10000 })).toEqual(
      [],
    );
  });
  it('clamps unsorted timestamps and positions, using custom padding and minimum duration', () => {
    const result = experimentalZoomSuggestions({
      telemetry: [click(1000, 2), click(-1, -2)],
      durationMs: 3000,
      duration: 1000,
      paddingMs: 100,
      spacingMs: 0,
      mergeGapMs: 100,
    });
    expect(result.map((z) => z.focus.cx)).toEqual([0, 1]);
    expect(result[0]!.start).toBe(0);
    expect(result[1]!.end).toBeLessThanOrEqual(3000);
  });
  it('reserves existing markers and can retain a smaller padded window in a tight slot', () => {
    expect(
      experimentalZoomSuggestions({
        telemetry: [click(1000)],
        durationMs: 3000,
        reserved: [{ start: 500, end: 2000 }],
      }),
    ).toEqual([]);
    const result = experimentalZoomSuggestions({
      telemetry: [click(2500)],
      durationMs: 5000,
      reserved: [
        { start: 0, end: 1950 },
        { start: 3050, end: 5000 },
      ],
    });
    expect(result).toEqual([{ start: 2000, end: 3000, focus: { cx: 0.5, cy: 0.5 } }]);
  });
  it('projects holds across clip cuts and ignores excluded source intervals and invalid speeds', () => {
    const telemetry = [{ ...click(500), mouseButton: 1 }, click(2000, 0.5, 'mouseup'), click(8000)];
    const clips = [
      { startMs: 0, endMs: 500, sourceStartMs: 1000, speed: NaN },
      { startMs: 500, endMs: 1000, sourceStartMs: 6000, speed: -1 },
    ];
    expect(experimentalZoomSuggestions({ telemetry, durationMs: 1000, clips })).toEqual([
      { start: 0, end: 500, focus: { cx: 0.5, cy: 0.5 } },
    ]);
    expect(
      experimentalZoomSuggestions({ telemetry: [click(500), click(999, 0.5, 'mouseup')], durationMs: 1000, clips }),
    ).toEqual([]);
    expect(
      experimentalZoomSuggestions({ telemetry: [click(500), click(1000, 0.5, 'mouseup')], durationMs: 1000, clips }),
    ).toEqual([]);
  });
  it('selects a later stronger click and keeps the first equal-weight anchor', () => {
    expect(
      experimentalZoomSuggestions({
        telemetry: [click(4000, 0.2), click(4200, 0.8, 'double-click')],
        durationMs: 10000,
      })[0]!.focus.cx,
    ).toBe(0.8);
    expect(
      experimentalZoomSuggestions({ telemetry: [click(4000, 0.2), click(4200, 0.8)], durationMs: 10000 })[0]!.focus.cx,
    ).toBe(0.2);
  });
});
