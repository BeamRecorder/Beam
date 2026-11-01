import { expect, it } from 'vitest';
import { elementAssetPreviewClip } from '../element-asset-preview';
import { saveElementAsset, elementAssetTransform } from '@beam/engine/shared/element-assets';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { createElementText } from '@beam/engine/shared/element-text';
import { arrowVector } from '@beam/engine/shared/shape-vector-presets';

const sourceCanvas = { width: 1920, height: 1080 };
it('previews the exact saved bubble, text, gradient and shadow style without mutating the template', () => {
  const asset = saveElementAsset(
    shape({
      name: 'Bubble',
      preset: 'speech-bubble',
      text: createElementText('Hello'),
      shadowEnabled: true,
      shadowBlur: 20,
      borderWidth: 8,
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 45,
          stops: [
            { id: 'start', color: '#ee7733', position: 0, alpha: 1 },
            { id: 'end', color: '#ffcc33', position: 1, alpha: 1 },
          ],
        },
      },
    }),
    sourceCanvas,
  );
  const snapshot = JSON.stringify(asset),
    preview = elementAssetPreviewClip(asset, sourceCanvas);
  expect(preview).toMatchObject({ ...asset.style, name: 'Bubble', kind: 'shape', enabled: true });
  expect(preview.text?.content).toBe('Hello');
  expect(JSON.stringify(asset)).toBe(snapshot);
});
it('preserves a custom arrow vector, markers, colors and rotation', () => {
  const asset = saveElementAsset(
    shape({
      name: 'Arrow',
      family: 'arrow',
      preset: 'arrow',
      vector: arrowVector('curved'),
      rotation: 45,
      fillColor: '#22cc66',
      borderColor: '#ff0000',
      borderWidth: 6,
    }),
    sourceCanvas,
  );
  expect(elementAssetPreviewClip(asset, sourceCanvas)).toMatchObject({
    vector: asset.style.vector,
    rotation: 45,
    fillColor: '#22cc66',
    borderColor: '#ff0000',
  });
});
it('uses the current project canvas and the same aspect-preserving transform as insertion', () => {
  const asset = saveElementAsset(shape({ name: 'Saved' }), sourceCanvas);
  for (const canvas of [sourceCanvas, { width: 720, height: 1280 }]) {
    expect(elementAssetPreviewClip(asset, canvas).transform).toEqual(elementAssetTransform(asset, canvas));
  }
});
