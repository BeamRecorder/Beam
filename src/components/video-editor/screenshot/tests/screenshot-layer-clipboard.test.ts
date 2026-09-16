import { describe, expect, it } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { BlurClip, ShapeClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createElementText } from '~/media/shared/element-text';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import type { LayerCompositing } from '~/media/shared/layer-compositing-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import type { ScreenshotCursorLayer, ScreenshotImageLayer } from '../screenshot-layer-types';
import { copyScreenshotLayerSelection, pasteScreenshotLayerSelection } from '../screenshot-layer-clipboard';
import {
  initializeScreenshotComposition,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
  screenshotLayers,
} from '../screenshot-layers';
import { screenshotShape } from '../screenshot-state';

const makeShape = (id: string, name = id): ShapeClip => ({
  ...screenshotShape('rectangle', id),
  name,
});

const makeTextShape = (id: string, content: string): ShapeClip => ({
  ...screenshotShape('text', id),
  family: 'text',
  preset: 'text',
  text: createElementText(content),
});

const makeState = (shapes: ShapeClip[] = []): ScreenshotState => {
  const state: ScreenshotState = {
    canvas: {
      ...DEFAULT_OUTPUT_CANVAS,
      preset: 'custom',
      width: 1280,
      height: 720,
      showBackground: true,
      watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true },
    },
    background: { id: 'background', name: 'Background', kind: 'color', color: '#123456' },
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
    shapes,
    format: 'png',
    quality: 0.9,
  };
  initializeScreenshotComposition(state);
  return state;
};

const compositing = (id: string, patch: Partial<LayerCompositing> = {}): LayerCompositing => ({
  ...defaultLayerCompositing(id),
  ...patch,
});

