import { describe, expect, it } from 'vitest';
import { screenshotPreviewSize } from '../screenshot-preview-resolution';

describe('screenshotPreviewSize', () => {
  it('targets the measured stage in physical pixels while preserving the output aspect ratio', () => {
    expect(screenshotPreviewSize({ width: 2_000, height: 1_000 }, { width: 800, height: 400 }, 1.5)).toEqual({
      width: 1_200,
      height: 600,
    });
  });

  it('constrains both dimensions to the stage physical bounds', () => {
    expect(screenshotPreviewSize({ width: 1_920, height: 1_080 }, { width: 900, height: 500 }, 2)).toEqual({
      width: 1_778,
      height: 1_000,
    });
  });

  it('never upscales a source beyond its original output dimensions', () => {
    expect(screenshotPreviewSize({ width: 1_920, height: 1_080 }, { width: 2_400, height: 1_600 }, 2)).toEqual({
      width: 1_920,
      height: 1_080,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to a 1x pixel ratio for an invalid device pixel ratio (%s)',
    (devicePixelRatio) => {
      expect(
        screenshotPreviewSize({ width: 2_000, height: 1_000 }, { width: 400, height: 300 }, devicePixelRatio),
      ).toEqual({ width: 400, height: 200 });
    },
  );
});
