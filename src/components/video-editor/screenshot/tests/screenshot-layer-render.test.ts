import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import type { ShapeClip } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS, DEFAULT_WATERMARK } from '../../canvas/output-canvas';
import type { ScreenshotCursorAsset, ScreenshotCursorLayer, ScreenshotLayer } from '../screenshot-layer-types';

const renderers = vi.hoisted(() => ({
  decoratedMedia: vi.fn(),
  shapeClip: vi.fn(),
  screenshotCursor: vi.fn(),
}));

vi.mock('../../composition/appearance/render-decorated-media', () => ({
  drawDecoratedMedia: renderers.decoratedMedia,
}));
vi.mock('../../composition/shape/render-shape-clip', () => ({ drawShapeClip: renderers.shapeClip }));
vi.mock('../screenshot-cursors', () => ({ drawScreenshotCursor: renderers.screenshotCursor }));

import { drawScreenshotLayer } from '../screenshot-layer-render';

const defaultImage = {
  id: 'screenshot',
  kind: 'image',
  name: 'Captured screen',
  assetId: 'capture.png',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
  appearance: { frame: 'none' },
  isMirrored: true,
  isMirroredY: false,
} as ScreenshotState['image'];

const makeState = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => {
  const { canvas, image, ...state } = overrides;
  return {
    canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1_000, height: 500, ...canvas },
    background: null,
    blurPercent: 30,
    image: { ...defaultImage, ...image },
    shapes: [],
    cursors: [],
    format: 'png',
    quality: 0.95,
    ...state,
  } as ScreenshotState;
};

const makeLayer = (id: string, kind: ScreenshotLayer['kind']): ScreenshotLayer => ({
  id,
  kind,
  name: id,
  visible: true,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
});

const makeTarget = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
  }) as unknown as Canvas2DContext & {
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  };

const cursor: ScreenshotCursorLayer = {
  id: 'cursor-1',
  name: 'Pointer',
  enabled: true,
  position: { x: 0.45, y: 0.5 },
  size: 45,
  rotation: 12,
  selection: { packId: 'pack-1', mode: 'fixed', cursorId: 'pointer' },
  color: '#ffffff',
  shadowEnabled: true,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowDirection: 'bottom-right',
};
const cursorAsset: ScreenshotCursorAsset = {
  image: { width: 64, height: 64 } as unknown as CanvasImageSource,
  asset: {
    id: 'pointer',
    label: 'Pointer',
    url: 'project-media://pointer.svg',
    format: 'svg',
    tintable: true,
    intrinsicSize: { width: 32, height: 32 },
    nominalSize: 32,
    hotspot: { x: 8, y: 4 },
  },
};

beforeEach(() => vi.clearAllMocks());

