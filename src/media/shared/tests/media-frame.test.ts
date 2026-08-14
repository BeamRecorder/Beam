import { describe, expect, it, vi } from 'vitest';
import { ownedMediaFrame } from '../media-frame';

const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;

describe('ownedMediaFrame', () => {
  it('captures clip, timing, dimensions, and RGBA byte size at construction', () => {
    const image = bitmap(320, 180);
    const frame = ownedMediaFrame('clip-1', image, 1.25, 0.04);

    expect(frame).toMatchObject({
      clipId: 'clip-1',
      bitmap: image,
      timestampSeconds: 1.25,
      durationSeconds: 0.04,
      width: 320,
      height: 180,
      byteSize: 320 * 180 * 4,
    });
  });

  it('closes its bitmap once even when close is called repeatedly', () => {
    const image = bitmap(10, 20);
    const frame = ownedMediaFrame('clip-2', image, 0, 1);

    frame.close();
    frame.close();
    expect(image.close).toHaveBeenCalledOnce();
  });

  it('supports zero-sized bitmaps without inventing a byte count', () => {
    const image = bitmap(0, 0);
    const frame = ownedMediaFrame('empty', image, -1, 0);

    expect(frame.width).toBe(0);
    expect(frame.height).toBe(0);
    expect(frame.byteSize).toBe(0);
    frame.close();
    expect(image.close).toHaveBeenCalledOnce();
  });
});
