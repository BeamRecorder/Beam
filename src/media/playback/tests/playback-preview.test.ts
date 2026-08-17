import { describe, expect, it } from 'vitest';
import { playbackPreviewDimensions, previewRenderScale } from '../playback-preview';

describe('previewRenderScale', () => {
  it.each([
    ['full', 1_920, 1_080, 2, 2],
    ['half', 1_920, 1_080, 2, 1],
    ['quarter', 1_920, 1_080, 2, 0.5],
  ] as const)(
    'calculates the %s composition scale with device pixel ratio',
    (quality, width, height, dpr, expected) => {
      expect(previewRenderScale(width, height, dpr, quality)).toBeCloseTo(expected);
    },
  );

  it('rejects invalid composition dimensions, pixel ratios, and qualities', () => {
    expect(() => previewRenderScale(0, 720, 1, 'full')).toThrow(RangeError);
    expect(() => previewRenderScale(1_920, Number.NaN, 1, 'full')).toThrow(RangeError);
    expect(() => previewRenderScale(1_920, 1_080, 0, 'full')).toThrow(RangeError);
    expect(() => previewRenderScale(1_920, 1_080, 1, '720p' as never)).toThrow(RangeError);
  });
});

describe('playbackPreviewDimensions', () => {
  it('supports full, half, and quarter preview qualities', () => {
    expect(playbackPreviewDimensions(3_840, 2_160, 'full')).toEqual({ width: 3_840, height: 2_160 });
    expect(playbackPreviewDimensions(1_280, 720, 'full')).toEqual({ width: 1_280, height: 720 });
    expect(playbackPreviewDimensions(1_280, 720, 'half')).toEqual({ width: 640, height: 360 });
    expect(playbackPreviewDimensions(1_280, 720, 'quarter')).toEqual({ width: 320, height: 180 });
  });

  it('defaults to full preview quality', () => {
    expect(playbackPreviewDimensions(3_840, 2_160)).toEqual({ width: 3_840, height: 2_160 });
  });

  it('rejects invalid dimensions and preview qualities', () => {
    expect(() => playbackPreviewDimensions(0, 720, 'full')).toThrow(RangeError);
    expect(() => playbackPreviewDimensions(1_920, Number.NaN, 'full')).toThrow(RangeError);
    expect(() => playbackPreviewDimensions(1_920, 1_080, '720p' as never)).toThrow(RangeError);
  });
});
