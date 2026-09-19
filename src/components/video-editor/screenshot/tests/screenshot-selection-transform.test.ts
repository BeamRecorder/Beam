import { describe, expect, it } from 'vitest';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { CursorAssetDescriptor } from '~/api/types/cursor-pack';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import type { BlurClip, NormalizedTransform } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { screenshotShape, screenshotState } from '../screenshot-state';
import { SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID, screenshotLayers } from '../screenshot-layers';
import type { ScreenshotCursorAsset, ScreenshotCursorLayer, ScreenshotImageLayer } from '../screenshot-layer-types';
import type { ScreenshotRenderAssets } from '../screenshot-types';
import {
  applyScreenshotTranslation,
  constrainScreenshotTranslation,
  movableScreenshotSelection,
  snapScreenshotTranslation,
  withScreenshotTranslation,
} from '../screenshot-selection-transform';

const pointerAsset: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://cursor/pack/pointer.svg',
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 64, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
};

const documentFixture = (): ScreenshotDocument => ({
  id: 'screen-1',
  name: 'Captured screen',
  width: 1_000,
  height: 600,
  source: 'project-media://screenshot/screen-1/source.png',
  preset: {
    editor: { schemaVersion: 1 },
    devices: {},
    export: { format: 'png', resolution: '1080p' },
    quickSnip: { automaticZoom: false },
  },
  state: null,
});

const makeImage = (
  base: ScreenshotState['image'],
  id: string,
  transform: NormalizedTransform,
  enabled = true,
): ScreenshotImageLayer => ({
  ...base,
  id,
  kind: 'image',
  name: id,
  assetId: id,
  source: `project-media://screenshot/${id}.png`,
  width: 640,
  height: 480,
  enabled,
  transform,
});

const makeShape = (id: string, transform: NormalizedTransform, enabled = true) => {
  const shape = screenshotShape('rectangle', id);
  shape.transform = transform;
  shape.enabled = enabled;
  return shape;
};

const makeEffect = (id: string, transform: NormalizedTransform, enabled = true): BlurClip => ({
  id,
  assetId: id,
  kind: 'blur',
  name: `Highlight ${id}`,
  timelineStartMs: 0,
  timelineDurationMs: 1,
  sourceInMs: 0,
  sourceDurationMs: 1,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled,
  order: 0,
  transform,
  shape: 'rectangle',
  mode: 'highlight',
  strength: 50,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#ffcc00',
});

const makeCursor = (id: string, position: { x: number; y: number }, enabled = true): ScreenshotCursorLayer => ({
  id,
  name: `Cursor ${id}`,
  enabled,
  position,
  size: 45,
  rotation: 0,
  selection: { packId: 'pack:sample', mode: 'fixed', cursorId: pointerAsset.id },
  color: '#ffffff',
  shadowEnabled: false,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowDirection: 'all',
});

const makeState = (): ScreenshotState => {
  const state = screenshotState(documentFixture());
  state.canvas = {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 1_000,
    height: 600,
    showBackground: false,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: false },
  };
  state.image.transform = { x: 0.1, y: 0.2, width: 0.25, height: 0.2 };
  state.images = [
    makeImage(state.image, 'image-moving', { x: 0.45, y: 0.35, width: 0.2, height: 0.18 }),
    makeImage(state.image, 'image-static', { x: 0.7, y: 0.3, width: 0.1, height: 0.1 }),
  ];
  state.shapes = [
    makeShape('shape-moving', { x: 0.28, y: 0.55, width: 0.1, height: 0.16 }),
    makeShape('shape-static', { x: 0.1, y: 0.1, width: 0.12, height: 0.1 }),
  ];
  state.effects = [
    makeEffect('effect-moving', { x: 0.62, y: 0.11, width: 0.15, height: 0.12 }),
    makeEffect('effect-static', { x: 0.15, y: 0.65, width: 0.12, height: 0.1 }),
  ];
  state.cursors = [makeCursor('cursor-moving', { x: 0.52, y: 0.7 }), makeCursor('cursor-static', { x: 0.8, y: 0.8 })];
  return state;
};

