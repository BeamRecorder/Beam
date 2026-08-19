import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ExportRequest } from '../../export-types';

const runtime = vi.hoisted(() => ({
  loadCursorImage: vi.fn(),
}));

vi.mock('../../../video-editor/properties/cursor/cursor-image-loader', () => ({
  loadCursorImage: runtime.loadCursorImage,
}));

import { prepareExportCursorImages, requiredExportCursorAssets } from '../export-cursor-images';

const asset = (id: string, intrinsicSize = { width: 32, height: 32 }): CursorAssetDescriptor => ({
  id,
  label: id,
  url: `project-media://cursor/${id}.svg`,
  format: 'svg',
  intrinsicSize,
  nominalSize: 32,
  hotspot: { x: 0, y: 0 },
});

const pack = (): CursorPackDescriptor => ({
  id: 'pack:test',
  name: 'Test cursors',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: 'default',
  cursors: [asset('default'), asset('pointer', { width: 16, height: 8 })],
  automaticMap: { default: 'default', pointer: 'pointer' },
});

const shape = (cursorKind: string) => ({
  event: 'shape',
  cursorKind,
  sessionNs: 0,
  hotspot: { x: 0, y: 0 },
});

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    projectName: 'Cursor image test',
    format: 'webm',
    preset: 'medium',
    snapshot: {
      duration: 1,
      render: { fps: 30, sourceWidth: null, sourceHeight: null },
      canvas: { width: 1920, height: 1080 },
      background: null,
      blurPercent: 0,
      zooms: [],
      cursor: {
        available: true,
        events: [shape('pointer'), shape('pointer'), shape('unknown-role')],
        telemetry: [],
        shapes: {},
        catalog: {},
        missing: [],
      },
      cursorSettings: {
        selection: { packId: 'pack:test', mode: 'automatic', cursorId: null },
        size: 24,
        color: '#ff00ff',
      },
      cursorPack: pack(),
      composition: { assets: [], clips: [] },
    },
    ...overrides,
  }) as unknown as ExportRequest;

