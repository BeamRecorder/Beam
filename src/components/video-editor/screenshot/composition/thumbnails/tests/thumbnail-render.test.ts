import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { screenshotShape } from '../../../screenshot-state';
import type { ThumbnailRequest } from '../thumbnail-types';

const renderer = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('../../../screenshot-layer-render', () => ({ drawScreenshotLayer: renderer.draw }));

import { renderLayerThumbnail } from '../thumbnail-render';

type TestContext = Canvas2DContext & {
  translate: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

type TestCanvas = {
  width: number;
  height: number;
  context: TestContext;
  getContext: ReturnType<typeof vi.fn>;
  convertToBlob: ReturnType<typeof vi.fn>;
};

const transparentPixels = () => new Uint8ClampedArray(256 * 256 * 4);
let alphaPixels: Uint8ClampedArray;
let contextAvailability = [true, true];
let canvases: TestCanvas[];

const context = (data: Uint8ClampedArray): TestContext =>
  ({
    translate: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
    drawImage: vi.fn(),
    canvas: {},
  }) as unknown as TestContext;

class FakeOffscreenCanvas {
  width: number;
  height: number;
  readonly context: TestContext;
  readonly getContext = vi.fn();
  readonly convertToBlob = vi.fn(async (options: { type: string }) => new Blob(['thumbnail'], { type: options.type }));

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const index = canvases.length;
    this.context = context(canvases.length === 0 ? alphaPixels : transparentPixels());
    this.getContext.mockImplementation((_type: string, _options?: unknown) => {
      return contextAvailability[index] ? this.context : null;
    });
    canvases.push(this as unknown as TestCanvas);
  }
}

const makeState = (shape = screenshotShape('rectangle', 'shape-1')) =>
  ({
    canvas: {
      width: 1_000,
      height: 500,
      showBackground: false,
      watermark: { enabled: false, showLogo: false },
    },
    background: null,
    blurPercent: 0,
    image: {
      id: 'screenshot',
      kind: 'image',
      name: 'Capture',
      assetId: 'asset',
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: { frame: 'none' },
      isMirrored: false,
      isMirroredY: false,
    },
    shapes: [shape],
    cursors: [],
    format: 'png',
    quality: 1,
  }) as unknown as ScreenshotState;

const request = (shape = screenshotShape('rectangle', 'shape-1')): ThumbnailRequest => ({
  id: shape.id,
  revision: 1,
  state: makeState(shape),
  layer: {
    id: shape.id,
    kind: 'shape',
    name: shape.name,
    visible: true,
    opacity: 100,
    blendMode: 'source-over',
    locked: false,
  },
});

const setAlpha = (data: Uint8ClampedArray, x: number, y: number, alpha = 255) => {
  data[(y * 256 + x) * 4 + 3] = alpha;
};

beforeEach(() => {
  renderer.draw.mockReset();
  canvases = [];
  alphaPixels = transparentPixels();
  contextAvailability = [true, true];
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});

