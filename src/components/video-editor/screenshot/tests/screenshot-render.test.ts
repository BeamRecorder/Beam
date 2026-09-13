import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { screenshotShape } from '../screenshot-state';

const renderers = vi.hoisted(() => ({
  renderBackground: vi.fn(),
  drawDecoratedMedia: vi.fn(),
  drawShapeClip: vi.fn(),
  drawBeamWatermark: vi.fn(),
}));
const captureApi = vi.hoisted(() => ({ listCursorPacks: vi.fn() }));
const cursorLoad = vi.hoisted(() => ({ loadScreenshotCursors: vi.fn() }));

vi.mock('../../composition/background/render-background', () => ({ renderBackground: renderers.renderBackground }));
vi.mock('../../composition/appearance/render-decorated-media', () => ({
  drawDecoratedMedia: renderers.drawDecoratedMedia,
}));
vi.mock('../../composition/shape/render-shape-clip', () => ({ drawShapeClip: renderers.drawShapeClip }));
vi.mock('../../canvas/watermark-render', () => ({
  WATERMARK_LOGO_PATH: './brand/beam.svg',
  drawBeamWatermark: renderers.drawBeamWatermark,
}));
vi.mock('~/api/capture', () => ({ capture: captureApi }));
vi.mock('../screenshot-cursors', async (importOriginal) => ({
  ...(await importOriginal()),
  loadScreenshotCursors: cursorLoad.loadScreenshotCursors,
}));

import { drawScreenshot, encodeScreenshot, loadScreenshotAssets, screenshotPreview } from '../screenshot-render';
import type { ScreenshotRenderAssets } from '../screenshot-types';

const image = {} as CanvasImageSource;
const backgroundImage = {} as CanvasImageSource;
const logo = {} as CanvasImageSource;
const encodedBytes = new Uint8Array([1, 2, 3, 255]).buffer;

let encodeOptions: { type: string; quality?: number } | null = null;
let blobTypeOverride: string | null = null;
let canvasDimensions: [number, number] | null = null;
let imageLoadCount = 0;
let imageAssignments: string[] = [];
let imageDecodeError: Error | null = null;
let canvasContextAvailable = true;
let canvasConvertError: Error | null = null;
let arrayBufferResult: Promise<ArrayBuffer> | null = null;
let offscreenCanvases: Array<{ width: number; height: number }> = [];

const context = (canvas: object = {}) =>
  ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  }) as unknown as Canvas2DContext;

const expectCanvasesReleased = () => {
  expect(offscreenCanvases.length).toBeGreaterThan(0);
  expect(offscreenCanvases.every(({ width, height }) => width === 0 && height === 0)).toBe(true);
};

const screenshot = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => ({
  canvas: {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 1_000,
    height: 500,
    showBackground: false,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true, showLogo: true },
  },
  background: { id: 'brand-color', name: 'Brand color', kind: 'color', color: '#123456' },
  blurPercent: 25,
  image: {
    id: 'screenshot',
    kind: 'image',
    name: 'Captured screen',
    assetId: 'screen-1',
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 1,
    transform: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
    appearance: {
      shadowSize: 'md',
      shadowBlur: 20,
      shadowMode: 'solid',
      cornerRadius: 'md',
      shadowColor: '#000000',
      shadowDirection: 'all',
      borderEnabled: false,
      borderColor: '#ffffff',
      borderWidth: 1,
      frame: 'none',
      frameTitle: '',
      frameColor: '#c0c0c0',
      frameShowMenu: true,
      frameShowScrollbars: true,
      frameChromeScale: 1,
    },
    isMirrored: true,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
  },
  shapes: [],
  format: 'png',
  quality: 0.72,
  ...overrides,
});

const scratchComposition = () =>
  screenshot({
    composition: [
      { id: 'screenshot', opacity: 50, blendMode: 'multiply', locked: false },
      { id: '__watermark__', opacity: 100, blendMode: 'source-over', locked: false },
    ],
  });

