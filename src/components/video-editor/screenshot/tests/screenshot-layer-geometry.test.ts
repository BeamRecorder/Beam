import { describe, expect, it } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotState } from '~/api/types/screenshot';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { screenshotShape } from '../screenshot-state';
import { createScreenshotCursor } from '../screenshot-cursors';
import type { ScreenshotCursorAsset } from '../screenshot-layer-types';
import { initializeScreenshotComposition } from '../screenshot-layers';
import type { ScreenshotRenderAssets } from '../screenshot-types';
import { screenshotLayerAt, screenshotLayerRotation, screenshotLayerTransform } from '../screenshot-layer-geometry';

const pointer: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://cursor/pack/pointer.svg',
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 64, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
};

const pack: CursorPackDescriptor = {
  id: 'pack:sample',
  name: 'Sample',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: pointer.id,
  cursors: [pointer],
  automaticMap: { default: pointer.id },
};

const makeState = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => ({
  canvas: {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 1200,
    height: 800,
    showBackground: false,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: false },
  },
  background: null,
  blurPercent: 0,
  image: {
    id: 'screenshot',
    kind: 'image',
    name: 'Captured screen',
    assetId: 'source',
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 1,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
  },
  shapes: [],
  format: 'png',
  quality: 0.9,
  ...overrides,
});

const makeAssets = (overrides: Partial<ScreenshotRenderAssets> = {}): ScreenshotRenderAssets => ({
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 2000,
  height: 1000,
  ...overrides,
});

const makeShape = (id: string, transform = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }) => {
  const shape = screenshotShape('rectangle', id);
  shape.transform = transform;
  return shape;
};

const layers = (state: ScreenshotState) => {
  initializeScreenshotComposition(state);
  return state.composition!;
};

describe('screenshot layer geometry', () => {
  it('uses the uncropped transform before assets load, then hit-tests the visible cropped image frame', () => {
    const state = makeState({
      image: {
        ...makeState().image,
        transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
        crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      },
    });
    const assets = makeAssets();

    expect(screenshotLayerTransform(state, null, 'screenshot')).toEqual(state.image.transform);
    expect(screenshotLayerTransform(state, assets, 'screenshot')).toEqual({
      x: 0.3,
      y: 0.2,
      width: 0.4,
      height: 0.6,
    });
    expect(screenshotLayerAt(state, assets, 0.5, 0.5)).toBe('screenshot');
    expect(screenshotLayerAt(state, assets, 0.25, 0.5)).toBeNull();
  });

  it('includes a phone frame in the image selection bounds', () => {
    const state = makeState({
      image: {
        ...makeState().image,
        transform: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
        appearance: { ...createDefaultClipAppearance('image'), frame: 'iphone-16-max' },
      },
    });

    const bounds = screenshotLayerTransform(state, makeAssets(), 'screenshot')!;

    expect(bounds.x).toBeGreaterThan(0.2);
    expect(bounds.y).toBeGreaterThan(0.1);
    expect(bounds.width).toBeLessThan(0.6);
    expect(bounds.height).toBeLessThan(0.8);
    expect((bounds.width * state.canvas.width) / (bounds.height * state.canvas.height)).toBeCloseTo(415 / 843);
  });

  it('returns cursor bounds from the selected cursor asset and skips unloaded cursors', () => {
    const cursor = createScreenshotCursor('cursor-1', 'Pointer', pack);
    cursor.position = { x: 0.3, y: 0.4 };
    const state = makeState({ cursors: [cursor] });
    const cursorAsset: ScreenshotCursorAsset = { image: {} as CanvasImageSource, asset: pointer };
    const assets = makeAssets({ cursors: new Map([[cursor.id, cursorAsset]]) });

    expect(screenshotLayerTransform(state, null, cursor.id)).toBeNull();
    const bounds = screenshotLayerTransform(state, assets, cursor.id)!;
    expect(bounds.x).toBe(0.3);
    expect(bounds.y).toBe(0.4);
    expect(bounds.width).toBeCloseTo(1 / 18);
    expect(bounds.height).toBeCloseTo(1 / 24);
    expect(screenshotLayerTransform(state, assets, 'missing')).toBeNull();
  });

  it('hits the topmost layer according to saved back-to-front compositing order', () => {
    const lower = makeShape('lower');
    const upper = makeShape('upper');
    const state = makeState({ image: { ...makeState().image, enabled: false }, shapes: [lower, upper] });
    layers(state);

    expect(screenshotLayerAt(state, null, 0.5, 0.5)).toBe('upper');

    state.composition = [
      defaultLayerCompositing('__background__'),
      defaultLayerCompositing('screenshot'),
      defaultLayerCompositing('upper'),
      defaultLayerCompositing('lower'),
      defaultLayerCompositing('__watermark__'),
    ];
    expect(screenshotLayerAt(state, null, 0.5, 0.5)).toBe('lower');
  });

  it.each([
    ['hidden', false, false, 100],
    ['locked', true, true, 100],
    ['fully transparent', true, false, 0],
  ] as const)('skips a %s foreground layer and selects the next eligible shape', (_label, enabled, locked, opacity) => {
    const state = makeState({
      image: { ...makeState().image, enabled: false },
      shapes: [makeShape('lower'), { ...makeShape('upper', { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }), enabled }],
    });
    layers(state);
    Object.assign(
      state.composition!.find(({ id }) => id === 'upper')!,
      { locked, opacity },
    );

    expect(screenshotLayerAt(state, null, 0.5, 0.5)).toBe('lower');
  });

  it('rotates non-square layer hit bounds in canvas pixel space', () => {
    const rotated = makeShape('rotated', { x: 0.3, y: 0.3, width: 0.4, height: 0.2 });
    rotated.rotation = 90;
    const state = makeState({
      canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: 'custom', width: 1200, height: 600, showBackground: false },
      image: { ...makeState().image, enabled: false },
      shapes: [rotated],
    });

    expect(screenshotLayerAt(state, null, 0.5, 0.55)).toBe('rotated');
    expect(screenshotLayerAt(state, null, 0.6, 0.4)).toBeNull();
  });

  it('reports shape and cursor rotation, defaulting to zero for other layers', () => {
    const shape = makeShape('shape');
    shape.rotation = 27;
    const cursor = createScreenshotCursor('cursor-1', 'Pointer', pack);
    cursor.rotation = 68;
    const state = makeState({ shapes: [shape], cursors: [cursor] });

    expect(screenshotLayerRotation(state, 'shape')).toBe(27);
    expect(screenshotLayerRotation(state, 'cursor-1')).toBe(68);
    expect(screenshotLayerRotation(state, 'screenshot')).toBe(0);
  });

  it('returns the background for empty canvas space only when it is visible', () => {
    const state = makeState({
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
      image: { ...makeState().image, enabled: false },
    });
    expect(screenshotLayerAt(state, null, 0.95, 0.95)).toBe('__background__');

    state.canvas.showBackground = false;
    expect(screenshotLayerAt(state, null, 0.95, 0.95)).toBeNull();
  });

  it('ignores a cursor without decoded art before reaching the background layer', () => {
    const cursor = createScreenshotCursor('cursor-1', 'Pointer', pack);
    const state = makeState({
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
      image: { ...makeState().image, enabled: false },
      cursors: [cursor],
    });

    expect(screenshotLayerAt(state, makeAssets(), 0.45, 0.45)).toBe('__background__');
  });
});
