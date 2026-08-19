import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isExportWorkerRequest } from '../export-worker-protocol';
import type { PreparedCursorImage } from '../export-cursor-images';
import type { ExportRequest } from '../../export-types';

const runtime = vi.hoisted(() => ({
  openExportAssets: vi.fn(),
  loadBitmap: vi.fn(),
  videoSinks: [] as Array<{
    getSample: ReturnType<typeof vi.fn>;
    samplesAtTimestamps: ReturnType<typeof vi.fn>;
    samples: ReturnType<typeof vi.fn>;
  }>,
  videoIterators: [] as Array<{
    next: ReturnType<typeof vi.fn>;
    return: ReturnType<typeof vi.fn>;
  }>,
  videoSample: vi.fn(),
  videoSamples: vi.fn(),
  renderCompositionFrame: vi.fn(),
  canvasContexts: [] as Array<{
    fillRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    createLinearGradient: ReturnType<typeof vi.fn>;
    createRadialGradient: ReturnType<typeof vi.fn>;
  }>,
  output: {
    start: vi.fn(),
    addVideo: vi.fn(),
    addAudio: vi.fn(),
    closeVideo: vi.fn(),
    closeAudio: vi.fn(),
    finalize: vi.fn(),
    cancel: vi.fn(),
    diagnostics: vi.fn(),
  },
}));

vi.mock('../export-worker-assets', () => ({
  openExportAssets: runtime.openExportAssets,
  loadBitmap: runtime.loadBitmap,
}));
vi.mock('../export-worker-output', () => ({
  ExportWorkerOutput: { create: vi.fn(async () => runtime.output) },
}));
vi.mock('../../composition/render', () => ({
  createSnapshotCameraEvaluator: vi.fn(),
  renderCompositionFrame: runtime.renderCompositionFrame,
}));
vi.mock('../../../video-editor/properties/cursor/useCursorReplacer', () => ({
  cursorTypeForKind: vi.fn(() => 'default'),
}));
vi.mock('~/media/export/pcm-mixer', () => ({
  createProgressiveAudioMixer: vi.fn(),
}));
vi.mock('mediabunny', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mediabunny')>();
  return {
    ...actual,
    VideoSampleSink: class VideoSampleSink {
      readonly getSample = vi.fn(async () => runtime.videoSample());
      readonly samplesAtTimestamps = vi.fn(() => runtime.videoSamples());
      readonly samples = vi.fn(() => runtime.videoSamples());

      constructor(_track: unknown) {
        runtime.videoSinks.push(this as unknown as (typeof runtime.videoSinks)[number]);
      }
    },
  };
});

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    projectName: 'Background worker test',
    format: 'webm',
    preset: 'medium',
    snapshot: {
      duration: 1,
      render: { fps: 30, sourceWidth: null, sourceHeight: null },
      canvas: { width: 2, height: 2 },
      background: null,
      blurPercent: 0,
      zooms: [],
      cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
      cursorSettings: {
        selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
        size: 24,
        color: '#000000',
      },
      cursorPack: {
        id: 'builtin:macos',
        name: 'macOS',
        source: 'builtin',
        colorMode: 'original',
        defaultCursorId: 'default',
        cursors: [],
        automaticMap: {},
      },
      composition: { assets: [], clips: [] },
    },
    ...overrides,
  }) as unknown as ExportRequest;

const installCanvasRuntime = () => {
  const createContext = () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1,
      filter: 'none',
      fillStyle: '',
    };
    runtime.canvasContexts.push(context);
    return context;
  };
  class FakeOffscreenCanvas {
    readonly width: number;
    readonly height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return createContext();
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('VideoEncoder', class VideoEncoder {});
  vi.stubGlobal('VideoDecoder', class VideoDecoder {});
  vi.stubGlobal('AudioEncoder', class AudioEncoder {});
  vi.stubGlobal('AudioDecoder', class AudioDecoder {});
};

const importWorker = async () => {
  vi.resetModules();
  await import('../export.worker');
  return globalThis.self as unknown as typeof globalThis & {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  };
};

const startWorker = (
  worker: Awaited<ReturnType<typeof importWorker>>,
  value = request(),
  cursorImages: PreparedCursorImage[] = [],
) => {
  const message = { type: 'start', request: value, cursorImages } satisfies {
    type: 'start';
    request: ExportRequest;
    cursorImages: PreparedCursorImage[];
  };
  expect(isExportWorkerRequest(message)).toBe(true);
  worker.onmessage?.({ data: message } as MessageEvent<unknown>);
};