describe('drawScreenshotLayer', () => {
  it('treats an image background without a decoded source as an optional no-op', () => {
    const target = makeTarget();
    const state = makeState({ background: { kind: 'image' } as ScreenshotState['background'] });

    expect(() =>
      drawScreenshotLayer(target, state, makeLayer('__background__', 'background'), {}, 500, 250),
    ).not.toThrow();
    expect(target.save).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
  });

  it('propagates invalid image background asset dimensions', () => {
    const target = makeTarget();
    const state = makeState({ background: { kind: 'image' } as ScreenshotState['background'] });

    expect(() =>
      drawScreenshotLayer(
        target,
        state,
        makeLayer('__background__', 'background'),
        { background: {} as CanvasImageSource },
        500,
        250,
      ),
    ).toThrow('Background source dimensions are unavailable.');
  });

  it('forwards background blur against the smaller output scale', () => {
    const target = makeTarget();
    const state = makeState({ background: { kind: 'color', color: '#123456' } as ScreenshotState['background'] });

    drawScreenshotLayer(target, state, makeLayer('__background__', 'background'), {}, 500, 250);

    expect(target.save).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing image', {}],
    ['missing width', { image: { width: 800 } as CanvasImageSource }],
    ['missing height', { image: { height: 400 } as CanvasImageSource, width: 800 }],
  ])('rejects an image layer with %s', (_reason, assets) => {
    expect(() =>
      drawScreenshotLayer(makeTarget(), makeState(), makeLayer('screenshot', 'image'), assets, 500, 250),
    ).toThrow('Screenshot image unavailable.');
    expect(renderers.decoratedMedia).not.toHaveBeenCalled();
  });

  it('uses cropped source geometry and media appearance when drawing the screenshot image', () => {
    const target = makeTarget();
    const state = makeState({ image: { ...defaultImage, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } } });
    const image = { width: 800, height: 400 } as CanvasImageSource;

    drawScreenshotLayer(target, state, makeLayer('screenshot', 'image'), { image, width: 800, height: 400 }, 500, 250);

    expect(renderers.decoratedMedia).toHaveBeenCalledOnce();
    expect(renderers.decoratedMedia).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        source: image,
        sourceRect: { x: 200, y: 100, width: 400, height: 200 },
        rect: { x: 100, y: 50, width: 300, height: 150 },
        appearance: state.image.appearance,
        title: 'Captured screen',
        shadowScale: 0.5,
        mirrored: true,
        mirroredY: false,
      }),
    );
  });

  it('enables high-quality canvas interpolation before drawing an imported image', () => {
    const target = makeTarget();
    target.imageSmoothingEnabled = false;
    target.imageSmoothingQuality = 'low';
    const importedImage = {
      ...defaultImage,
      id: 'pasted-image',
      name: 'Pasted image',
      source: 'project-media://pasted.png',
      width: 800,
      height: 400,
    } as NonNullable<ScreenshotState['images']>[number];
    const image = { width: 800, height: 400 } as CanvasImageSource;
    renderers.decoratedMedia.mockImplementationOnce((context: Canvas2DContext) => {
      expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.imageSmoothingQuality).toBe('high');
    });

    drawScreenshotLayer(
      target,
      makeState({ images: [importedImage] }),
      makeLayer(importedImage.id, 'image'),
      { images: new Map([[importedImage.id, { image, width: 800, height: 400 }]]) },
      500,
      250,
    );

    expect(renderers.decoratedMedia).toHaveBeenCalledOnce();
  });

  it('passes a missing logo through to the watermark renderer, which safely skips an empty watermark', () => {
    const target = makeTarget();
    const canvas: ScreenshotState['canvas'] = {
      ...DEFAULT_OUTPUT_CANVAS,
      width: 1_000,
      height: 500,
      watermark: { ...DEFAULT_WATERMARK, enabled: true, showLogo: true, text: 'none' },
    };

    expect(() =>
      drawScreenshotLayer(target, makeState({ canvas }), makeLayer('__watermark__', 'watermark'), {}, 500, 250),
    ).not.toThrow();
    expect(target.save).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.drawImage).not.toHaveBeenCalled();
  });

  it('requires both a matching cursor layer and its decoded asset before drawing', () => {
    const target = makeTarget();
    const cursorLayer = makeLayer(cursor.id, 'cursor');
    const withCursor = makeState({ cursors: [cursor] });
    const assets = { cursors: new Map([[cursor.id, cursorAsset]]) };

    expect(() => drawScreenshotLayer(target, withCursor, cursorLayer, {}, 500, 250)).toThrow(
      `Cursor image unavailable: ${cursor.id}`,
    );
    expect(() => drawScreenshotLayer(target, makeState({ cursors: undefined }), cursorLayer, assets, 500, 250)).toThrow(
      `Cursor image unavailable: ${cursor.id}`,
    );

    drawScreenshotLayer(target, withCursor, cursorLayer, assets, 500, 250);
    expect(renderers.screenshotCursor).toHaveBeenCalledOnce();
    expect(renderers.screenshotCursor).toHaveBeenCalledWith(target, cursor, cursorAsset, 500, 250);
  });

  it('hides an actively edited text shape without mutating the stored element', () => {
    const shape = {
      id: 'text-1',
      transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
      text: { content: 'Editable text' },
    } as unknown as ShapeClip;
    const state = makeState({ shapes: [shape] });
    const target = makeTarget();

    drawScreenshotLayer(target, state, makeLayer(shape.id, 'text'), {}, 500, 250, undefined, shape.id);

    const drawnShape = renderers.shapeClip.mock.calls[0]![1] as ShapeClip;
    expect(drawnShape).not.toBe(shape);
    expect(drawnShape.text).toBeUndefined();
    expect(shape.text).toEqual({ content: 'Editable text' });
    expect(renderers.shapeClip).toHaveBeenCalledWith(
      target,
      drawnShape,
      { x: 0, y: 0, width: 500, height: 250 },
      shape.transform,
      undefined,
    );
  });

  it('draws a non-edited shape unchanged and reports a missing element', () => {
    const shape = { id: 'shape-1', transform: { x: 0, y: 0, width: 1, height: 1 } } as unknown as ShapeClip;
    const state = makeState({ shapes: [shape] });
    const target = makeTarget();

    drawScreenshotLayer(target, state, makeLayer(shape.id, 'shape'), {}, 500, 250, undefined, 'another-shape');
    expect(renderers.shapeClip.mock.calls[0]![1]).toBe(shape);

    expect(() => drawScreenshotLayer(target, makeState(), makeLayer('missing', 'shape'), {}, 500, 250)).toThrow(
      'Screenshot element unavailable: missing',
    );
  });
});