describe('renderLayerThumbnail', () => {
  it('renders one shared layer into an alpha-aware surface and fits its visible bounds into a PNG', async () => {
    setAlpha(alphaPixels, 40, 60, 1);
    setAlpha(alphaPixels, 100, 120);
    const value = request();
    const image = { width: 800, height: 400 } as ImageBitmap;
    const blob = await renderLayerThumbnail(value, { image, width: 800, height: 400 });

    expect(canvases.map(({ width, height }) => [width, height])).toEqual([
      [256, 256],
      [96, 96],
    ]);
    expect(canvases[0]!.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(canvases[1]!.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    const [translateX, translateY] = canvases[0]!.context.translate.mock.calls[0]! as [number, number];
    expect(translateX).toBeCloseTo(-92);
    expect(translateY).toBeCloseTo(29);
    expect(renderer.draw).toHaveBeenCalledWith(
      canvases[0]!.context,
      expect.objectContaining({
        canvas: expect.objectContaining({ watermark: expect.objectContaining({ enabled: true }) }),
      }),
      value.layer,
      { image, width: 800, height: 400 },
      440,
      220,
    );
    expect(canvases[1]!.context.drawImage).toHaveBeenCalledWith(
      canvases[0],
      40,
      60,
      61,
      61,
      6,
      expect.closeTo(6, 5),
      84,
      84,
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('keeps the output transparent when the layer draws no visible pixels', async () => {
    const blob = await renderLayerThumbnail(request(), {});

    expect(canvases[1]!.context.drawImage).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/png');
  });

  it('fits an inverse effect to the canvas ratio instead of cropping to its illuminated region', async () => {
    const value = request();
    value.id = 'highlight';
    value.layer = { ...value.layer, id: value.id, kind: 'effect' };
    alphaPixels = new Uint8ClampedArray(176 * 88 * 4);
    alphaPixels[3] = 255;
    alphaPixels[alphaPixels.length - 1] = 255;

    await renderLayerThumbnail(value, {});

    expect(canvases.map(({ width, height }) => [width, height])).toEqual([
      [176, 88],
      [96, 96],
    ]);
    expect(canvases[0]!.context.translate).toHaveBeenCalledWith(0, 0);
    expect(canvases[0]!.context.getImageData).toHaveBeenCalledWith(0, 0, 176, 88);
    expect(renderer.draw).toHaveBeenCalledWith(expect.anything(), expect.anything(), value.layer, {}, 176, 88);
    expect(canvases[1]!.context.drawImage).toHaveBeenCalledWith(canvases[0], 0, 0, 176, 88, 6, 27, 84, 42);
  });

  it('uses rotated bounds when choosing the initial scale for a non-square layer', async () => {
    const shape = screenshotShape('rectangle', 'shape-1');
    shape.transform = { x: 0.1, y: 0.2, width: 0.4, height: 0.2 };
    shape.rotation = 45;
    await renderLayerThumbnail(request(shape), {});

    const scale = 176 / (400 * Math.SQRT1_2 + 100 * Math.SQRT1_2);
    expect(renderer.draw).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {},
      1_000 * scale,
      500 * scale,
    );
  });

  it('reserves scale for a shape shadow and border so their alpha stays inside the readback surface', async () => {
    const shape = screenshotShape('rectangle', 'shape-1');
    shape.transform = { x: 0.3, y: 0.3, width: 0.4, height: 0.3 };
    shape.shadowEnabled = true;
    shape.shadowBlur = 20;
    shape.borderWidth = 2;
    await renderLayerThumbnail(request(shape), {});

    const unit = 500 / 1080;
    const padding = (4 * shape.shadowBlur + 12) * unit + shape.borderWidth * unit;
    const scale = 176 / Math.max(400 + padding * 2, 150 + padding * 2);
    const [, , , , renderedWidth, renderedHeight] = renderer.draw.mock.calls[0]! as [
      unknown,
      unknown,
      unknown,
      unknown,
      number,
      number,
    ];
    expect(renderedWidth).toBeCloseTo(1_000 * scale);
    expect(renderedHeight).toBeCloseTo(500 * scale);
    expect(renderedWidth).toBeLessThan(1_000 * (176 / 400));
  });

  it('reserves screenshot shadow space before scaling the captured image', async () => {
    const value = request();
    value.layer = {
      id: 'screenshot',
      kind: 'image',
      name: 'Capture',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    };
    value.id = 'screenshot';
    const shadowBlur = 24;
    await renderLayerThumbnail(value, { image: { width: 800, height: 400 } as ImageBitmap, width: 800, height: 400 });

    const scale = 176 / (1_000 + 2 * 4 * shadowBlur);
    const [, , , , renderedWidth] = renderer.draw.mock.calls[0]! as [unknown, unknown, unknown, unknown, number];
    expect(renderedWidth).toBeCloseTo(1_000 * scale);
  });

  it('uses a full-canvas fit for the background and does not require a watermark config', async () => {
    const value = request();
    value.id = '__background__';
    value.layer = {
      id: '__background__',
      kind: 'background',
      name: '',
      visible: false,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    };
    value.state.canvas.watermark = undefined as unknown as NonNullable<ScreenshotState['canvas']['watermark']>;
    await renderLayerThumbnail(value, {});

    expect(renderer.draw).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ canvas: expect.objectContaining({ watermark: undefined }) }),
      value.layer,
      {},
      176,
      88,
    );
    const [x, y] = canvases[0]!.context.translate.mock.calls[0]! as [number, number];
    expect(x).toBeCloseTo(40);
    expect(y).toBeCloseTo(84);
  });

  it('includes cursor shadow in scale while keeping the cursor asset in the partial renderer assets', async () => {
    const value = request();
    value.id = 'cursor-1';
    value.layer = {
      id: 'cursor-1',
      kind: 'cursor',
      name: 'Pointer',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    };
    value.state.shapes = [];
    value.state.cursors = [
      {
        id: 'cursor-1',
        name: 'Pointer',
        enabled: true,
        position: { x: 0.4, y: 0.5 },
        size: 24,
        rotation: 0,
        selection: { mode: 'fixed', packId: 'pack', cursorId: 'pointer' },
        color: '#ff0000',
        shadowEnabled: true,
        shadowBlur: 24,
        shadowColor: '#000000',
        shadowDirection: 'bottom',
      },
    ] as NonNullable<ScreenshotState['cursors']>;
    const asset = {
      id: 'pointer',
      label: 'Pointer',
      url: 'project-media://pointer.svg',
      intrinsicSize: { width: 32, height: 32 },
      nominalSize: 32,
      hotspot: { x: 4, y: 2 },
    };
    const cursorImage = { width: 32, height: 32 } as ImageBitmap;
    const assets = { cursors: new Map([['cursor-1', { image: cursorImage, asset }]]) };

    await renderLayerThumbnail(value, assets);

    const cursorWidth = (24 * 500) / 1080;
    const padding = 4.4 * 24 * (500 / 1080);
    const scale = 176 / (cursorWidth + 2 * padding);
    expect(renderer.draw).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      value.layer,
      assets,
      1_000 * scale,
      500 * scale,
    );
  });

  it('reports a missing readback context for the first surface', async () => {
    contextAvailability = [false, true];

    await expect(renderLayerThumbnail(request(), {})).rejects.toThrow('Thumbnail rendering context unavailable.');
    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('reports a missing output context without attempting to encode', async () => {
    contextAvailability = [true, false];

    await expect(renderLayerThumbnail(request(), {})).rejects.toThrow('Thumbnail output context unavailable.');
    expect(canvases[1]!.convertToBlob).not.toHaveBeenCalled();
  });
});
