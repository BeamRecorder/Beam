import { describe, it, expect } from 'vitest';
import { createStillDocument } from '@beam/engine';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ScreenshotLayer, ScreenshotCursorLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotCursorAsset } from './screenshot-types';
import { screenshotLayerEffectRect } from './screenshot-layer-effect-geometry';

const state = () => createStillDocument('test', 'source.png', 1000, 500).state;
const layer = (id: string): ScreenshotLayer => ({
  id,
  kind: 'image',
  name: id,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  visible: true,
});
const cursor: ScreenshotCursorLayer = {
  id: 'cursor',
  name: 'Cursor',
  enabled: true,
  position: { x: 0.2, y: 0.3 },
  size: 32,
  rotation: 45,
  selection: { mode: 'fixed', packId: 'test', cursorId: 'arrow' },
  color: '#fff',
  shadowEnabled: false,
  shadowBlur: 0,
  shadowColor: '#000',
  shadowDirection: 'all',
};
const cursorAsset: ScreenshotCursorAsset = {
  image: {} as CanvasImageSource,
  asset: {
    id: 'arrow',
    label: 'Arrow',
    url: 'arrow.png',
    nominalSize: 32,
    intrinsicSize: { width: 32, height: 64 },
    hotspot: { x: 0, y: 0 },
  },
};

describe('screenshot gradient local geometry', () => {
  it('uses decoded captured-image dimensions and retains item rotation at preview scale', () => {
    const s = state();
    s.image.rotation = 30;
    expect(screenshotLayerEffectRect(s, layer('image'), { width: 1000, height: 500 }, 200, 100)).toMatchObject({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      rotation: 30,
    });
  });
  it('resolves an imported image from its own decoded asset rather than the capture', () => {
    const s = state();
    s.images = [{ ...s.image, id: 'imported', source: 'imported.png', width: 100, height: 100, rotation: 20 }];
    const rect = screenshotLayerEffectRect(
      s,
      layer('imported'),
      {
        width: 1000,
        height: 500,
        images: new Map([['imported', { image: {} as CanvasImageSource, width: 100, height: 100 }]]),
      },
      200,
      100,
    );
    expect(rect).toMatchObject({ width: 100, height: 100, rotation: 20 });
  });
  it.each([{}, { width: 1000, height: 0 }])(
    'rejects missing image dimensions instead of using the canvas as its local frame',
    (assets) => {
      expect(() => screenshotLayerEffectRect(state(), layer('image'), assets, 200, 100)).toThrow('dimensions');
    },
  );
  it.each(['shape', 'text', 'drawing'] as const)('maps normalized %s content into the output frame', (family) => {
    const s = state();
    s.shapes = [
      { id: 'shape', family, transform: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, rotation: -15 } as ShapeClip,
    ];
    expect(screenshotLayerEffectRect(s, layer('shape'), {}, 200, 100)).toEqual({
      x: 20,
      y: 20,
      width: 80,
      height: 30,
      rotation: -15,
    });
  });
  it('uses cursor artwork aspect ratio and the saved cursor rotation', () => {
    const s = state();
    s.cursors = [cursor];
    const rect = screenshotLayerEffectRect(
      s,
      layer('cursor'),
      { cursors: new Map([['cursor', cursorAsset]]) },
      200,
      100,
    );
    expect(rect.x).toBe(40);
    expect(rect.y).toBe(30);
    expect(rect.rotation).toBe(45);
    expect(rect.width).toBeCloseTo((32 * 100) / 1080);
    expect(rect.height).toBeCloseTo(rect.width * 2);
  });
  it('rejects missing cursor artwork', () => {
    const s = state();
    s.cursors = [cursor];
    expect(() => screenshotLayerEffectRect(s, layer('cursor'), {}, 200, 100)).toThrow('cursor');
  });
  it.each(['__background__', '__watermark__'])('fills the viewport for %s', (id) => {
    const s = state(),
      target = screenshotLayers(s).find((item) => item.id === id)!;
    expect(screenshotLayerEffectRect(s, target, {}, 200, 100)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});
