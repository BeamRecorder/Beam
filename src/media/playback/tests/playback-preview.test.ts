import { describe, expect, it } from 'vitest';
import { playbackPreviewDimensions } from '../playback-preview';

describe('playbackPreviewDimensions', () => {
  it('supports auto, full, half, and quarter preview qualities', () => {
    expect(playbackPreviewDimensions(3_840, 2_160, 'auto')).toEqual({ width: 1_280, height: 720 });
    expect(playbackPreviewDimensions(1_280, 720, 'full')).toEqual({ width: 1_280, height: 720 });
    expect(playbackPreviewDimensions(1_280, 720, 'half')).toEqual({ width: 640, height: 360 });
    expect(playbackPreviewDimensions(1_280, 720, 'quarter')).toEqual({ width: 320, height: 180 });
  });

  it('preserves aspect ratio while auto scaling oversized sources', () => {
    expect(playbackPreviewDimensions(4_000, 2_000, 'auto')).toEqual({ width: 1_280, height: 640 });
    expect(playbackPreviewDimensions(2_000, 4_000, 'auto')).toEqual({ width: 360, height: 720 });
  });

  it('does not upscale a source smaller than the auto preview bounds', () => {
    expect(playbackPreviewDimensions(640, 480, 'auto')).toEqual({ width: 640, height: 480 });
    expect(playbackPreviewDimensions(1, 1, 'auto')).toEqual({ width: 1, height: 1 });
  });

  it('rejects invalid dimensions and preview qualities', () => {
    expect(() => playbackPreviewDimensions(0, 720, 'auto')).toThrow(RangeError);
    expect(() => playbackPreviewDimensions(1_920, Number.NaN, 'auto')).toThrow(RangeError);
    expect(() => playbackPreviewDimensions(1_920, 1_080, '720p' as never)).toThrow(RangeError);
  });
});