const movingIds = (state: ScreenshotState) => [
  state.image.id,
  'image-moving',
  'shape-moving',
  'effect-moving',
  'cursor-moving',
];

const cursorAsset = (): ScreenshotCursorAsset => ({ image: {} as CanvasImageSource, asset: pointerAsset });

const renderAssets = (cursorId = 'cursor-moving'): ScreenshotRenderAssets => ({
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 1_000,
  height: 600,
  cursors: new Map([[cursorId, cursorAsset()]]),
});

const expectTranslatedPoint = (
  actual: { x: number; y: number } | undefined,
  initial: { x: number; y: number },
  delta: { x: number; y: number },
) => {
  expect(actual).toBeDefined();
  if (!actual) return;
  expect(actual.x).toBeCloseTo(initial.x + delta.x);
  expect(actual.y).toBeCloseTo(initial.y + delta.y);
};

const expectTranslatedTransform = (
  actual: NormalizedTransform | undefined,
  initial: NormalizedTransform,
  delta: { x: number; y: number },
) => {
  expectTranslatedPoint(actual, initial, delta);
  if (!actual) return;
  expect(actual.width).toBe(initial.width);
  expect(actual.height).toBe(initial.height);
};

describe('screenshot selection translation', () => {
  it('snaps the group envelope to alignment guides without changing member spacing', () => {
    const state = makeState();
    const selected = ['shape-moving', 'effect-moving'];
    const snapped = snapScreenshotTranslation(state, selected, { x: -0.025, y: 0 }, renderAssets());
    const preview = withScreenshotTranslation(state, selected, snapped.translation);

    expect(snapped.translation.x).toBeCloseTo(-0.025);
    expect(snapped.guides).toContainEqual({ type: 'vertical', position: 0.5 });
    expect(preview.effects![0]!.transform.x - preview.shapes[0]!.transform.x).toBeCloseTo(
      state.effects![0]!.transform.x - state.shapes[0]!.transform.x,
    );
  });

  it('moves every selected layer family by one shared delta without changing offsets or source records', () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    const selected = movingIds(state);
    const delta = { x: 0.05, y: -0.03 };
    const staticImage = state.images![1]!;
    const staticShape = state.shapes[1]!;
    const staticEffect = state.effects![1]!;
    const staticCursor = state.cursors![1]!;

    expect(movableScreenshotSelection(state, selected).map(({ id }) => id)).toEqual(selected);

    const next = withScreenshotTranslation(state, selected, delta);

    expect(next).not.toBe(state);
    expect(next.image).not.toBe(state.image);
    expectTranslatedTransform(next.image.transform, snapshot.image.transform, delta);
    expect(next.images?.[0]).not.toBe(state.images![0]);
    expectTranslatedTransform(next.images?.[0]?.transform, snapshot.images![0]!.transform, delta);
    expect(next.shapes[0]).not.toBe(state.shapes[0]);
    expectTranslatedTransform(next.shapes[0]?.transform, snapshot.shapes[0]!.transform, delta);
    expect(next.effects?.[0]).not.toBe(state.effects![0]);
    expectTranslatedTransform(next.effects?.[0]?.transform, snapshot.effects![0]!.transform, delta);
    expect(next.cursors?.[0]).not.toBe(state.cursors![0]);
    expectTranslatedPoint(next.cursors?.[0]?.position, snapshot.cursors![0]!.position, delta);

    expect(next.images?.[1]).toBe(staticImage);
    expect(next.shapes[1]).toBe(staticShape);
    expect(next.effects?.[1]).toBe(staticEffect);
    expect(next.cursors?.[1]).toBe(staticCursor);
    expect(next.images![0]!.transform.x - next.image.transform.x).toBeCloseTo(
      state.images![0]!.transform.x - state.image.transform.x,
    );
    expect(next.images![0]!.transform.y - next.image.transform.y).toBeCloseTo(
      state.images![0]!.transform.y - state.image.transform.y,
    );
    expect(state).toEqual(snapshot);
  });

  it('constrains the whole group with one shared delta at the same normalized edges', () => {
    const state = makeState();
    state.image.transform = { x: 0.1, y: 0.15, width: 0.2, height: 0.3 };
    state.images![0]!.transform = { x: 0.55, y: 0.35, width: 0.2, height: 0.25 };
    state.shapes[0]!.transform = { x: 0.7, y: 0.6, width: 0.1, height: 0.25 };
    state.effects![0]!.transform = { x: 0.45, y: 0.3, width: 0.2, height: 0.2 };
    state.cursors![0]!.position = { x: 0.8, y: 0.65 };
    const selected = movingIds(state);
    const assets = renderAssets();

    const rightBottom = constrainScreenshotTranslation(state, selected, { x: 1, y: 1 }, assets);
    const movedRightBottom = withScreenshotTranslation(state, selected, rightBottom);
    expect(rightBottom.x).toBeCloseTo(0.19);
    expect(rightBottom.y).toBeCloseTo(0.34);
    expect(movedRightBottom.image.transform.x - state.image.transform.x).toBeCloseTo(rightBottom.x);
    expect(movedRightBottom.images![0]!.transform.y - state.images![0]!.transform.y).toBeCloseTo(rightBottom.y);
    expect(movedRightBottom.shapes[0]!.transform.x - state.shapes[0]!.transform.x).toBeCloseTo(rightBottom.x);
    expect(movedRightBottom.effects![0]!.transform.y - state.effects![0]!.transform.y).toBeCloseTo(rightBottom.y);
    expect(movedRightBottom.cursors![0]!.position.x - state.cursors![0]!.position.x).toBeCloseTo(rightBottom.x);

    const leftTop = constrainScreenshotTranslation(state, selected, { x: -1, y: -1 }, assets);
    const movedLeftTop = withScreenshotTranslation(state, selected, leftTop);
    expect(leftTop.x).toBeCloseTo(-0.29);
    expect(leftTop.y).toBeCloseTo(-0.44);
    expect(movedLeftTop.image.transform.x - state.image.transform.x).toBeCloseTo(leftTop.x);
    expect(movedLeftTop.images![0]!.transform.y - state.images![0]!.transform.y).toBeCloseTo(leftTop.y);
    expect(movedLeftTop.shapes[0]!.transform.x - state.shapes[0]!.transform.x).toBeCloseTo(leftTop.x);
    expect(movedLeftTop.effects![0]!.transform.y - state.effects![0]!.transform.y).toBeCloseTo(leftTop.y);
    expect(movedLeftTop.cursors![0]!.position.x - state.cursors![0]!.position.x).toBeCloseTo(leftTop.x);
  });

  it('never moves hidden, locked, background, or watermark members', () => {
    const state = makeState();
    state.image.enabled = false;
    state.images = [makeImage(state.image, 'image-hidden', { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, false)];
    state.shapes = [makeShape('shape-locked', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 })];
    state.effects = [makeEffect('effect-hidden', { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, false)];
    state.cursors = [makeCursor('cursor-locked', { x: 0.5, y: 0.5 })];
    state.canvas.showBackground = true;
    state.canvas.watermark = { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true };
    state.background = { id: 'background', name: 'Background', kind: 'color', color: '#123456' };
    const lockedIds = new Set(['shape-locked', 'cursor-locked']);
    state.composition = screenshotLayers(state).map(({ id }) => ({
      ...defaultLayerCompositing(id),
      locked: lockedIds.has(id),
    }));
    const selected = [
      state.image.id,
      'image-hidden',
      'shape-locked',
      'effect-hidden',
      'cursor-locked',
      SCREENSHOT_BACKGROUND_ID,
      SCREENSHOT_WATERMARK_ID,
    ];
    const snapshot = structuredClone(state);

    expect(movableScreenshotSelection(state, selected)).toEqual([]);
    const preview = withScreenshotTranslation(state, selected, { x: 0.1, y: -0.1 });

    expect(preview.image).toBe(state.image);
    expect(preview.images?.[0]).toBe(state.images![0]);
    expect(preview.shapes[0]).toBe(state.shapes[0]);
    expect(preview.effects?.[0]).toBe(state.effects![0]);
    expect(preview.cursors?.[0]).toBe(state.cursors![0]);
    expect(preview.background).toBe(state.background);
    expect(preview.canvas).toBe(state.canvas);
    applyScreenshotTranslation(state, selected, { x: 0.1, y: -0.1 });
    expect(state).toEqual(snapshot);
  });

  it('commits selected coordinates in place while preserving collection and record identities', () => {
    const state = makeState();
    const selected = movingIds(state);
    const delta = { x: 0.04, y: -0.02 };
    const image = state.image;
    const imageTransform = image.transform;
    const images = state.images;
    const movingImage = state.images![0]!;
    const movingImageTransform = movingImage.transform;
    const staticImage = state.images![1]!;
    const shapes = state.shapes;
    const movingShape = state.shapes[0]!;
    const movingShapeTransform = movingShape.transform;
    const staticShape = state.shapes[1]!;
    const effects = state.effects;
    const movingEffect = state.effects![0]!;
    const movingEffectTransform = movingEffect.transform;
    const staticEffect = state.effects![1]!;
    const cursors = state.cursors;
    const movingCursor = state.cursors![0]!;
    const movingCursorPosition = movingCursor.position;
    const staticCursor = state.cursors![1]!;
    const snapshot = structuredClone(state);

    applyScreenshotTranslation(state, selected, delta);

    expect(state.image).toBe(image);
    expect(state.image.transform).toBe(imageTransform);
    expectTranslatedTransform(state.image.transform, snapshot.image.transform, delta);
    expect(state.images).toBe(images);
    expect(state.images?.[0]).toBe(movingImage);
    expect(state.images?.[0]?.transform).toBe(movingImageTransform);
    expectTranslatedTransform(state.images?.[0]?.transform, snapshot.images![0]!.transform, delta);
    expect(state.images?.[1]).toBe(staticImage);
    expect(state.shapes).toBe(shapes);
    expect(state.shapes[0]).toBe(movingShape);
    expect(state.shapes[0]?.transform).toBe(movingShapeTransform);
    expectTranslatedTransform(state.shapes[0]?.transform, snapshot.shapes[0]!.transform, delta);
    expect(state.shapes[1]).toBe(staticShape);
    expect(state.effects).toBe(effects);
    expect(state.effects?.[0]).toBe(movingEffect);
    expect(state.effects?.[0]?.transform).toBe(movingEffectTransform);
    expectTranslatedTransform(state.effects?.[0]?.transform, snapshot.effects![0]!.transform, delta);
    expect(state.effects?.[1]).toBe(staticEffect);
    expect(state.cursors).toBe(cursors);
    expect(state.cursors?.[0]).toBe(movingCursor);
    expect(state.cursors?.[0]?.position).toBe(movingCursorPosition);
    expectTranslatedPoint(state.cursors?.[0]?.position, snapshot.cursors![0]!.position, delta);
    expect(state.cursors?.[1]).toBe(staticCursor);
  });

  it('treats empty and unknown selections as no-ops', () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    const delta = { x: 0.2, y: -0.2 };

    expect(movableScreenshotSelection(state, [])).toEqual([]);
    expect(constrainScreenshotTranslation(state, [], delta, null)).toEqual({ x: 0, y: 0 });
    expect(constrainScreenshotTranslation(state, ['missing-layer'], delta, null)).toEqual({ x: 0, y: 0 });

    const emptyPreview = withScreenshotTranslation(state, [], delta);
    const unknownPreview = withScreenshotTranslation(state, ['missing-layer'], delta);
    expect(emptyPreview.image).toBe(state.image);
    expect(unknownPreview.image).toBe(state.image);
    expect(emptyPreview.images?.[0]).toBe(state.images?.[0]);
    expect(unknownPreview.shapes[0]).toBe(state.shapes[0]);
    applyScreenshotTranslation(state, [], delta);
    applyScreenshotTranslation(state, ['missing-layer'], delta);
    expect(state).toEqual(snapshot);
  });
});
