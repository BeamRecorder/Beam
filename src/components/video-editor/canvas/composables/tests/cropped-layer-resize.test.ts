import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { NormalizedCrop, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { resizeCroppedLayer } from '../cropped-layer-resize';

const crop: NormalizedCrop = { x: 0.2, y: 0.25, width: 0.5, height: 0.5 };

const clipFor = (overrides: Partial<VisualClip> = {}): VisualClip => ({
  id: 'clip',
  kind: 'video',
  name: 'Clip',
  assetId: 'asset',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 },
  crop,
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  cameraFramingPreset: 'custom',
  ...overrides,
});

const expectTransform = (actual: NormalizedTransform, expected: NormalizedTransform) => {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.width).toBeCloseTo(expected.width, 10);
  expect(actual.height).toBeCloseTo(expected.height, 10);
};

describe('resizeCroppedLayer', () => {
  it('expands the full layer by the crop fraction so the visible crop follows the pointer', () => {
    const clip = clipFor();
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const resized = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };

    expectTransform(resizeCroppedLayer(clip, initial, resized, 'bottom-right'), {
      x: 0.16,
      y: 0.25,
      width: 0.6,
      height: 0.5,
    });
  });

  it.each([
    ['top-left', { width: 0.5, height: 0.4 }, { x: 0.06, y: 0.15, width: 0.6, height: 0.5 }],
    ['right', { width: 0.5, height: 0.3 }, { x: 0.16, y: 0.3, width: 0.6, height: 0.3 }],
    ['bottom', { width: 0.4, height: 0.4 }, { x: 0.2, y: 0.25, width: 0.4, height: 0.5 }],
    ['left', { width: 0.5, height: 0.3 }, { x: 0.06, y: 0.3, width: 0.6, height: 0.3 }],
  ] as const)('keeps the opposite crop edge anchored for the %s resize', (corner, resizedSize, expected) => {
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const resized = { ...initial, ...resizedSize };

    expectTransform(resizeCroppedLayer(clipFor(), initial, resized, corner), expected);
  });

  it('anchors against the mirrored crop coordinates on both axes', () => {
    const clip = clipFor({ isMirrored: true, isMirroredY: true });
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const resized = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };

    expectTransform(resizeCroppedLayer(clip, initial, resized, 'bottom-right'), {
      x: 0.14,
      y: 0.25,
      width: 0.6,
      height: 0.5,
    });
  });

  it('preserves the original aspect ratio when a corner resize locks the aspect', () => {
    const clip = clipFor();
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const resized = { x: 0.2, y: 0.3, width: 0.5, height: 0.8 };

    expectTransform(resizeCroppedLayer(clip, initial, resized, 'bottom-right', true), {
      x: 0.16,
      y: 0.2625,
      width: 0.6,
      height: 0.45,
    });
  });

  it.each([
    ['minimum', { x: 0.2, y: 0.3, width: 0.01, height: 0.01 }, { width: 0.02, height: 0.02 }],
    ['maximum', { x: 0.2, y: 0.3, width: 2.5, height: 2.5 }, { width: 4, height: 4 }],
  ] as const)('clamps the resized full layer at its %s bounds', (_name, resized, expectedSize) => {
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const result = resizeCroppedLayer(clipFor(), initial, resized, 'bottom-right');

    expect(result.width).toBe(expectedSize.width);
    expect(result.height).toBe(expectedSize.height);
    expect(result.width).toBeGreaterThanOrEqual(0.02);
    expect(result.height).toBeGreaterThanOrEqual(0.02);
    expect(result.width).toBeLessThanOrEqual(4);
    expect(result.height).toBeLessThanOrEqual(4);
  });

  it.each([
    ['without a crop', clipFor({ crop: undefined })],
    ['with non-custom framing', clipFor({ cameraFramingPreset: 'fill' })],
    [
      'with a phone frame',
      clipFor({ appearance: { ...createDefaultClipAppearance('video'), frame: 'iphone-16-max' } }),
    ],
  ] as const)('passes the requested transform through %s', (_name, clip) => {
    const initial = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
    const resized = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };

    expect(resizeCroppedLayer(clip, initial, resized, 'bottom-right')).toBe(resized);
  });
});
