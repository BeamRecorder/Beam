import { describe, expect, it } from 'vitest';
import { thumbnailIsPending, thumbnailUrlFor, timelineThumbnailWidth } from '../timeline-thumbnail-presentation';

describe('timeline thumbnail presentation helpers', () => {
  it.each([
    [1, 240, 240],
    [2, 240, 480],
    [3, 240, 960],
  ])('selects the %s/second slot width tier', (durationSeconds, pixelsPerSecond, expected) => {
    expect(timelineThumbnailWidth([{ durationMs: durationSeconds * 1_000 }], pixelsPerSecond * 10, 10, 1)).toBe(
      expected,
    );
  });

  it('falls back to the nearest cached URL while an exact frame is pending', () => {
    const thumbnails = { 1: 'blob:near', 3: 'blob:far' };
    expect(thumbnailUrlFor(2, thumbnails)).toBe('blob:near');
    expect(thumbnailUrlFor(1, thumbnails)).toBe('blob:near');
    expect(thumbnailUrlFor(8, {})).toBeNull();
  });

  it('keeps low-resolution frames pending until the requested tier arrives', () => {
    const thumbnails = { 2: 'blob:low' };
    expect(thumbnailIsPending(2, thumbnails, { 2: 240 }, 480)).toBe(true);
    expect(thumbnailIsPending(2, thumbnails, { 2: 480 }, 480)).toBe(false);
    expect(thumbnailIsPending(2, thumbnails, { 2: 960 }, 480)).toBe(false);
    expect(thumbnailIsPending(3, thumbnails, {}, 240)).toBe(true);
  });
});
