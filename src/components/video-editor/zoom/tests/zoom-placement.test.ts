import { describe, expect, it } from 'vitest';
import { fitZoomPlacement } from '../zoom-placement';

describe('fitZoomPlacement', () => {
  it('centers the preferred duration around the requested anchor when space is free', () => {
    expect(
      fitZoomPlacement({
        anchorMs: 5_000,
        preferredDurationMs: 1_200,
        timelineDurationMs: 10_000,
        occupied: [],
      }),
    ).toEqual({ startMs: 4_400, endMs: 5_600 });
  });

  it('moves a request into the two-second gap after an existing eight-second zoom', () => {
    expect(
      fitZoomPlacement({
        anchorMs: 9_000,
        preferredDurationMs: 5_000,
        timelineDurationMs: 10_000,
        occupied: [{ startMs: 0, endMs: 8_000 }],
      }),
    ).toEqual({ startMs: 8_000, endMs: 10_000 });
  });

  it('reduces the requested duration to the available gap while preserving the anchor', () => {
    expect(
      fitZoomPlacement({
        anchorMs: 8_500,
        preferredDurationMs: 5_000,
        timelineDurationMs: 10_000,
        occupied: [
          { startMs: 0, endMs: 8_000 },
          { startMs: 9_000, endMs: 10_000 },
        ],
      }),
    ).toEqual({ startMs: 8_000, endMs: 9_000 });
  });

  it('rejects gaps shorter than the 200 ms minimum', () => {
    expect(
      fitZoomPlacement({
        anchorMs: 50,
        preferredDurationMs: 1_200,
        timelineDurationMs: 10_000,
        occupied: [{ startMs: 100, endMs: 10_000 }],
      }),
    ).toBeNull();
  });
});
