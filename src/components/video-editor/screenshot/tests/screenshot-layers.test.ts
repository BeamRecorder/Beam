import { describe, expect, it } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createElementText } from '~/media/shared/element-text';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import type { ScreenshotCursorLayer } from '../screenshot-layer-types';
import {
  initializeScreenshotComposition,
  insertScreenshotLayer,
  removeScreenshotLayer,
  reorderScreenshotLayer,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
  screenshotLayers,
  setScreenshotLayerVisible,
  updateScreenshotLayer,
} from '../screenshot-layers';
import { screenshotShape } from '../screenshot-state';

const makeShape = (id: string, enabled = true) => ({ ...screenshotShape('rectangle', id), enabled });

const makeText = (id: string, content: string, name = 'Text layer') => ({
  ...screenshotShape('text', id),
  family: 'text' as const,
  name,
  text: createElementText(content),
});

const makeCursor = (id: string, enabled = true): ScreenshotCursorLayer => ({
  id,
  name: `Cursor ${id}`,
  enabled,
  position: { x: 0.5, y: 0.5 },
  size: 100,
  rotation: 0,
  selection: { packId: 'builtin', mode: 'fixed', cursorId: 'arrow' },
  color: '#ffffff',
  shadowEnabled: false,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowDirection: 'all',
});

