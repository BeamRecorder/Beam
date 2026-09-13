import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  COMPOSITION_SCHEMA_VERSION,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type NormalizedCrop,
  type VisualClip,
} from '~/media/shared/composition-types';
import {
  changeCropEdge,
  cropsEqual,
  cropFromPixels,
  cropPixels,
  cropSourceDimensions,
  snapCropToPixels,
} from './crop-pixels';
import type { CropDimensions, CropPixels } from './crop-types';

const assetFor = (id: string, width: number | null, height: number | null): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.mp4`,
  durationMs: 1_000,
  width,
  height,
  src: `${id}.mp4`,
  origin: 'project',
});

const visualClip = (assetId = 'video'): VisualClip => ({
  id: 'clip',
  kind: 'video',
  name: 'Clip',
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'clip-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
});

const audioClip = (): AudioClip => ({
  id: 'audio',
  kind: 'audio',
  name: 'Audio',
  assetId: 'audio',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 1,
  role: 'imported',
  volume: 100,
});

const compositionFor = (assets: ReadonlyArray<MediaAsset>, clips: Clip[] = [visualClip()]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [...assets],
  clips,
  keyboardCaptionSessions: [],
});

const expectCropPixels = (actual: CropPixels, expected: CropPixels) => {
  expect(actual).toEqual(expected);
};

describe('crop pixel conversion', () => {
  it('returns linked integer source dimensions for a valid media asset', () => {
    const clip = visualClip();
    const composition = compositionFor([assetFor('video', 1_920, 1_080)]);

    expect(cropSourceDimensions(composition, clip)).toEqual({
      width: 1_920,
      height: 1_080,
    });
  });

  it.each([
    ['a missing asset', [], visualClip('missing')],
    ['a missing width', [assetFor('video', null, 1_080)], visualClip()],
    ['a missing height', [assetFor('video', 1_920, null)], visualClip()],
    ['a zero width', [assetFor('video', 0, 1_080)], visualClip()],
    ['a negative height', [assetFor('video', 1_920, -1)], visualClip()],
    ['a fractional width', [assetFor('video', 1_920.5, 1_080)], visualClip()],
    ['a non-finite height', [assetFor('video', 1_920, Number.POSITIVE_INFINITY)], visualClip()],
  ] as const)('returns null for %s', (_name, assets, clip) => {
    expect(cropSourceDimensions(compositionFor(assets), clip)).toBeNull();
  });

  it('returns null for a clip without a media asset', () => {
    const clip = audioClip();
    const composition = compositionFor([assetFor('audio', null, null)], [clip]);

    expect(cropSourceDimensions(composition, clip)).toBeNull();
  });

  it('uses the complete source when no crop is present, including a one-pixel source', () => {
    expectCropPixels(cropPixels(undefined, { width: 1_920, height: 1_080 }), {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 1_920,
      height: 1_080,
    });
    expectCropPixels(cropPixels(undefined, { width: 1, height: 1 }), {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 1,
      height: 1,
    });
  });

  it('converts a partial crop to pixel edges and back without changing its dimensions', () => {
    const size: CropDimensions = { width: 1_920, height: 1_080 };
    const crop: NormalizedCrop = { x: 0.125, y: 0.25, width: 0.5, height: 0.5 };
    const pixels = cropPixels(crop, size);

    expectCropPixels(pixels, {
      left: 240,
      top: 270,
      right: 720,
      bottom: 270,
      width: 960,
      height: 540,
    });
    expect(cropFromPixels(pixels, size)).toEqual(crop);
  });

  it('clamps malformed crop edges while retaining at least one source pixel', () => {
    const pixels = cropPixels({ x: -1, y: 2, width: 3, height: -1 }, { width: 5, height: 4 });

    expectCropPixels(pixels, {
      left: 0,
      top: 3,
      right: 0,
      bottom: 0,
      width: 5,
      height: 1,
    });
  });

  const edgeCases: ReadonlyArray<{
    edge: 'left' | 'right' | 'top' | 'bottom';
    value: number;
    expected: CropPixels;
  }> = [
    {
      edge: 'left',
      value: 95,
      expected: {
        left: 79,
        top: 12,
        right: 20,
        bottom: 18,
        width: 1,
        height: 50,
      },
    },
    {
      edge: 'right',
      value: 95,
      expected: {
        left: 10,
        top: 12,
        right: 89,
        bottom: 18,
        width: 1,
        height: 50,
      },
    },
    {
      edge: 'top',
      value: 75,
      expected: {
        left: 10,
        top: 61,
        right: 20,
        bottom: 18,
        width: 70,
        height: 1,
      },
    },
    {
      edge: 'bottom',
      value: 75,
      expected: {
        left: 10,
        top: 12,
        right: 20,
        bottom: 67,
        width: 70,
        height: 1,
      },
    },
  ];

  it.each(edgeCases)(
    'changes only the $edge edge and clamps it to preserve a one-pixel interior',
    ({ edge, value, expected }) => {
      const size: CropDimensions = { width: 100, height: 80 };
      const initial = cropFromPixels({ left: 10, top: 12, right: 20, bottom: 18, width: 70, height: 50 }, size);

      expectCropPixels(cropPixels(changeCropEdge(initial, size, edge, value), size), expected);
    },
  );

  it('clamps an edge below zero and ignores non-finite edge values', () => {
    const size: CropDimensions = { width: 100, height: 80 };
    const initial = cropFromPixels({ left: 10, top: 12, right: 20, bottom: 18, width: 70, height: 50 }, size);

    expectCropPixels(cropPixels(changeCropEdge(initial, size, 'left', -5), size), {
      left: 0,
      top: 12,
      right: 20,
      bottom: 18,
      width: 80,
      height: 50,
    });
    expect(changeCropEdge(initial, size, 'bottom', Number.NaN)).toEqual(initial);
  });

  it('snaps partial crops to real pixels idempotently', () => {
    const size: CropDimensions = { width: 1_920, height: 1_080 };
    const crop: NormalizedCrop = {
      x: 0.12345,
      y: 0.23456,
      width: 0.54321,
      height: 0.45678,
    };
    const snapped = snapCropToPixels(crop, size);

    expect(snapped).toEqual(cropFromPixels(cropPixels(crop, size), size));
    expect(snapCropToPixels(snapped, size)).toEqual(snapped);
    expect(cropPixels(snapped, size).width).toBeGreaterThanOrEqual(1);
    expect(cropPixels(snapped, size).height).toBeGreaterThanOrEqual(1);
  });

  it('treats a cloned crop and an absent crop as equal to the full source', () => {
    const fullCrop: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };

    expect(cropsEqual(fullCrop, { ...fullCrop })).toBe(true);
    expect(cropsEqual(undefined, fullCrop)).toBe(true);
    expect(cropsEqual(fullCrop, undefined)).toBe(true);
  });

  it.each(['x', 'y', 'width', 'height'] as const)('detects a change to the crop %s field', (field) => {
    const crop: NormalizedCrop = {
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.6,
    };
    const changed = { ...crop, [field]: crop[field] + 0.01 };

    expect(cropsEqual(crop, changed)).toBe(false);
  });

  it('ignores sub-nanounit floating point noise while rejecting larger differences', () => {
    const crop: NormalizedCrop = {
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.6,
    };

    expect(cropsEqual(crop, { ...crop, x: crop.x + 5e-10 })).toBe(true);
    expect(cropsEqual(crop, { ...crop, x: crop.x + 2e-9 })).toBe(false);
  });
});
