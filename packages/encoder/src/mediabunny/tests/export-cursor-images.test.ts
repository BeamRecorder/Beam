import type { VisualClip } from '@beam/engine/shared/composition-types';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { splitClip } from '@beam/engine/commands/clip-engine';
import { setScreenCursorSettings, cursorImageKey } from '@beam/engine/capture/screen-cursor-settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { ExportRequest } from '@beam/encoder/export-types';
import { cursorComposition } from '@beam/engine/capture/screen-cursor.test-support';
import { setScreenCursorVisibility } from '@beam/engine/capture/screen-cursor';
import { prepareExportCursorImages, requiredExportCursorAssets } from '@beam/encoder/mediabunny/export-cursor-images';

const runtime = vi.hoisted(() => ({
  loadCursorImage: vi.fn(),
}));

vi.mock('@beam/runtime/cursor/cursor-image-loader', () => ({
  loadCursorImage: runtime.loadCursorImage,
}));

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
      composition: cursorComposition(),
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

it('exports a disabled overlay without requiring an imported cursor pack or loading artwork', async () => {
  const value = request();
  value.snapshot.cursorSettings.enabled = false;
  value.snapshot.cursorPack = null;
  const events = value.snapshot.cursor.events;
  expect(requiredExportCursorAssets(value)).toEqual([]);
  const prepared = await prepareExportCursorImages(value);
  expect(prepared).toEqual([]);
  expect(runtime.loadCursorImage).not.toHaveBeenCalled();
  expect(value.snapshot.cursor.events).toBe(events);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requiredExportCursorAssets', () => {
  it('loads artwork for an explicitly visible clip even when the document cursor default is off', () => {
    const value = request();
    value.snapshot.cursorSettings.enabled = false;
    value.snapshot.composition = setScreenCursorVisibility(value.snapshot.composition, ['screen'], true);
    expect(requiredExportCursorAssets(value).map((entry) => entry.id)).toEqual(['pointer', 'default']);
  });
  it('skips artwork when every clip is off or no screen clip remains', async () => {
    const value = request();
    value.snapshot.composition = setScreenCursorVisibility(value.snapshot.composition, ['screen'], false);
    expect(requiredExportCursorAssets(value)).toEqual([]);
    expect(await prepareExportCursorImages(value)).toEqual([]);
    value.snapshot.composition.clips = [];
    expect(requiredExportCursorAssets(value)).toEqual([]);
    expect(runtime.loadCursorImage).not.toHaveBeenCalled();
  });
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

describe('clip-specific export artwork', () => {
  const styledRequest = () => {
    const value = request();
    value.snapshot.cursorSettings = { ...createDefaultCursorPresentation(), ...value.snapshot.cursorSettings };
    value.snapshot.composition = splitClip(value.snapshot.composition, 'screen', 1000);
    const right = value.snapshot.composition.clips.find((clip) => clip.timelineStartMs === 1000)!;
    const { enabled: _, ...style } = value.snapshot.cursorSettings;
    value.snapshot.composition = setScreenCursorSettings(value.snapshot.composition, ['screen'], {
      ...style,
      color: '#ff0000',
      size: 20,
    });
    value.snapshot.composition = setScreenCursorSettings(value.snapshot.composition, [right.id], {
      ...style,
      color: '#0000ff',
      size: 70,
    });
    return { value, right };
  };
  it('rasterizes separate colors and sizes for two segments using the same artwork', async () => {
    installCanvasRuntime();
    const { value } = styledRequest();
    const images = await prepareExportCursorImages(value);
    expect(images.map((image) => image.id)).toEqual([
      cursorImageKey('pack:test', 'pointer', '#ff0000'),
      cursorImageKey('pack:test', 'default', '#ff0000'),
      cursorImageKey('pack:test', 'pointer', '#0000ff'),
      cursorImageKey('pack:test', 'default', '#0000ff'),
    ]);
    expect(runtime.loadCursorImage.mock.calls.map((call) => call[4])).toEqual([
      '#ff0000',
      '#ff0000',
      '#0000ff',
      '#0000ff',
    ]);
    expect(images[3]!.bitmap.width).toBeGreaterThan(images[1]!.bitmap.width);
  });
  it('resolves imported packs per segment even when asset IDs overlap', async () => {
    installCanvasRuntime();
    const { value, right } = styledRequest();
    const other = { ...pack(), id: 'pack:other' };
    value.snapshot.cursorPacks = [other];
    const style = (value.snapshot.composition.clips.find((clip) => clip.id === right.id) as VisualClip).cursorSettings!;
    value.snapshot.composition = setScreenCursorSettings(value.snapshot.composition, [right.id], {
      ...style,
      selection: { ...style.selection, packId: other.id },
    });
    await prepareExportCursorImages(value);
    expect(runtime.loadCursorImage.mock.calls.map((call) => call[0].id)).toEqual([
      'pack:test',
      'pack:test',
      'pack:other',
      'pack:other',
    ]);
  });
  it('rejects a missing per-clip pack and skips it when that clip is hidden', () => {
    const { value, right } = styledRequest();
    const style = (value.snapshot.composition.clips.find((clip) => clip.id === right.id) as VisualClip).cursorSettings!;
    value.snapshot.composition = setScreenCursorSettings(value.snapshot.composition, [right.id], {
      ...style,
      selection: { ...style.selection, packId: 'missing' },
    });
    expect(() => requiredExportCursorAssets(value)).toThrow('missing');
    value.snapshot.composition = setScreenCursorVisibility(value.snapshot.composition, [right.id], false);
    expect(() => requiredExportCursorAssets(value)).not.toThrow();
  });
});
