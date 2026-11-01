import { expect, it } from 'vitest';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { elementAssetTransform, isElementAsset, readElementAssets, saveElementAsset } from '../element-assets';
import { createElementText } from '../element-text';
import { arrowVector } from '../shape-vector-presets';

const canvas = { width: 1920, height: 1080 };
const make = () =>
  saveElementAsset(shape({ name: 'My bubble', preset: 'speech-bubble', text: createElementText('Hello') }), canvas);
it('snapshots customized geometry, gradients, borders, shadows and text without project identity or timing', () => {
  const clip = shape({
    name: 'Custom arrow',
    family: 'arrow',
    preset: 'arrow',
    vector: arrowVector('line'),
    shadowEnabled: true,
  });
  const asset = saveElementAsset(clip, canvas);
  expect(asset.style).toMatchObject({ shadowEnabled: true, vector: clip.vector });
  expect(asset).not.toHaveProperty('timelineStartMs');
  expect(asset.style).not.toHaveProperty('id');
  expect(asset.id).not.toBe(clip.id);
  clip.fillColor = '#ffffff';
  expect(asset.style.fillColor).not.toBe('#ffffff');
  const bubble = make();
  expect(bubble.style.text?.content).toBe('Hello');
});
it('retains size and aspect ratio on a new canvas and scales oversized assets to fit', () => {
  const asset = make(),
    portrait = { width: 720, height: 1280 };
  for (const target of [canvas, portrait, { width: 50, height: 80 }]) {
    const rect = elementAssetTransform(asset, target);
    expect((rect.width * target.width) / (rect.height * target.height)).toBeCloseTo(
      asset.size.width / asset.size.height,
    );
    expect(rect.width).toBeLessThanOrEqual(0.8);
    expect(rect.height).toBeLessThanOrEqual(0.8);
    expect(rect.x).toBeCloseTo((1 - rect.width) / 2);
  }
});
it('validates persisted assets and rejects malformed geometry, text, metadata and dimensions', () => {
  const asset = make();
  for (const bad of [
    null,
    {},
    { ...asset, id: '' },
    { ...asset, name: '' },
    { ...asset, name: 'x'.repeat(201) },
    { ...asset, size: { width: NaN, height: 10 } },
    { ...asset, size: { width: 10, height: -1 } },
    { ...asset, style: { ...asset.style, vector: {} } },
    { ...asset, style: { ...asset.style, text: {} } },
  ])
    expect(isElementAsset(bad)).toBe(false);
  expect(readElementAssets(undefined)).toEqual([]);
  expect(readElementAssets([asset, null, asset])).toEqual([asset]);
  const copy = readElementAssets([asset])[0]!;
  copy.style.fillColor = '#ffffff';
  expect(asset.style.fillColor).not.toBe('#ffffff');
});
it('refuses invalid saves and invalid destination canvases', () => {
  expect(() => saveElementAsset(shape({ name: '' }), canvas)).toThrow();
  expect(() => elementAssetTransform(make(), { width: 0, height: 10 })).toThrow();
});
