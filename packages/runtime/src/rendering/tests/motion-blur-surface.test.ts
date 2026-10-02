import { afterEach, describe, expect, it, vi } from 'vitest';

const compositor = vi.hoisted(() => ({ create: vi.fn(), resize: vi.fn() }));
vi.mock('@beam/runtime/zoom/zoom-motion-blur-compositor', () => ({
  createMotionBlurSurface: compositor.create,
  resizeMotionBlurSurface: compositor.resize,
}));
import {
  disposeExportMotionBlurSurface,
  getExportMotionBlurSurface,
} from '@beam/runtime/rendering/motion-blur-surface';

afterEach(() => {
  disposeExportMotionBlurSurface();
  vi.resetAllMocks();
});

describe('export-owned motion blur surface', () => {
  it('reuses and resizes a surface until export disposal', () => {
    const first = {} as OffscreenCanvas;
    const second = {} as OffscreenCanvas;
    compositor.create.mockReturnValueOnce(first).mockReturnValueOnce(second);
    expect(getExportMotionBlurSurface(1920, 1080)).toBe(first);
    expect(getExportMotionBlurSurface(1280, 720)).toBe(first);
    expect(compositor.create).toHaveBeenCalledOnce();
    expect(compositor.resize).toHaveBeenLastCalledWith(first, 1280, 720);
    disposeExportMotionBlurSurface();
    disposeExportMotionBlurSurface();
    expect(getExportMotionBlurSurface(1920, 1080)).toBe(second);
    expect(compositor.create).toHaveBeenCalledTimes(2);
  });

  it('leaves unavailable surfaces unavailable without attempting a resize', () => {
    compositor.create.mockReturnValue(null);
    expect(getExportMotionBlurSurface(1920, 1080)).toBeNull();
    expect(compositor.resize).not.toHaveBeenCalled();
  });

  it('propagates allocation failures and does not retain an unsuccessful allocation', () => {
    const error = new Error('GPU allocation failed');
    compositor.create.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => getExportMotionBlurSurface(1920, 1080)).toThrow(error);
    const next = {} as OffscreenCanvas;
    compositor.create.mockReturnValueOnce(next);
    expect(getExportMotionBlurSurface(1920, 1080)).toBe(next);
  });
});