const blurLayer = (): BlurClip => ({
  id: 'blur-layer',
  kind: 'blur',
  assetId: '',
  name: 'Blur region',
  timelineStartMs: 0,
  timelineDurationMs: 1,
  sourceInMs: 0,
  sourceDurationMs: 1,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'blur-track',
  transform: { x: 0.2, y: 0.25, width: 0.3, height: 0.2 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  tintOpacity: 0,
  color: '#000000',
});

const cursorLayer = (): ScreenshotCursorLayer => ({
  id: 'cursor-layer',
  name: 'Cursor',
  enabled: true,
  position: { x: 0.4, y: 0.5 },
  size: 32,
  rotation: 0,
  selection: { packId: 'builtin', mode: 'fixed', cursorId: 'arrow' },
  color: '#ffffff',
  shadowEnabled: false,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowDirection: 'all',
});

const imageLayer = (): ScreenshotImageLayer => ({
  id: 'imported-image',
  kind: 'image',
  name: 'Imported image',
  assetId: 'image-asset',
  trackId: 'image-track',
  timelineStartMs: 0,
  timelineDurationMs: 1,
  sourceInMs: 0,
  sourceDurationMs: 1,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.15, width: 0.2, height: 0.2 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
  cameraFramingPreset: 'fit',
  source: 'project-media://screenshot/image.png',
  width: 320,
  height: 200,
});

describe('screenshot layer clipboard', () => {
  it('deep-copies a multi-selection, preserves its compositing order, and unlocks pasted shapes', () => {
    const state = makeState([
      makeShape('shape-a', 'First shape'),
      makeShape('shape-b', 'Second shape'),
      makeShape('shape-outside', 'Unselected shape'),
    ]);
    state.composition = [
      compositing(SCREENSHOT_BACKGROUND_ID),
      compositing(state.image.id),
      compositing('shape-b', { opacity: 37, blendMode: 'multiply' }),
      compositing('shape-a', { opacity: 64, blendMode: 'screen', locked: true }),
      compositing('shape-outside'),
      compositing(SCREENSHOT_WATERMARK_ID),
    ];

    const clipboard = copyScreenshotLayerSelection(state, ['shape-a', 'shape-b'], 'shape-a')!;
    expect(clipboard.entries.map(({ layer }) => layer.value.id)).toEqual(['shape-b', 'shape-a']);
    expect(clipboard.entries.map(({ name }) => name)).toEqual(['Second shape', 'First shape']);
    expect(clipboard.primaryIndex).toBe(1);

    const copiedShape = clipboard.entries[0]!.layer;
    expect(copiedShape.type).toBe('shape');
    if (copiedShape.type !== 'shape') throw new Error('Expected a copied shape.');
    expect(copiedShape.value).not.toBe(state.shapes[1]);
    expect(copiedShape.value.transform).not.toBe(state.shapes[1]!.transform);
    const copiedX = copiedShape.value.transform.x;
    state.shapes[1]!.transform.x = 0.8;
    expect(copiedShape.value.transform.x).toBe(copiedX);

    const pasted = pasteScreenshotLayerSelection(
      state,
      clipboard,
      (() => {
        const ids = ['pasted-b', 'pasted-a'];
        return () => ids.shift()!;
      })(),
    );

    expect(pasted).toEqual({
      ids: ['pasted-b', 'pasted-a'],
      primaryId: 'pasted-a',
      names: ['Second shape', 'First shape'],
    });
    expect(state.shapes.map(({ id }) => id)).toEqual(['shape-a', 'shape-b', 'shape-outside', 'pasted-b', 'pasted-a']);
    expect(state.shapes.slice(-2).map(({ id, trackId }) => ({ id, trackId }))).toEqual([
      { id: 'pasted-b', trackId: 'pasted-b' },
      { id: 'pasted-a', trackId: 'pasted-a' },
    ]);
    expect(state.composition?.map(({ id }) => id)).toEqual([
      SCREENSHOT_BACKGROUND_ID,
      'screenshot',
      'shape-b',
      'shape-a',
      'shape-outside',
      SCREENSHOT_WATERMARK_ID,
      'pasted-b',
      'pasted-a',
    ]);
    expect(state.composition?.slice(-2)).toEqual([
      compositing('pasted-b', { opacity: 37, blendMode: 'multiply' }),
      compositing('pasted-a', { opacity: 64, blendMode: 'screen', locked: false }),
    ]);
    expect(state.shapes.at(-2)).not.toBe(state.shapes[1]);
    expect(state.shapes.at(-2)!.transform).not.toBe(state.shapes[1]!.transform);
  });

  it('offsets by 24 canvas pixels and clamps pasted transforms to the permitted bounds', () => {
    const inside = makeShape('inside');
    inside.transform = { x: 0.2, y: 0.3, width: 0.25, height: 0.2 };
    const rightBottom = makeShape('right-bottom');
    rightBottom.transform = { x: 0.99, y: 0.99, width: 0.25, height: 0.2 };
    const leftTop = makeShape('left-top');
    leftTop.transform = { x: -0.8, y: -0.8, width: 0.3, height: 0.4 };
    const state = makeState([inside, rightBottom, leftTop]);
    const clipboard = copyScreenshotLayerSelection(state, ['inside', 'right-bottom', 'left-top'], 'left-top')!;

    pasteScreenshotLayerSelection(
      state,
      clipboard,
      (() => {
        const ids = ['inside-copy', 'right-bottom-copy', 'left-top-copy'];
        return () => ids.shift()!;
      })(),
    );

    expect(state.shapes[3]!.transform).toMatchObject({
      x: 0.2 + 24 / 1280,
      y: 0.3 + 24 / 720,
      width: 0.25,
      height: 0.2,
    });
    expect(state.shapes[4]!.transform).toMatchObject({ x: 0.99, y: 0.99 });
    expect(state.shapes[5]!.transform).toMatchObject({ x: 0.01 - 0.3, y: 0.01 - 0.4 });
  });

  it('clones effect, cursor, and imported image layers with fresh IDs and tracks', () => {
    const state = makeState();
    state.effects = [blurLayer()];
    state.cursors = [cursorLayer()];
    state.images = [imageLayer()];
    state.composition = [
      compositing(SCREENSHOT_BACKGROUND_ID),
      compositing(state.image.id),
      compositing('blur-layer', { opacity: 50, blendMode: 'overlay' }),
      compositing('cursor-layer'),
      compositing('imported-image', { opacity: 80, blendMode: 'multiply' }),
      compositing(SCREENSHOT_WATERMARK_ID),
    ];

    const clipboard = copyScreenshotLayerSelection(
      state,
      ['blur-layer', 'cursor-layer', 'imported-image'],
      'cursor-layer',
    )!;
    expect(clipboard.entries.map(({ layer }) => layer.type)).toEqual(['effect', 'cursor', 'image']);

    state.effects[0]!.transform.x = 0.9;
    state.cursors[0]!.position.x = 0.9;
    state.images[0]!.source = 'project-media://screenshot/changed.png';
    pasteScreenshotLayerSelection(
      state,
      clipboard,
      (() => {
        const ids = ['blur-copy', 'cursor-copy', 'image-copy'];
        return () => ids.shift()!;
      })(),
    );

    expect(state.effects?.[1]).toMatchObject({
      id: 'blur-copy',
      trackId: 'blur-copy',
      transform: { x: 0.2 + 24 / 1280, y: 0.25 + 24 / 720 },
    });
    expect(state.cursors?.[1]).toMatchObject({
      id: 'cursor-copy',
      position: { x: 0.4 + 24 / 1280, y: 0.5 + 24 / 720 },
    });
    expect(state.images?.[1]).toMatchObject({
      id: 'image-copy',
      trackId: 'image-copy',
      source: 'project-media://screenshot/image.png',
      width: 320,
      height: 200,
      transform: { x: 0.1 + 24 / 1280, y: 0.15 + 24 / 720 },
    });
    expect(state.composition?.slice(-3)).toEqual([
      compositing('blur-copy', { opacity: 50, blendMode: 'overlay' }),
      compositing('cursor-copy'),
      compositing('image-copy', { opacity: 80, blendMode: 'multiply' }),
    ]);
  });

  it('excludes protected pseudo-layers and the captured image, and omits locked layers from cut payloads', () => {
    const state = makeState([makeShape('unlocked'), makeShape('locked')]);
    state.composition!.find(({ id }) => id === 'locked')!.locked = true;
    expect(
      screenshotLayers(state)
        .filter(({ id }) => id === 'unlocked' || id === 'locked')
        .map(({ id, locked }) => ({ id, locked })),
    ).toEqual([
      { id: 'unlocked', locked: false },
      { id: 'locked', locked: true },
    ]);

    expect(
      copyScreenshotLayerSelection(
        state,
        [SCREENSHOT_BACKGROUND_ID, state.image.id, SCREENSHOT_WATERMARK_ID],
        SCREENSHOT_WATERMARK_ID,
      ),
    ).toBeNull();

    const selected = [SCREENSHOT_BACKGROUND_ID, state.image.id, 'unlocked', 'locked', SCREENSHOT_WATERMARK_ID];
    const copied = copyScreenshotLayerSelection(state, selected, 'locked')!;
    const mixedCut = copyScreenshotLayerSelection(state, selected, 'locked', true);
    const unlockedCut = copyScreenshotLayerSelection(state, ['unlocked'], 'unlocked', true)!;

    expect(copied.entries.map(({ layer }) => layer.value.id)).toEqual(['unlocked', 'locked']);
    expect(mixedCut).toBeNull();
    expect(unlockedCut.entries.map(({ layer }) => layer.value.id)).toEqual(['unlocked']);
  });

  it('rejects the 501st overlay without mutating the screenshot state', () => {
    const state = makeState(Array.from({ length: 500 }, (_, index) => makeShape(`shape-${index}`)));
    const clipboard = copyScreenshotLayerSelection(state, ['shape-0'], 'shape-0')!;
    const serializedBeforePaste = JSON.stringify(state);
    const arraysBeforePaste = {
      shapes: state.shapes,
      effects: state.effects,
      cursors: state.cursors,
      images: state.images,
      composition: state.composition,
    };

    expect(state.shapes.length).toBe(500);
    expect(() => pasteScreenshotLayerSelection(state, clipboard, () => 'paste-over-layer-limit')).toThrow(
      'The screenshot has reached its layer or document size limit.',
    );

    expect(state.shapes).toBe(arraysBeforePaste.shapes);
    expect(state.effects).toBe(arraysBeforePaste.effects);
    expect(state.cursors).toBe(arraysBeforePaste.cursors);
    expect(state.images).toBe(arraysBeforePaste.images);
    expect(state.composition).toBe(arraysBeforePaste.composition);
    expect(JSON.stringify(state)).toBe(serializedBeforePaste);
  });

  it('rejects a paste over the JSON size limit without mutating the screenshot state', () => {
    const characterLimit = 2_000_000;
    const targetSize = characterLimit - 1_000;
    const fullText = 'x'.repeat(10_000);
    const shapes = Array.from({ length: 160 }, (_, index) => makeTextShape(`large-${index}`, fullText));
    let state = makeState(shapes);

    while (JSON.stringify(state).length <= characterLimit - fullText.length) {
      const nextId = `large-${shapes.length}`;
      const fullCandidateShape = makeTextShape(nextId, fullText);
      const fullCandidate = makeState([...shapes, fullCandidateShape]);
      const fullCandidateSize = JSON.stringify(fullCandidate).length;

      if (fullCandidateSize > characterLimit - fullText.length) {
        if (fullCandidateSize <= characterLimit) {
          shapes.push(fullCandidateShape);
          state = fullCandidate;
        } else {
          const emptyCandidateShape = makeTextShape(nextId, '');
          const emptyCandidate = makeState([...shapes, emptyCandidateShape]);
          const contentLength = targetSize - JSON.stringify(emptyCandidate).length;
          if (contentLength < 0 || contentLength > fullText.length)
            throw new Error('Unable to construct a valid state near the screenshot JSON size limit.');
          state = makeState([...shapes, makeTextShape(nextId, 'x'.repeat(contentLength))]);
        }
        break;
      }

      shapes.push(fullCandidateShape);
      state = fullCandidate;
    }

    const initialSerializedSize = JSON.stringify(state).length;
    expect(initialSerializedSize).toBeLessThanOrEqual(characterLimit);
    expect(initialSerializedSize).toBeGreaterThan(characterLimit - fullText.length);
    expect(state.shapes.length).toBeLessThan(500);

    const clipboard = copyScreenshotLayerSelection(state, ['large-0'], 'large-0')!;
    const serializedBeforePaste = JSON.stringify(state);
    const arraysBeforePaste = {
      shapes: state.shapes,
      effects: state.effects,
      cursors: state.cursors,
      images: state.images,
      composition: state.composition,
    };

    expect(() => pasteScreenshotLayerSelection(state, clipboard, () => 'paste-over-size-limit')).toThrow(
      'The screenshot has reached its layer or document size limit.',
    );

    expect(state.shapes).toBe(arraysBeforePaste.shapes);
    expect(state.effects).toBe(arraysBeforePaste.effects);
    expect(state.cursors).toBe(arraysBeforePaste.cursors);
    expect(state.images).toBe(arraysBeforePaste.images);
    expect(state.composition).toBe(arraysBeforePaste.composition);
    expect(JSON.stringify(state)).toBe(serializedBeforePaste);
  });
});
