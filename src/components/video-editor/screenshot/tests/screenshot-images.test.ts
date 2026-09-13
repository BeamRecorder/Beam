import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { createScreenshotImage, screenshotImage } from '../screenshot-images';
import { screenshotState } from '../screenshot-state';

const asset: MediaAsset = {
  id: 'asset-1',
  kind: 'image',
  name: 'Photo',
  fileName: 'asset-1.png',
  durationMs: 0,
  width: null,
  height: null,
  src: 'project-media://screenshot/11111111-1111-4111-8111-111111111111/media/22222222-2222-4222-8222-222222222222.png',
  origin: 'project',
};

const canvas = { ...DEFAULT_OUTPUT_CANVAS, width: 1200, height: 800 };

const stateFixture = () =>
  screenshotState({
    id: 'screenshot-1',
    name: 'Screenshot',
    source: 'project-media://screenshot/screenshot-1/source.png',
    width: 1200,
    height: 800,
    state: null,
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    },
  });

describe('createScreenshotImage', () => {
  it.each([
    { name: 'landscape', width: 1600, height: 900 },
    { name: 'portrait', width: 900, height: 1600 },
  ])('centers and fits a $name image inside 60% of the canvas without stretching', ({ width, height }) => {
    const image = createScreenshotImage(asset, width, height, canvas);
    const fittedWidth = image.transform.width * canvas.width;
    const fittedHeight = image.transform.height * canvas.height;

    expect(image.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(image).toMatchObject({
      kind: 'image',
      name: asset.name,
      assetId: asset.id,
      source: asset.src,
      width,
      height,
      enabled: true,
      isMirrored: false,
      isMirroredY: false,
      cameraFramingPreset: 'fit',
    });
    expect(image.appearance).toEqual(createDefaultClipAppearance('image'));
    expect(fittedWidth / fittedHeight).toBeCloseTo(width / height);
    expect(fittedWidth).toBeLessThanOrEqual(canvas.width * 0.6 + Number.EPSILON);
    expect(fittedHeight).toBeLessThanOrEqual(canvas.height * 0.6 + Number.EPSILON);
    expect(image.transform.x * canvas.width + fittedWidth / 2).toBeCloseTo(canvas.width / 2);
    expect(image.transform.y * canvas.height + fittedHeight / 2).toBeCloseTo(canvas.height / 2);
    expect(Math.max(fittedWidth / (canvas.width * 0.6), fittedHeight / (canvas.height * 0.6))).toBeCloseTo(1);
  });
});

describe('screenshotImage', () => {
  it('resolves the captured image and a separately imported image by layer ID', () => {
    const state = stateFixture();
    const captured = state.image;
    const imported = createScreenshotImage(asset, 800, 600, state.canvas);
    imported.id = 'image-layer-1';
    state.images = [imported];

    expect(screenshotImage(state, 'screenshot')).toBe(captured);
    expect(screenshotImage(state, 'image-layer-1')).toBe(imported);
  });

  it('returns no image for null, missing, or absent imported-layer IDs', () => {
    const state = stateFixture();
    state.images = [];
    expect(screenshotImage(state, null)).toBeUndefined();
    delete state.images;
    expect(screenshotImage(state, 'missing')).toBeUndefined();
  });
});