const makeState = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => ({
  canvas: {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 1280,
    height: 720,
    showBackground: true,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true },
  },
  background: { id: 'bg', name: 'Background', kind: 'color', color: '#123456' },
  blurPercent: 30,
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

const ids = (state: ScreenshotState) => screenshotLayers(state).map(({ id }) => id);

describe('screenshotLayers', () => {
  it('presents legacy screenshot content back-to-front with default compositing settings', () => {
    const state = makeState({
      shapes: [makeShape('shape-1'), makeText('text-1', 'Callout'), makeText('text-empty', '', 'Untitled')],
      cursors: [makeCursor('cursor-1', false)],
    });

    expect(screenshotLayers(state)).toEqual([
      { ...defaultLayerCompositing(SCREENSHOT_BACKGROUND_ID), kind: 'background', name: '', visible: true },
      { ...defaultLayerCompositing('screenshot'), kind: 'image', name: 'Captured screen', visible: true },
      { ...defaultLayerCompositing('shape-1'), kind: 'shape', name: 'rectangle', visible: true },
      { ...defaultLayerCompositing('text-1'), kind: 'text', name: 'Callout', visible: true },
      { ...defaultLayerCompositing('text-empty'), kind: 'text', name: 'Untitled', visible: true },
      { ...defaultLayerCompositing('cursor-1'), kind: 'cursor', name: 'Cursor cursor-1', visible: false },
      { ...defaultLayerCompositing(SCREENSHOT_WATERMARK_ID), kind: 'watermark', name: '', visible: true },
    ]);
  });

  it('follows saved compositing order and settings while omitting stale entries', () => {
    const state = makeState({
      shapes: [makeShape('shape-1')],
      cursors: [makeCursor('cursor-1')],
      composition: [
        { id: 'shape-1', opacity: 45, blendMode: 'multiply', locked: true },
        { id: 'removed-layer', opacity: 20, blendMode: 'screen', locked: false },
        { id: 'screenshot', opacity: 80, blendMode: 'overlay', locked: false },
        { id: SCREENSHOT_BACKGROUND_ID, opacity: 100, blendMode: 'source-over', locked: false },
      ],
    });

    expect(screenshotLayers(state)).toEqual([
      {
        id: 'shape-1',
        kind: 'shape',
        name: 'rectangle',
        visible: true,
        opacity: 45,
        blendMode: 'multiply',
        locked: true,
      },
      {
        id: 'screenshot',
        kind: 'image',
        name: 'Captured screen',
        visible: true,
        opacity: 80,
        blendMode: 'overlay',
        locked: false,
      },
      {
        id: SCREENSHOT_BACKGROUND_ID,
        kind: 'background',
        name: '',
        visible: true,
        opacity: 100,
        blendMode: 'source-over',
        locked: false,
      },
    ]);
  });

  it('keeps layer names and visibility in sync with current content state', () => {
    const state = makeState({
      image: { ...makeState().image, enabled: false },
      shapes: [makeShape('shape-1', false)],
      cursors: [makeCursor('cursor-1')],
      composition: [
        defaultLayerCompositing('screenshot'),
        defaultLayerCompositing('shape-1'),
        defaultLayerCompositing('cursor-1'),
        defaultLayerCompositing(SCREENSHOT_WATERMARK_ID),
      ],
    });

    expect(screenshotLayers(state)).toMatchObject([
      { id: 'screenshot', visible: false },
      { id: 'shape-1', visible: false },
      { id: 'cursor-1', visible: true },
      { id: SCREENSHOT_WATERMARK_ID, visible: true },
    ]);
  });
});

describe('initializeScreenshotComposition', () => {
  it('adds default layer metadata to old screenshots without changing their content or order', () => {
    const shape = makeShape('shape-1');
    const text = makeText('text-1', 'Keep this text');
    const cursor = makeCursor('cursor-1');
    const state = makeState({ shapes: [shape, text], cursors: [cursor] });
    const image = state.image;
    const background = state.background;
    const watermark = state.canvas.watermark;

    initializeScreenshotComposition(state);

    expect(state.composition?.map(({ id }) => id)).toEqual([
      SCREENSHOT_BACKGROUND_ID,
      'screenshot',
      'shape-1',
      'text-1',
      'cursor-1',
      SCREENSHOT_WATERMARK_ID,
    ]);
    expect(
      state.composition?.every(
        ({ opacity, blendMode, locked }) => opacity === 100 && blendMode === 'source-over' && !locked,
      ),
    ).toBe(true);
    expect(state.image).toBe(image);
    expect(state.background).toBe(background);
    expect(state.canvas.watermark).toBe(watermark);
    expect(state.shapes).toEqual([shape, text]);
    expect(state.cursors).toEqual([cursor]);
  });

  it('initializes a missing cursor list and preserves existing metadata on repeat calls', () => {
    const state = makeState();
    initializeScreenshotComposition(state);
    const composition = state.composition;
    composition![0]!.opacity = 42;
    composition!.reverse();

    initializeScreenshotComposition(state);

    expect(state.cursors).toEqual([]);
    expect(state.composition).toBe(composition);
    expect(state.composition?.[0]).toMatchObject({ id: SCREENSHOT_WATERMARK_ID, opacity: 100 });
    expect(state.composition?.find(({ id }) => id === SCREENSHOT_BACKGROUND_ID)?.opacity).toBe(42);
  });

  it('does not overwrite composition or a supplied cursor list', () => {
    const composition = [{ id: 'custom', opacity: 12, blendMode: 'screen' as const, locked: true }];
    const cursors = [makeCursor('cursor-1')];
    const state = makeState({ composition, cursors });

    initializeScreenshotComposition(state);

    expect(state.composition).toBe(composition);
    expect(state.cursors).toBe(cursors);
  });
});

describe('insertScreenshotLayer', () => {
  it('adds a new layer once at the front and supplies default compositing metadata', () => {
    const state = makeState({ shapes: [makeShape('shape-1')] });

    insertScreenshotLayer(state, 'new-shape');
    const composition = state.composition;
    insertScreenshotLayer(state, 'new-shape');

    expect(state.composition?.map(({ id }) => id)).toEqual([
      SCREENSHOT_BACKGROUND_ID,
      'screenshot',
      'shape-1',
      SCREENSHOT_WATERMARK_ID,
      'new-shape',
    ]);
    expect(state.composition?.at(-1)).toEqual(defaultLayerCompositing('new-shape'));
    expect(state.composition).toBe(composition);
  });

  it('does not duplicate a layer already present in composition', () => {
    const state = makeState({ composition: [defaultLayerCompositing('existing')] });

    insertScreenshotLayer(state, 'existing');

    expect(state.composition).toEqual([defaultLayerCompositing('existing')]);
  });
});

describe('updateScreenshotLayer', () => {
  it('patches opacity, blend mode and lock state without replacing the layer id', () => {
    const state = makeState({ composition: [defaultLayerCompositing('shape-1')] });

    updateScreenshotLayer(state, 'shape-1', { opacity: 0, blendMode: 'color-dodge', locked: true });

    expect(state.composition).toEqual([{ id: 'shape-1', opacity: 0, blendMode: 'color-dodge', locked: true }]);
  });

  it('updates an existing legacy layer after initializing composition and ignores missing ids', () => {
    const state = makeState({ shapes: [makeShape('shape-1')] });

    updateScreenshotLayer(state, 'shape-1', { opacity: 65 });
    const beforeMissingPatch = structuredClone(state.composition);
    updateScreenshotLayer(state, 'missing', { opacity: 10, locked: true });

    expect(state.composition?.find(({ id }) => id === 'shape-1')?.opacity).toBe(65);
    expect(state.composition).toEqual(beforeMissingPatch);
  });
});

describe('reorderScreenshotLayer', () => {
  it('maps UI front indexes onto the stored back-to-front order', () => {
    const state = makeState({ shapes: [makeShape('shape-1'), makeShape('shape-2')] });
    initializeScreenshotComposition(state);

    reorderScreenshotLayer(state, 'shape-1', 0);
    expect(ids(state)).toEqual([SCREENSHOT_BACKGROUND_ID, 'screenshot', 'shape-2', SCREENSHOT_WATERMARK_ID, 'shape-1']);

    reorderScreenshotLayer(state, 'shape-1', state.composition!.length - 1);
    expect(ids(state)).toEqual(['shape-1', SCREENSHOT_BACKGROUND_ID, 'screenshot', 'shape-2', SCREENSHOT_WATERMARK_ID]);
  });

  it.each([
    ['negative', -5, 'last'],
    ['past the visible list', 50, 'first'],
  ] as const)('clamps a %s UI front index to the list boundary', (_label, frontIndex, expectedPosition) => {
    const state = makeState({ shapes: [makeShape('shape-1')] });
    initializeScreenshotComposition(state);

    reorderScreenshotLayer(state, 'shape-1', frontIndex);

    expect(expectedPosition === 'first' ? state.composition?.[0]?.id : state.composition?.at(-1)?.id).toBe('shape-1');
  });

  it('leaves order unchanged for an unknown layer or non-integer UI index', () => {
    const state = makeState({ shapes: [makeShape('shape-1')] });
    initializeScreenshotComposition(state);
    const before = ids(state);

    reorderScreenshotLayer(state, 'missing', 0);
    reorderScreenshotLayer(state, 'shape-1', 1.5);

    expect(ids(state)).toEqual(before);
  });
});

describe('setScreenshotLayerVisible', () => {
  it('toggles the background, watermark, screenshot, shape and cursor visibility', () => {
    const state = makeState({ shapes: [makeShape('shape-1')], cursors: [makeCursor('cursor-1')] });

    setScreenshotLayerVisible(state, SCREENSHOT_BACKGROUND_ID, false);
    setScreenshotLayerVisible(state, SCREENSHOT_WATERMARK_ID, false);
    setScreenshotLayerVisible(state, 'screenshot', false);
    setScreenshotLayerVisible(state, 'shape-1', false);
    setScreenshotLayerVisible(state, 'cursor-1', false);

    expect(screenshotLayers(state)).toMatchObject([
      { id: SCREENSHOT_BACKGROUND_ID, visible: false },
      { id: 'screenshot', visible: false },
      { id: 'shape-1', visible: false },
      { id: 'cursor-1', visible: false },
      { id: SCREENSHOT_WATERMARK_ID, visible: false },
    ]);

    setScreenshotLayerVisible(state, SCREENSHOT_BACKGROUND_ID, true);
    setScreenshotLayerVisible(state, SCREENSHOT_WATERMARK_ID, true);
    setScreenshotLayerVisible(state, 'screenshot', true);
    setScreenshotLayerVisible(state, 'shape-1', true);
    setScreenshotLayerVisible(state, 'cursor-1', true);
    expect(screenshotLayers(state).every(({ visible }) => visible)).toBe(true);
  });

  it('safely ignores missing watermark settings and unknown layer ids', () => {
    const state = makeState({
      canvas: { ...DEFAULT_OUTPUT_CANVAS, watermark: undefined },
      shapes: [makeShape('shape-1')],
    });
    const before = structuredClone(state);

    setScreenshotLayerVisible(state, SCREENSHOT_WATERMARK_ID, false);
    setScreenshotLayerVisible(state, 'missing', false);

    expect(state).toEqual(before);
  });
});

describe('removeScreenshotLayer', () => {
  it('protects the screenshot image, background and watermark layers', () => {
    const state = makeState({ shapes: [makeShape('shape-1')], cursors: [makeCursor('cursor-1')] });
    initializeScreenshotComposition(state);
    const composition = structuredClone(state.composition);

    removeScreenshotLayer(state, 'screenshot');
    removeScreenshotLayer(state, SCREENSHOT_BACKGROUND_ID);
    removeScreenshotLayer(state, SCREENSHOT_WATERMARK_ID);

    expect(state.image.id).toBe('screenshot');
    expect(state.shapes.map(({ id }) => id)).toEqual(['shape-1']);
    expect(state.cursors?.map(({ id }) => id)).toEqual(['cursor-1']);
    expect(state.composition).toEqual(composition);
  });

  it('removes shape and cursor content together with their composition records', () => {
    const state = makeState({
      shapes: [makeShape('shape-1'), makeShape('shape-2')],
      cursors: [makeCursor('cursor-1'), makeCursor('cursor-2')],
    });
    initializeScreenshotComposition(state);

    removeScreenshotLayer(state, 'shape-1');
    removeScreenshotLayer(state, 'cursor-1');
    removeScreenshotLayer(state, 'missing');

    expect(state.shapes.map(({ id }) => id)).toEqual(['shape-2']);
    expect(state.cursors?.map(({ id }) => id)).toEqual(['cursor-2']);
    expect(state.composition?.some(({ id }) => id === 'shape-1' || id === 'cursor-1')).toBe(false);
    expect(state.composition?.map(({ id }) => id)).toContain('shape-2');
  });

  it('safely removes a shape when legacy optional lists are absent', () => {
    const state = makeState({ shapes: [makeShape('shape-1')] });

    removeScreenshotLayer(state, 'shape-1');

    expect(state.shapes).toEqual([]);
    expect(state.cursors).toBeUndefined();
    expect(state.composition).toBeUndefined();
  });
});