const installCanvasRuntime = (options: { failOnCanvas?: number } = {}) => {
  const canvases: Array<{
    width: number;
    height: number;
    context: {
      drawImage: ReturnType<typeof vi.fn>;
      imageSmoothingEnabled?: boolean;
      imageSmoothingQuality?: string;
    };
    transferToImageBitmap: ReturnType<typeof vi.fn>;
  }> = [];
  let nextBitmap = 0;
  class FakeOffscreenCanvas {
    readonly width: number;
    readonly height: number;
    readonly context: {
      drawImage: ReturnType<typeof vi.fn>;
      imageSmoothingEnabled?: boolean;
      imageSmoothingQuality?: string;
    } = { drawImage: vi.fn() };
    readonly transferToImageBitmap = vi.fn(() => {
      nextBitmap += 1;
      return { width: this.width, height: this.height, id: `bitmap-${nextBitmap}`, close: vi.fn() };
    });

    constructor(width: number, height: number) {
      if (canvases.length === options.failOnCanvas) throw new Error('cursor canvas failed');
      this.width = width;
      this.height = height;
      canvases.push(this);
    }

    getContext() {
      return this.context;
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return canvases;
};

beforeEach(() => {
  runtime.loadCursorImage.mockReset().mockImplementation(async (_pack, cursor) => ({ id: cursor.id }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requiredExportCursorAssets', () => {
  it('deduplicates mapped automatic assets and falls back unknown roles to the pack default', () => {
    const assets = requiredExportCursorAssets(request());

    expect(assets.map((entry) => entry.id)).toEqual(['pointer', 'default']);
  });

  it('uses only the fixed asset even when recorded events name another role', () => {
    const value = request({
      snapshot: {
        ...request().snapshot,
        cursorSettings: {
          ...request().snapshot.cursorSettings,
          selection: { packId: 'pack:test', mode: 'fixed', cursorId: 'pointer' },
        },
        cursor: { ...request().snapshot.cursor, events: [shape('default')] },
      },
    });

    expect(requiredExportCursorAssets(value).map((entry) => entry.id)).toEqual(['pointer']);
  });

  it.each([
    ['cursor unavailable', { available: false, events: [shape('pointer')] }],
    ['cursor events empty', { available: true, events: [] }],
  ])('returns no assets when %s', (_label, cursor) => {
    const value = request({ snapshot: { ...request().snapshot, cursor: { ...request().snapshot.cursor, ...cursor } } });

    expect(requiredExportCursorAssets(value)).toEqual([]);
  });

  it('uses the default when cursor data is available but contains no shape events', () => {
    const value = request({
      snapshot: {
        ...request().snapshot,
        cursor: { ...request().snapshot.cursor, events: [{ event: 'visibility', visible: true, sessionNs: 0 }] },
      },
    });

    expect(requiredExportCursorAssets(value).map((entry) => entry.id)).toEqual(['default']);
  });
});

describe('prepareExportCursorImages', () => {
  it('rasterizes each unique asset at six-times output dimensions and preserves selection order', async () => {
    const canvases = installCanvasRuntime();
    const value = request();
    const signal = new AbortController().signal;
    const images = await prepareExportCursorImages(value, signal);

    expect(runtime.loadCursorImage).toHaveBeenNthCalledWith(
      1,
      value.snapshot.cursorPack,
      value.snapshot.cursorPack?.cursors[1],
      72,
      36,
      '#ff00ff',
      { cache: false, signal },
    );
    expect(runtime.loadCursorImage).toHaveBeenNthCalledWith(
      2,
      value.snapshot.cursorPack,
      value.snapshot.cursorPack?.cursors[0],
      144,
      144,
      '#ff00ff',
      { cache: false, signal },
    );
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([
      [72, 36],
      [144, 144],
    ]);
    expect(canvases[0]?.context.drawImage).toHaveBeenCalledWith({ id: 'pointer' }, 0, 0, 72, 36);
    expect(canvases[1]?.context.drawImage).toHaveBeenCalledWith({ id: 'default' }, 0, 0, 144, 144);
    expect(canvases[0]?.context).toMatchObject({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    expect(images.map(({ id }) => id)).toEqual(['pointer', 'default']);
    expect(images.map(({ bitmap }) => bitmap)).toEqual([
      canvases[0]?.transferToImageBitmap.mock.results[0]?.value,
      canvases[1]?.transferToImageBitmap.mock.results[0]?.value,
    ]);
  });

  it('closes already transferred bitmaps when a later cursor image fails', async () => {
    const canvases = installCanvasRuntime({ failOnCanvas: 1 });
    runtime.loadCursorImage.mockResolvedValueOnce({ id: 'pointer' });
    runtime.loadCursorImage.mockResolvedValueOnce({ id: 'default' });

    await expect(prepareExportCursorImages(request())).rejects.toThrow('cursor canvas failed');

    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.transferToImageBitmap).toHaveBeenCalledOnce();
    const produced = canvases[0]?.transferToImageBitmap.mock.results[0]?.value;
    expect(produced.close).toHaveBeenCalledOnce();
  });

  it('passes cancellation to each uncached load and closes prior bitmaps after cancellation', async () => {
    const canvases = installCanvasRuntime();
    const controller = new AbortController();
    let rejectSecond!: (error: unknown) => void;
    runtime.loadCursorImage.mockResolvedValueOnce({ id: 'pointer' }).mockImplementationOnce(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          rejectSecond = reject;
          expect(args[5]).toEqual({ cache: false, signal: controller.signal });
        }),
    );

    const pending = prepareExportCursorImages(request(), controller.signal);
    await vi.waitFor(() => expect(runtime.loadCursorImage).toHaveBeenCalledTimes(2));
    controller.abort();
    rejectSecond(new DOMException('Cursor image loading was cancelled.', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const firstBitmap = canvases[0]?.transferToImageBitmap.mock.results[0]?.value;
    expect(firstBitmap.close).toHaveBeenCalledOnce();
  });

  it('fails before rasterization when OffscreenCanvas is unavailable', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    await expect(prepareExportCursorImages(request())).rejects.toThrow('OffscreenCanvas is required for export.');
    expect(runtime.loadCursorImage).not.toHaveBeenCalled();
  });
});