const assets = () => ({
  image,
  background: backgroundImage,
  logo,
  width: 2_000,
  height: 1_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  captureApi.listCursorPacks.mockResolvedValue([]);
  cursorLoad.loadScreenshotCursors.mockResolvedValue(undefined);
  encodeOptions = null;
  blobTypeOverride = null;
  canvasDimensions = null;
  imageLoadCount = 0;
  imageAssignments = [];
  imageDecodeError = null;
  canvasContextAvailable = true;
  canvasConvertError = null;
  arrayBufferResult = null;
  offscreenCanvases = [];
  vi.stubGlobal(
    'Image',
    class {
      private currentSrc = '';
      private currentCrossOrigin: string | null = null;
      naturalWidth = 2_000;
      naturalHeight = 1_000;
      get src() {
        return this.currentSrc;
      }
      set src(value: string) {
        this.currentSrc = value;
        imageAssignments.push(`src=${value}`);
      }
      get crossOrigin() {
        return this.currentCrossOrigin;
      }
      set crossOrigin(value: string | null) {
        this.currentCrossOrigin = value;
        imageAssignments.push(`crossOrigin=${value}`);
      }
      async decode() {
        if (imageDecodeError) throw imageDecodeError;
      }
      constructor() {
        imageLoadCount += 1;
      }
    },
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      private readonly drawingContext: Canvas2DContext | null;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        canvasDimensions = [width, height];
        offscreenCanvases.push(this);
        this.drawingContext = canvasContextAvailable ? context(this) : null;
      }
      getContext() {
        return this.drawingContext;
      }
      async convertToBlob(options: { type: string; quality?: number }) {
        encodeOptions = options;
        if (canvasConvertError) throw canvasConvertError;
        return {
          type: blobTypeOverride ?? options.type,
          arrayBuffer: () => arrayBufferResult ?? Promise.resolve(encodedBytes),
        } as Blob;
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('drawScreenshot', () => {
  it('clears to transparency and composes shared image, shape and watermark renderers', () => {
    const ctx = context();
    const visibleShape = screenshotShape('arrow', 'visible-arrow');
    const hiddenShape = { ...screenshotShape('ellipse', 'hidden-ellipse'), enabled: false };
    const state = screenshot({ shapes: [visibleShape, hiddenShape] });
    const loaded = assets();

    drawScreenshot(ctx, state, loaded, 1_600, 800);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1_600, 800);
    expect(renderers.renderBackground).not.toHaveBeenCalled();
    expect(renderers.drawDecoratedMedia).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        source: loaded.image,
        rect: { x: 240, y: 160, width: 960, height: 480 },
        sourceRect: { x: 0, y: 0, width: 2000, height: 1000 },
        appearance: state.image.appearance,
        title: state.image.name,
        shadowScale: 1.6,
        mirrored: true,
        mirroredY: false,
      }),
    );
    expect(renderers.drawShapeClip).toHaveBeenCalledOnce();
    expect(renderers.drawShapeClip).toHaveBeenCalledWith(
      ctx,
      visibleShape,
      { x: 0, y: 0, width: 1_600, height: 800 },
      visibleShape.transform,
      ctx.canvas,
    );
    expect(renderers.drawBeamWatermark).toHaveBeenCalledWith(
      ctx,
      state.canvas,
      {
        x: 0,
        y: 0,
        width: 1_600,
        height: 800,
      },
      loaded.logo,
    );
  });

  it('renders a source crop at the same proportions in preview and exported pixels', async () => {
    const state = screenshot();
    state.image.crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
    drawScreenshot(context(), state, assets(), 500, 250);
    const preview = renderers.drawDecoratedMedia.mock.calls.at(-1)![1];
    await encodeScreenshot('project-media://source.png', state);
    const exported = renderers.drawDecoratedMedia.mock.calls.at(-1)![1];
    expect(exported.sourceRect).toEqual({ x: 500, y: 100, width: 1000, height: 800 });
    expect(preview.sourceRect).toEqual(exported.sourceRect);
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(exported.rect[key]).toBeCloseTo(preview.rect[key] * 2);
  });

  it('uses the shared background renderer with the selected image and scaled blur', () => {
    const ctx = context();
    const state = screenshot({ canvas: { ...screenshot().canvas, showBackground: true }, blurPercent: 30 });
    const loaded = assets();

    drawScreenshot(ctx, state, loaded, 2_000, 1_000);

    const [, options] = renderers.renderBackground.mock.calls[0] as unknown as [
      Canvas2DContext,
      {
        value: ScreenshotState['background'];
        source: CanvasImageSource;
        rect: { x: number; y: number; width: number; height: number };
        blurPixels: number;
      },
    ];
    expect(options).toMatchObject({
      value: state.background,
      source: loaded.background,
      rect: { x: 0, y: 0, width: 2_000, height: 1_000 },
    });
    expect(options.blurPixels).toBeCloseTo(28.8);
  });

  it('loads the captured image, selected image background and logo with CORS set before each source', async () => {
    const base = screenshot();
    const state = screenshot({
      canvas: { ...base.canvas, showBackground: true },
      background: {
        id: 'wallpaper',
        name: 'Wallpaper',
        path: 'background.png',
        extension: 'png',
        kind: 'image',
      },
    });

    const loaded = await loadScreenshotAssets('capture.png', state);

    expect(imageLoadCount).toBe(3);
    expect(imageAssignments.slice(0, 4)).toEqual([
      'crossOrigin=anonymous',
      'src=capture.png',
      'crossOrigin=anonymous',
      'src=background.png',
    ]);
    expect(imageAssignments.slice(4, 6)).toEqual(['crossOrigin=anonymous', expect.stringMatching(/^src=/)]);
    expect(loaded.background).not.toBeNull();
    expect(loaded.logo).not.toBeNull();
  });

  it('loads imported composition images and default cursor packs when a cursor is enabled', async () => {
    const base = screenshot();
    const sticker = {
      ...base.image,
      id: 'sticker',
      assetId: 'sticker-asset',
      kind: 'image',
      source: 'sticker.png',
      width: 800,
      height: 450,
    } as NonNullable<ScreenshotState['images']>[number];
    const cursor = {
      id: 'cursor-1',
      name: 'Pointer',
      enabled: true,
      position: { x: 0.5, y: 0.5 },
      size: 1,
      rotation: 0,
      selection: { packId: 'custom-pack', mode: 'fixed', cursorId: 'pointer' },
      color: '#000000',
      shadowEnabled: false,
      shadowBlur: 0,
      shadowColor: '#000000',
      shadowDirection: 'bottom',
    } as NonNullable<ScreenshotState['cursors']>[number];
    const state = screenshot({
      images: [sticker],
      cursors: [cursor],
      canvas: { ...base.canvas, watermark: { ...base.canvas.watermark!, enabled: false } },
    });
    const customPack = { id: 'custom-pack', cursors: [] };
    const cursorAssets = new Map([['cursor-1', { image: {} as CanvasImageSource, asset: {} }]]) as NonNullable<
      ScreenshotRenderAssets['cursors']
    >;
    captureApi.listCursorPacks.mockResolvedValue([customPack]);
    cursorLoad.loadScreenshotCursors.mockResolvedValue(cursorAssets);
    const stickerImage = { naturalWidth: 640, naturalHeight: 360 } as HTMLImageElement;
    const load = vi.fn(async (source: string) => (source === 'sticker.png' ? stickerImage : image) as HTMLImageElement);

    const loaded = await loadScreenshotAssets('capture.png', state, undefined, load);

    expect(captureApi.listCursorPacks).toHaveBeenCalledOnce();
    expect(cursorLoad.loadScreenshotCursors).toHaveBeenCalledWith(
      state.cursors,
      expect.arrayContaining([customPack]),
      state.canvas,
    );
    expect(loaded.cursors).toBe(cursorAssets);
    expect(loaded.images?.get('sticker')).toEqual({ image: stickerImage, width: 640, height: 360 });
    expect(load).toHaveBeenCalledWith('capture.png');
    expect(load).toHaveBeenCalledWith('sticker.png');
  });

  it.each([
    { enabled: false, showLogo: true },
    { enabled: true, showLogo: false },
  ])('does not load a watermark logo when enabled=$enabled and showLogo=$showLogo', async (watermark) => {
    const base = screenshot();
    const state = screenshot({
      canvas: { ...base.canvas, watermark: { ...base.canvas.watermark!, ...watermark } },
      background: null,
    });

    const loaded = await loadScreenshotAssets('capture.png', state);

    expect(loaded.logo).toBeNull();
    expect(imageLoadCount).toBe(1);
    expect(imageAssignments).toEqual(['crossOrigin=anonymous', 'src=capture.png']);
  });

  it('rejects a video background before attempting to load any image', async () => {
    const base = screenshot();
    const state = screenshot({
      canvas: { ...base.canvas, showBackground: true },
      background: {
        id: 'video-wallpaper',
        name: 'Video wallpaper',
        path: 'wallpaper.webm',
        extension: 'webm',
        kind: 'video',
      },
    });

    await expect(loadScreenshotAssets('capture.png', state)).rejects.toThrow(
      'Choose an image, color or gradient for a screenshot background.',
    );

    expect(imageLoadCount).toBe(0);
  });

  it('propagates image decode failures', async () => {
    const decodeError = new Error('image decode failed');
    imageDecodeError = decodeError;

    await expect(loadScreenshotAssets('corrupt.png', screenshot())).rejects.toBe(decodeError);
  });
});