beforeEach(() => {
  runtime.openExportAssets.mockReset().mockResolvedValue({ assets: new Map(), screenSize: null, dispose: vi.fn() });
  runtime.loadBitmap.mockReset();
  runtime.videoSinks.length = 0;
  runtime.videoIterators.length = 0;
  runtime.renderCompositionFrame.mockReset();
  runtime.canvasContexts.length = 0;
  runtime.videoSample = vi.fn(() => ({
    displayWidth: 2,
    displayHeight: 2,
    toCanvasImageSource: vi.fn(() => ({})),
    close: vi.fn(),
  }));
  runtime.videoSamples = vi.fn(() => {
    let index = 0;
    const iterator = {
      next: vi.fn(async () => {
        if (index >= 30) return { done: true as const, value: undefined };
        index += 1;
        return { done: false as const, value: runtime.videoSample() };
      }),
      return: vi.fn(async () => ({ done: true as const, value: undefined })),
      [Symbol.asyncIterator]() {
        return iterator;
      },
    };
    runtime.videoIterators.push(iterator);
    return iterator;
  });
  runtime.output.start.mockReset().mockResolvedValue(undefined);
  runtime.output.addVideo.mockReset().mockResolvedValue(undefined);
  runtime.output.addAudio.mockReset().mockResolvedValue(undefined);
  runtime.output.closeVideo.mockReset();
  runtime.output.closeAudio.mockReset();
  runtime.output.finalize.mockReset().mockResolvedValue(undefined);
  runtime.output.cancel.mockReset().mockResolvedValue(undefined);
  runtime.output.diagnostics.mockReset().mockReturnValue({
    videoCodec: 'vp9',
    audioCodec: null,
    chunkCount: 0,
    bytesWritten: 0,
    ipcWriteWaitMs: 0,
  });
  vi.stubGlobal('self', { onmessage: null, postMessage: vi.fn(), location: { href: 'http://localhost/' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export worker background pipeline', () => {
  it.each([
    ['color', { kind: 'color', color: '#123456' }],
    [
      'gradient',
      {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 45,
          stops: [
            { id: 'start', position: 0, color: '#000000', alpha: 1 },
            { id: 'end', position: 1, color: '#ffffff', alpha: 0.5 },
          ],
        },
      },
    ],
    ['image', { kind: 'image', src: 'project-media://background.png' }],
  ] as const)('pre-renders a static %s background once and reuses the layer', async (kind, background) => {
    installCanvasRuntime();
    if (kind === 'image') runtime.loadBitmap.mockResolvedValueOnce({ width: 2, height: 2, close: vi.fn() });
    const worker = await importWorker();
    startWorker(worker, request({ snapshot: { ...request().snapshot, background, blurPercent: 50 } }));

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());

    expect(runtime.renderCompositionFrame).toHaveBeenCalledTimes(30);
    const renderedBackgrounds = runtime.renderCompositionFrame.mock.calls.map((call) => call[4]);
    expect(renderedBackgrounds[0]).toMatchObject({ preRendered: true });
    expect(renderedBackgrounds.every((value) => value === renderedBackgrounds[0])).toBe(true);

    const staticContext = runtime.canvasContexts[1]!;
    if (kind === 'color') expect(staticContext.fillRect).toHaveBeenCalledOnce();
    if (kind === 'gradient') expect(staticContext.createLinearGradient).toHaveBeenCalledOnce();
    if (kind === 'image') {
      expect(runtime.loadBitmap).toHaveBeenCalledOnce();
      expect(staticContext.drawImage).toHaveBeenCalledOnce();
    }
  });

  it('uses timestamp iterators for looping video backgrounds and closes every iterator', async () => {
    installCanvasRuntime();
    const backgroundTrack = { getCodec: vi.fn().mockResolvedValue('vp9') };
    runtime.openExportAssets.mockResolvedValueOnce({
      assets: new Map([
        [
          'export-background',
          {
            asset: {
              id: 'export-background',
              kind: 'video',
              name: 'Background',
              fileName: 'background.webm',
              durationMs: 250,
              width: 2,
              height: 2,
              src: 'project-media://background.webm',
              origin: 'project',
            },
            opened: { dispose: vi.fn() },
            video: backgroundTrack,
            audio: null,
            duration: 0.25,
          },
        ],
      ]),
      screenSize: null,
      dispose: vi.fn(),
    });
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: { ...request().snapshot, background: { kind: 'video', src: 'project-media://background.webm' } },
      }),
    );

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());

    const sink = runtime.videoSinks[0]!;
    expect(sink.getSample).not.toHaveBeenCalled();
    expect(sink.samplesAtTimestamps).toHaveBeenCalledTimes(4);
    expect(runtime.videoIterators).toHaveLength(4);
    for (const iterator of runtime.videoIterators) expect(iterator.return).toHaveBeenCalledOnce();
  });

  it('passes resolved scene layers to each rendered frame', async () => {
    installCanvasRuntime();
    const asset = {
      id: 'image-1',
      kind: 'image',
      name: 'Image',
      fileName: 'image.png',
      durationMs: 1_000,
      width: 2,
      height: 2,
      src: 'project-media://image.png',
      origin: 'project',
    };
    runtime.loadBitmap.mockResolvedValueOnce({ width: 2, height: 2, close: vi.fn() });
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...request().snapshot,
          composition: {
            assets: [asset],
            clips: [
              {
                id: 'image-clip',
                kind: 'image',
                name: 'Image',
                assetId: asset.id,
                timelineStartMs: 0,
                timelineDurationMs: 1_000,
                sourceInMs: 0,
                sourceDurationMs: 1_000,
                playbackRate: 1,
                enabled: true,
                order: 0,
                transform: { x: 0, y: 0, width: 1, height: 1 },
                appearance: {},
                isMirrored: false,
                isMirroredY: false,
              },
            ],
          },
        },
      }),
    );

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());

    expect(
      runtime.renderCompositionFrame.mock.calls.every((call) => {
        const layers = call[9] as { cameraVisuals: Array<{ id: string }> };
        return layers.cameraVisuals.some((clip) => clip.id === 'image-clip');
      }),
    ).toBe(true);
  });
});
