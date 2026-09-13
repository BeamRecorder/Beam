import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import { describe, expect, it } from 'vitest';
import { screenshotShape, screenshotState } from '../screenshot-state';
import { createScreenshotCursor, screenshotCursorTransform } from '../screenshot-cursors';
import type { ScreenshotCursorAsset, ScreenshotImageLayer } from '../screenshot-layer-types';
import type { ScreenshotRenderAssets } from '../screenshot-types';
import { withScreenshotTransform } from '../screenshot-transform';

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

const documentFixture = (): ScreenshotDocument => ({
  id: 'screen-1',
  name: 'Captured screen',
  width: 1200,
  height: 800,
  source: 'project-media://screenshot/screen-1/source.png',
  preset: {
    editor: { schemaVersion: 1 },
    devices: {},
    export: { format: 'png', resolution: '1080p' },
    quickSnip: { automaticZoom: false },
  },
  state: null,
});

const makeState = (): ScreenshotState => screenshotState(documentFixture());

const makeScreenshotImage = (id: string): ScreenshotImageLayer => ({
  ...makeState().image,
  kind: 'image',
  id,
  name: `Image ${id}`,
  assetId: id,
  source: `project-media://screenshot/${id}.png`,
  width: 640,
  height: 480,
  transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 },
});

const makeCursor = (size = 45) => {
  const cursor = createScreenshotCursor('cursor-1', 'Pointer', pack);
  cursor.position = { x: 0.2, y: 0.3 };
  cursor.size = size;
  return cursor;
};

const makeAssets = (cursor?: ScreenshotCursorAsset): ScreenshotRenderAssets => ({
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 1200,
  height: 800,
  cursors: cursor ? new Map([['cursor-1', cursor]]) : new Map(),
});

const transform: NormalizedTransform = { x: 0.55, y: 0.4, width: 0.3, height: 0.25 };

describe('withScreenshotTransform', () => {
  it('clones the captured image layer when moving the main screenshot', () => {
    const state = makeState();
    const snapshot = structuredClone(state);

    const next = withScreenshotTransform(state, state.image.id, transform, null);

    expect(next).not.toBe(state);
    expect(next.image).not.toBe(state.image);
    expect(next.image.transform).toEqual(transform);
    expect(state).toEqual(snapshot);
  });

  it('updates one additional image without mutating other image entries', () => {
    const state = makeState();
    const first = makeScreenshotImage('image-first');
    const second = makeScreenshotImage('image-second');
    state.images = [first, second];
    const snapshot = structuredClone(state);

    const next = withScreenshotTransform(state, first.id, transform, null);

    expect(next.images).not.toBe(state.images);
    expect(next.images?.[0]).not.toBe(first);
    expect(next.images?.[0]?.transform).toEqual(transform);
    expect(next.images?.[1]).toBe(second);
    expect(state).toEqual(snapshot);
  });

  it('clones shape and text elements while preserving their other content', () => {
    const state = makeState();
    const rectangle = screenshotShape('rectangle', 'shape-1');
    const text = {
      ...screenshotShape('text', 'text-1'),
      family: 'text' as const,
      text: createElementText('Hello'),
    };
    state.shapes = [rectangle, text];
    const snapshot = structuredClone(state);

    const next = withScreenshotTransform(state, text.id, transform, null);

    expect(next.shapes).not.toBe(state.shapes);
    expect(next.shapes[0]).toBe(rectangle);
    expect(next.shapes[1]).not.toBe(text);
    expect(next.shapes[1]?.transform).toEqual(transform);
    expect(next.shapes[1]?.text).toEqual(text.text);
    expect(state).toEqual(snapshot);
  });

  it('moves and resizes a cursor by preserving its aspect ratio and leaving the source untouched', () => {
    const cursor = makeCursor();
    const earlierCursor = createScreenshotCursor('cursor-before', 'Pointer before', pack);
    const state = makeState();
    state.cursors = [earlierCursor, cursor];
    const cursorAsset: ScreenshotCursorAsset = { image: {} as CanvasImageSource, asset: pointer };
    const assets = makeAssets(cursorAsset);
    const initial = screenshotCursorTransform(cursor, state.canvas, pointer);
    const target = { ...initial, x: 0.6, y: 0.5, width: initial.width * 2 };
    const snapshot = structuredClone(state);

    const next = withScreenshotTransform(state, cursor.id, target, assets);

    expect(next.cursors).not.toBe(state.cursors);
    expect(next.cursors?.[0]).toBe(earlierCursor);
    expect(next.cursors?.[1]).not.toBe(cursor);
    expect(next.cursors?.[1]).toMatchObject({ size: 90, position: { x: 0.6, y: 0.5 } });
    const resized = screenshotCursorTransform(next.cursors![1]!, state.canvas, pointer);
    expect(resized.width).toBeCloseTo(target.width);
    expect(resized.height).toBeCloseTo(initial.height * 2);
    expect(state).toEqual(snapshot);
  });

  it('uses height as the dominant cursor resize axis and clamps cursor size at both limits', () => {
    const state = makeState();
    const small = makeCursor(20);
    const smallInitial = screenshotCursorTransform(small, state.canvas, pointer);
    state.cursors = [small];
    const smallResult = withScreenshotTransform(
      state,
      small.id,
      { ...smallInitial, height: smallInitial.height * 0.1 },
      makeAssets({ image: {} as CanvasImageSource, asset: pointer }),
    );
    expect(smallResult.cursors?.[0]?.size).toBe(16);

    const largeState = makeState();
    const large = makeCursor(300);
    const largeInitial = screenshotCursorTransform(large, largeState.canvas, pointer);
    largeState.cursors = [large];
    const largeResult = withScreenshotTransform(
      largeState,
      large.id,
      { ...largeInitial, width: largeInitial.width * 2 },
      makeAssets({ image: {} as CanvasImageSource, asset: pointer }),
    );
    expect(largeResult.cursors?.[0]?.size).toBe(384);
  });

  it('does not mutate a cursor when its decoded asset is missing or the id is unknown', () => {
    const cursor = makeCursor();
    const state = makeState();
    state.cursors = [cursor];
    const snapshot = structuredClone(state);

    const missingAsset = withScreenshotTransform(state, cursor.id, transform, makeAssets());
    const unknown = withScreenshotTransform(state, 'unknown', transform, makeAssets());

    expect(missingAsset.cursors?.[0]).toEqual(cursor);
    expect(unknown.shapes).toEqual(state.shapes);
    expect(state).toEqual(snapshot);
  });
});