describe('encodeScreenshot', () => {
  it.each([
    { format: 'png' as const, quality: 0.64 },
    { format: 'webp' as const, quality: 0.83 },
  ])('encodes $format using the requested quality', async ({ format, quality }) => {
    const state = screenshot({ format, quality });

    await expect(encodeScreenshot('capture.png', state)).resolves.toBe(encodedBytes);

    expect(canvasDimensions).toEqual([state.canvas.width, state.canvas.height]);
    expect(encodeOptions).toEqual({ type: `image/${format}`, quality });
    expectCanvasesReleased();
  });

  it.each([
    { quality: -0.5, clamped: 0 },
    { quality: 1.5, clamped: 1 },
  ])('clamps export quality $quality to $clamped', async ({ quality, clamped }) => {
    const state = screenshot({ quality });

    await encodeScreenshot('capture.png', state);

    expect(encodeOptions).toEqual({ type: 'image/png', quality: clamped });
  });

  it('rejects when a 2D canvas context cannot be created', async () => {
    canvasContextAvailable = false;

    await expect(encodeScreenshot('capture.png', screenshot())).rejects.toThrow('Image rendering is unavailable.');

    expect(encodeOptions).toBeNull();
    expect(renderers.drawDecoratedMedia).not.toHaveBeenCalled();
    expectCanvasesReleased();
  });

  it.each([
    { width: 16_385, height: 1 },
    { width: 8_192, height: 8_193 },
    { width: 100.5, height: 80 },
  ])('rejects unsupported output dimensions $width by $height before allocating assets', async ({ width, height }) => {
    const state = screenshot({ canvas: { ...screenshot().canvas, width, height } });

    await expect(encodeScreenshot('capture.png', state)).rejects.toThrow(/resolution up to 64 megapixels/);

    expect(canvasDimensions).toBeNull();
    expect(imageLoadCount).toBe(0);
  });

  it('rejects an encoder that returns a different MIME type', async () => {
    blobTypeOverride = 'image/png';
    const state = scratchComposition();
    state.format = 'webp';

    await expect(encodeScreenshot('capture.png', state)).rejects.toThrow('WEBP encoding is unavailable.');
    expect(encodeOptions).toMatchObject({ type: 'image/webp' });
    expect(offscreenCanvases).toHaveLength(2);
    expectCanvasesReleased();
  });

  it('releases both the render target and scratch surface when blob encoding fails', async () => {
    canvasConvertError = new Error('encoder failed');

    await expect(encodeScreenshot('capture.png', scratchComposition())).rejects.toThrow('encoder failed');

    expect(encodeOptions).toMatchObject({ type: 'image/png' });
    expect(offscreenCanvases).toHaveLength(2);
    expectCanvasesReleased();
  });
});

