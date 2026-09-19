import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID } from '../screenshot-layers';

const rendering = vi.hoisted(() => ({ draw: vi.fn(), alphaBounds: vi.fn() }));
vi.mock('../screenshot-layer-render', () => ({ drawScreenshotLayer: rendering.draw }));
vi.mock('../composition/thumbnails/thumbnail-pixels', () => ({ alphaBounds: rendering.alphaBounds }));

import { rasterizeScreenshotLayer } from '../screenshot-layer-clipboard-raster';

const makeState = (): ScreenshotState => ({
  canvas: {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 2_000,
    height: 1_000,
    showBackground: true,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true, showLogo: false },
  },
  background: { id: 'color', name: 'Color', kind: 'color', color: '#123456' },
  blurPercent: 20,
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
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
  },
  shapes: [],
  format: 'png',
  quality: 0.9,
});

describe('rasterizeScreenshotLayer', () => {
  const canvases: Array<{ width: number; height: number; convertToBlob: ReturnType<typeof vi.fn> }> = [];
  const surfaceContext = {
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(1_400 * 700 * 4) })),
  };
  const outputContext = { drawImage: vi.fn() };

  beforeEach(() => {
    rendering.draw.mockReset();
    rendering.alphaBounds.mockReset();
    surfaceContext.getImageData.mockClear();
    outputContext.drawImage.mockClear();
    canvases.length = 0;
    let contextIndex = 0;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number;
        height: number;
        convertToBlob = vi.fn(
          async () =>
            ({
              type: 'image/webp',
              arrayBuffer: async () => new TextEncoder().encode('raster').buffer,
            }) as Blob,
        );
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          canvases.push(this);
        }
        getContext() {
          return contextIndex++ % 2 === 0 ? surfaceContext : outputContext;
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rasterizes a full-canvas background into a neutral editable image', async () => {
    const state = makeState();
    const result = await rasterizeScreenshotLayer(state, SCREENSHOT_BACKGROUND_ID, 'Background');

    expect(rendering.draw).toHaveBeenCalledWith(
      surfaceContext,
      state,
      expect.objectContaining({ id: SCREENSHOT_BACKGROUND_ID, kind: 'background' }),
      { background: null, logo: null },
      1_400,
      700,
    );
    expect(result).toMatchObject({
      id: SCREENSHOT_BACKGROUND_ID,
      kind: 'image',
      name: 'Background',
      source: expect.stringMatching(/^data:image\/webp;base64,/),
      width: 1_400,
      height: 700,
      transform: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(canvases[1]?.convertToBlob).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.85 });
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('crops a watermark raster to its visible alpha bounds', async () => {
    const state = makeState();
    rendering.alphaBounds.mockReturnValue({ x: 140, y: 70, width: 350, height: 140 });

    const result = await rasterizeScreenshotLayer(state, SCREENSHOT_WATERMARK_ID, 'Watermark');

    expect(surfaceContext.getImageData).toHaveBeenCalledWith(0, 0, 1_400, 700);
    expect(outputContext.drawImage).toHaveBeenCalledWith(expect.anything(), 140, 70, 350, 140, 0, 0, 350, 140);
    expect(result).toMatchObject({
      name: 'Watermark',
      width: 350,
      height: 140,
      transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.2 },
    });
  });
});