describe('Screenshot progress and preview', () => {
  it('publishes the rendered canvas before full image encoding starts', async () => {
    let release!: () => void;
    const onRendered = vi.fn(async () => {
      expect(encodeOptions).toBeNull();
      expect(renderers.drawDecoratedMedia).toHaveBeenCalledOnce();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = encodeScreenshot('capture.png', screenshot(), { onRendered });
    await vi.waitFor(() => expect(onRendered).toHaveBeenCalledOnce());
    expect(encodeOptions).toBeNull();
    release();
    await expect(pending).resolves.toBe(encodedBytes);
  });

  it('does not encode when the rendered callback fails', async () => {
    await expect(
      encodeScreenshot('capture.png', scratchComposition(), {
        onRendered: async () => {
          throw new Error('preview unavailable');
        },
      }),
    ).rejects.toThrow('preview unavailable');
    expect(encodeOptions).toBeNull();
    expect(offscreenCanvases).toHaveLength(2);
    expectCanvasesReleased();
  });

  it('releases full-size surfaces while the encoded byte promise is still pending', async () => {
    let resolveBytes!: (value: ArrayBuffer) => void;
    arrayBufferResult = new Promise<ArrayBuffer>((resolve) => (resolveBytes = resolve));
    const pending = encodeScreenshot('capture.png', scratchComposition());

    await vi.waitFor(() => expect(encodeOptions).toMatchObject({ type: 'image/png' }));

    expect(offscreenCanvases).toHaveLength(2);
    expectCanvasesReleased();
    resolveBytes(encodedBytes);
    await expect(pending).resolves.toBe(encodedBytes);
  });

  it.each([
    [3840, 2160, 184, 104],
    [10, 20, 10, 20],
    [100, 10000, 1, 104],
  ])('fits a %s×%s preview in a small bounded thumbnail', async (width, height, expectedWidth, expectedHeight) => {
    const value = await screenshotPreview({ width, height } as OffscreenCanvas);
    expect(canvasDimensions).toEqual([expectedWidth, expectedHeight]);
    expect(encodeOptions).toEqual({ type: 'image/jpeg', quality: 0.7 });
    expect(value).toBe('data:image/jpeg;base64,AQID/w==');
    expect(imageLoadCount).toBe(0);
  });

  it('reports an unavailable thumbnail context', async () => {
    canvasContextAvailable = false;
    await expect(screenshotPreview({ width: 10, height: 10 } as OffscreenCanvas)).rejects.toThrow(
      'Image rendering is unavailable.',
    );
  });
});
