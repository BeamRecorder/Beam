import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isExportWorkerRequest } from '../export-worker-protocol';
import type { PreparedCursorImage } from '../export-cursor-images';
import type { ExportRequest } from '../../export-types';
import { BUNDLED_CURSOR_PACKS } from '../../../video-editor/properties/cursor/cursor-packs';

const runtime = vi.hoisted(() => ({
  openExportAssets: vi.fn(),
  loadBitmap: vi.fn(),
  videoSinks: [] as Array<{
    getSample: ReturnType<typeof vi.fn>;
    samplesAtTimestamps: ReturnType<typeof vi.fn>;
    samples: ReturnType<typeof vi.fn>;
  }>,
  videoSample: vi.fn(),
  videoSamples: vi.fn(),
  createProgressiveAudioMixer: vi.fn(),
  audioMixer: {
    blockCount: 0,
    mixBlock: vi.fn(),
    dispose: vi.fn(),
  },
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
  outputCreate: vi.fn(),
}));

vi.mock('../export-worker-assets', () => ({
  openExportAssets: runtime.openExportAssets,
  loadBitmap: runtime.loadBitmap,
}));
vi.mock('../export-worker-output', () => ({
  ExportWorkerOutput: {
    create: vi.fn(async (...args: unknown[]) => {
      runtime.outputCreate(...args);
      return runtime.output;
    }),
  },
}));
vi.mock('../../composition/render', () => ({
  createSnapshotCameraEvaluator: vi.fn(),
  renderCompositionFrame: vi.fn(),
}));
vi.mock('../../../video-editor/properties/cursor/useCursorReplacer', () => ({
  cursorTypeForKind: vi.fn(() => 'default'),
}));
vi.mock('~/media/export/pcm-mixer', () => ({
  createProgressiveAudioMixer: runtime.createProgressiveAudioMixer,
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
    projectName: 'Worker test',
    format: 'webm',
    preset: 'medium',
    includeAudio: true,
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
        colorMode: 'tintable',
        defaultCursorId: 'default',
        cursors: [
          {
            id: 'default',
            label: 'Default',
            url: '/macOsSvgCursors/default.svg',
            format: 'svg',
            intrinsicSize: { width: 32, height: 32 },
            nominalSize: 32,
            hotspot: { x: 10, y: 7 },
          },
          {
            id: 'textcursor',
            label: 'Text Cursor',
            url: '/macOsSvgCursors/textcursor.svg',
            format: 'svg',
            intrinsicSize: { width: 32, height: 32 },
            nominalSize: 32,
            hotspot: { x: 16, y: 16 },
          },
        ],
        automaticMap: { default: 'default', textcursor: 'textcursor' },
      },
      composition: { assets: [], clips: [] },
    },
    ...overrides,
  }) as unknown as ExportRequest;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const installCanvasRuntime = () => {
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  class FakeOffscreenCanvas {
    readonly width = 2;
    readonly height = 2;

    getContext() {
      return context;
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('VideoEncoder', class VideoEncoder {});
  vi.stubGlobal('VideoDecoder', class VideoDecoder {});
  vi.stubGlobal('AudioEncoder', class AudioEncoder {});
  vi.stubGlobal('AudioDecoder', class AudioDecoder {});
  return context;
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

const preparedCursorImage = (id: string) => {
  const close = vi.fn();
  const bitmap = { width: 144, height: 144, close } as unknown as ImageBitmap;
  return { prepared: { id, bitmap } satisfies PreparedCursorImage, close };
};

beforeEach(() => {
  runtime.openExportAssets.mockReset();
  runtime.loadBitmap.mockReset();
  runtime.outputCreate.mockReset();
  runtime.videoSinks.length = 0;
  runtime.videoSample = vi.fn(() => ({
    displayWidth: 2,
    displayHeight: 2,
    toCanvasImageSource: vi.fn(() => ({})),
    close: vi.fn(),
  }));
  runtime.videoSamples = vi.fn(() =>
    (async function* () {
      for (let index = 0; index < 30; index += 1) yield runtime.videoSample();
    })(),
  );
  runtime.audioMixer.blockCount = 0;
  runtime.audioMixer.mixBlock.mockReset().mockResolvedValue({});
  runtime.audioMixer.dispose.mockReset().mockResolvedValue(undefined);
  runtime.createProgressiveAudioMixer.mockReset().mockReturnValue(runtime.audioMixer);
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
  runtime.openExportAssets.mockResolvedValue({
    assets: new Map(),
    screenSize: null,
    dispose: vi.fn(),
  });
  vi.stubGlobal('self', {
    onmessage: null,
    postMessage: vi.fn(),
    location: { href: 'http://localhost/' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<svg />'),
      blob: vi.fn().mockResolvedValue(new Blob()),
    }),
  );
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 24, height: 24, close: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export worker', () => {
  it('configures the export canvas for high-quality image smoothing', async () => {
    const context = installCanvasRuntime();
    const worker = await importWorker();
    startWorker(worker);

    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());

    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
  });

  it('fails explicitly when OffscreenCanvas is unavailable', async () => {
    const prepared = preparedCursorImage('default');
    const worker = await importWorker();
    startWorker(worker, request(), [prepared.prepared]);
    await flush();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: expect.objectContaining({ message: 'OffscreenCanvas is required for export.' }),
    });
    expect(runtime.openExportAssets).not.toHaveBeenCalled();
    expect(prepared.close).toHaveBeenCalledOnce();
  });

  it('publishes the validating-assets progress message before opening assets', async () => {
    installCanvasRuntime();
    runtime.openExportAssets.mockReturnValueOnce(new Promise(() => undefined));
    const worker = await importWorker();
    startWorker(worker);
    await flush();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'progress',
      progress: expect.objectContaining({ stage: 'validating_assets', overallProgress: 0 }),
    });
    expect(runtime.openExportAssets).toHaveBeenCalledOnce();
  });

  it('logs phase durations and measured encoding throughput after frame progress completes', async () => {
    installCanvasRuntime();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const worker = await importWorker();
      startWorker(worker);
      await vi.waitFor(() =>
        expect(worker.postMessage).toHaveBeenCalledWith({
          type: 'complete',
          diagnostics: expect.objectContaining({ encodedFps: expect.any(Number), videoCodec: 'vp9' }),
        }),
      );

      expect(info).toHaveBeenCalledWith(
        '[Beam export] asset validation',
        expect.objectContaining({ elapsedMs: expect.any(Number) }),
      );
      expect(info).toHaveBeenCalledWith(
        '[Beam export] asset loading',
        expect.objectContaining({ elapsedMs: expect.any(Number) }),
      );
      expect(info).toHaveBeenCalledWith(
        '[Beam export] finalization',
        expect.objectContaining({ elapsedMs: expect.any(Number) }),
      );
      expect(info).toHaveBeenCalledWith(
        '[Beam export] encoding complete',
        expect.objectContaining({ elapsedMs: expect.any(Number), encodingFps: expect.any(Number) }),
      );
    } finally {
      info.mockRestore();
    }
  });

  it('does not decode an SVG cursor when cursor data is unavailable', async () => {
    installCanvasRuntime();
    runtime.output.start.mockRejectedValueOnce(new Error('encoder startup failed'));
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...request().snapshot,
          cursorSettings: {
            ...request().snapshot.cursorSettings,
            selection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'default' },
          },
        },
      }),
    );

    await vi.waitFor(() => expect(runtime.openExportAssets).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('macOsSvgCursors'));
    expect(createImageBitmap).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
  });

  it('blocks export with a missing-asset issue when the selected cursor pack is unavailable', async () => {
    installCanvasRuntime();
    const base = request();
    const worker = await importWorker();
    startWorker(worker, request({ snapshot: { ...base.snapshot, cursorPack: null } }));

    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'error',
        error: expect.objectContaining({
          issue: expect.objectContaining({ code: 'missing-asset', assetId: 'builtin:macos' }),
        }),
      }),
    );
    expect(runtime.output.start).not.toHaveBeenCalled();
  });

  it.each([
    ['default', 'webm'],
    ['default', 'mp4'],
    ['textcursor', 'webm'],
    ['textcursor', 'mp4'],
  ] as const)(
    'successfully exports the prepared macOS %s bitmap in %s without worker decoding',
    async (cursorId, format) => {
      installCanvasRuntime();
      const prepared = preparedCursorImage(cursorId);
      const base = request();
      const worker = await importWorker();
      startWorker(
        worker,
        request({
          format,
          snapshot: {
            ...base.snapshot,
            cursor: {
              ...base.snapshot.cursor,
              available: true,
              events: [{ event: 'shape', cursorKind: cursorId, sessionNs: 0 }],
            },
          },
        }),
        [prepared.prepared],
      );

      await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());
      await vi.waitFor(() =>
        expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'complete' })),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(createImageBitmap).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(prepared.close).toHaveBeenCalledOnce());
    },
  );

  it('reports a deterministic decode failure when a required prepared cursor bitmap is missing', async () => {
    installCanvasRuntime();
    const base = request();
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...base.snapshot,
          cursor: {
            ...base.snapshot.cursor,
            available: true,
            events: [{ event: 'shape', cursorKind: 'default', sessionNs: 0 }],
          },
        },
      }),
    );

    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'error',
        error: expect.objectContaining({
          message: 'Cursor "default" was not rasterized before export.',
          issue: expect.objectContaining({ code: 'decode-failure', assetId: 'default' }),
        }),
      }),
    );
    expect(runtime.output.start).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('closes a transferred cursor bitmap after a successful export', async () => {
    installCanvasRuntime();
    const prepared = preparedCursorImage('default');
    const base = request();
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...base.snapshot,
          cursor: {
            ...base.snapshot.cursor,
            available: true,
            events: [{ event: 'shape', cursorKind: 'default', sessionNs: 0 }],
          },
        },
      }),
      [prepared.prepared],
    );

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(prepared.close).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('uses prepared mapped and fallback cursor images in automatic mode without worker decoding', async () => {
    installCanvasRuntime();
    runtime.output.start.mockRejectedValueOnce(new Error('encoder startup failed'));
    const pack = BUNDLED_CURSOR_PACKS.find((entry) => entry.id === 'builtin:bibata-material-noir')!;
    const pointer = pack.cursors.find((asset) => asset.id === 'pointer')!;
    const fallback = pack.cursors.find((asset) => asset.id === pack.defaultCursorId)!;
    const preparedPointer = preparedCursorImage(pointer.id);
    const preparedFallback = preparedCursorImage(fallback.id);
    const base = request();
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...base.snapshot,
          cursor: {
            ...base.snapshot.cursor,
            available: true,
            events: [
              { event: 'shape', cursorKind: 'pointer', sessionNs: 0 },
              { event: 'shape', cursorKind: 'unmapped-role', sessionNs: 1 },
            ],
          },
          cursorSettings: {
            ...base.snapshot.cursorSettings,
            selection: { packId: pack.id, mode: 'automatic', cursorId: null },
          },
          cursorPack: pack,
        },
      }),
      [preparedPointer.prepared, preparedFallback.prepared],
    );

    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(preparedPointer.close).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(preparedFallback.close).toHaveBeenCalledOnce());
  });

  it('uses the prepared selected cursor image in fixed mode without worker recoloring', async () => {
    installCanvasRuntime();
    runtime.output.start.mockRejectedValueOnce(new Error('encoder startup failed'));
    const pack = BUNDLED_CURSOR_PACKS.find((entry) => entry.id === 'builtin:bibata-material-noir')!;
    const selected = pack.cursors.find((asset) => asset.id === 'pointer')!;
    const preparedSelected = preparedCursorImage(selected.id);
    const base = request();
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        snapshot: {
          ...base.snapshot,
          cursor: {
            ...base.snapshot.cursor,
            available: true,
            events: [{ event: 'shape', cursorKind: 'default', sessionNs: 0 }],
          },
          cursorSettings: {
            ...base.snapshot.cursorSettings,
            color: '#ff00ff',
            selection: { packId: pack.id, mode: 'fixed', cursorId: selected.id },
          },
          cursorPack: pack,
        },
      }),
      [preparedSelected.prepared],
    );

    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(preparedSelected.close).toHaveBeenCalledOnce());
  });

  it('uses one persistent timestamp/sample iterator instead of getSample for every video image', async () => {
    installCanvasRuntime();
    const asset = {
      id: 'video-1',
      kind: 'video',
      name: 'Video',
      fileName: 'video.mp4',
      durationMs: 1_000,
      width: 2,
      height: 2,
      src: 'project-media://asset/video.mp4',
      origin: 'project',
    };
    const clip = {
      id: 'clip-1',
      kind: 'video',
      name: 'Video clip',
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
    };
    const track = { getCodec: vi.fn().mockResolvedValue('vp9') };
    runtime.openExportAssets.mockResolvedValueOnce({
      assets: new Map([[asset.id, { asset, opened: { dispose: vi.fn() }, video: track, audio: null, duration: 1 }]]),
      screenSize: null,
      dispose: vi.fn(),
    });
    const worker = await importWorker();
    startWorker(
      worker,
      request({ snapshot: { ...request().snapshot, composition: { assets: [asset], clips: [clip] } } }),
    );

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());
    const sink = runtime.videoSinks[0]!;
    expect(sink.getSample).not.toHaveBeenCalled();
    expect(sink.samplesAtTimestamps.mock.calls.length + sink.samples.mock.calls.length).toBe(1);
    expect(runtime.output.addVideo).toHaveBeenCalledTimes(30);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'progress',
      progress: expect.objectContaining({ stage: 'finalizing', completedImages: 30, totalImages: 30 }),
    });
  });

  it('skips audio setup and encoding when includeAudio is false', async () => {
    installCanvasRuntime();
    vi.stubGlobal('AudioEncoder', undefined);
    vi.stubGlobal('AudioDecoder', undefined);
    const audioClip = {
      id: 'audio-clip',
      kind: 'audio',
      name: 'Audio clip',
      assetId: 'missing-audio-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      volume: 1,
      enabled: true,
      order: 0,
    };
    const worker = await importWorker();
    startWorker(
      worker,
      request({
        includeAudio: false,
        snapshot: { ...request().snapshot, composition: { assets: [], clips: [audioClip] } },
      }),
    );

    await vi.waitFor(() => expect(runtime.output.finalize).toHaveBeenCalledOnce());

    expect(runtime.outputCreate).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
    expect(runtime.createProgressiveAudioMixer).not.toHaveBeenCalled();
    expect(runtime.output.addAudio).not.toHaveBeenCalled();
    expect(runtime.output.closeAudio).not.toHaveBeenCalled();
    const progressMessages = worker.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'progress');
    expect(progressMessages.length).toBeGreaterThan(0);
    expect(progressMessages.every((message) => message.progress.audioProgress === null)).toBe(true);
  });

  it('weights overall encoding progress with 85% video and 15% audio', async () => {
    installCanvasRuntime();
    const now = vi.spyOn(performance, 'now');
    let clock = 0;
    now.mockImplementation(() => (clock += 101));
    try {
      const audioClip = {
        id: 'audio-clip',
        kind: 'audio',
        name: 'Audio clip',
        assetId: 'audio-asset',
        timelineStartMs: 0,
        timelineDurationMs: 1_000,
        sourceInMs: 0,
        sourceDurationMs: 1_000,
        playbackRate: 1,
        volume: 1,
        enabled: true,
        order: 0,
      };
      let releaseAudio!: (value: unknown) => void;
      runtime.audioMixer.blockCount = 1;
      runtime.audioMixer.mixBlock.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseAudio = resolve;
        }),
      );
      const worker = await importWorker();
      startWorker(
        worker,
        request({ snapshot: { ...request().snapshot, composition: { assets: [], clips: [audioClip] } } }),
      );

      await vi.waitFor(() =>
        expect(worker.postMessage).toHaveBeenCalledWith({
          type: 'progress',
          progress: expect.objectContaining({ stage: 'encoding', completedImages: 30, audioProgress: 0 }),
        }),
      );
      const videoComplete = worker.postMessage.mock.calls.find(
        ([message]) =>
          message.type === 'progress' &&
          message.progress?.stage === 'encoding' &&
          message.progress?.completedImages === 30 &&
          message.progress?.audioProgress === 0,
      )?.[0];
      expect(videoComplete?.progress.overallProgress).toBeCloseTo(0.08 + 0.9 * 0.85, 6);

      releaseAudio({});
      await vi.waitFor(() => expect(runtime.audioMixer.dispose).toHaveBeenCalledOnce());
    } finally {
      now.mockRestore();
    }
  });

  it('disposes opened assets and cancels output when rendering fails', async () => {
    installCanvasRuntime();
    const dispose = vi.fn();
    runtime.openExportAssets.mockResolvedValueOnce({ assets: new Map(), screenSize: null, dispose });
    runtime.output.start.mockRejectedValueOnce(new Error('encoder startup failed'));
    const worker = await importWorker();
    startWorker(worker);
    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());

    await vi.waitFor(() => expect(runtime.output.cancel).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: expect.objectContaining({ message: 'encoder startup failed' }),
    });
  });

  it('cancels the output and disposes the mixer when the audio pipeline fails', async () => {
    installCanvasRuntime();
    const dispose = vi.fn();
    runtime.openExportAssets.mockResolvedValueOnce({ assets: new Map(), screenSize: null, dispose });
    runtime.audioMixer.blockCount = 1;
    runtime.audioMixer.mixBlock.mockRejectedValueOnce(new Error('audio pipeline failed'));
    const audioClip = {
      id: 'audio-clip',
      kind: 'audio',
      name: 'Audio clip',
      assetId: 'audio-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      volume: 1,
      enabled: true,
      order: 0,
    };
    const worker = await importWorker();
    startWorker(
      worker,
      request({ snapshot: { ...request().snapshot, composition: { assets: [], clips: [audioClip] } } }),
    );

    await vi.waitFor(() => expect(runtime.output.cancel).toHaveBeenCalledOnce());
    expect(runtime.audioMixer.dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: expect.objectContaining({ message: 'audio pipeline failed' }),
    });
  });

  it('aborts the active output when receiving cancel', async () => {
    installCanvasRuntime();
    const dispose = vi.fn();
    runtime.openExportAssets.mockResolvedValueOnce({ assets: new Map(), screenSize: null, dispose });
    let releaseStart!: () => void;
    runtime.output.start.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseStart = resolve;
      }),
    );
    const worker = await importWorker();
    startWorker(worker);
    await vi.waitFor(() => expect(runtime.output.start).toHaveBeenCalledOnce());

    worker.onmessage?.({ data: { type: 'cancel' } } as MessageEvent<unknown>);

    expect(runtime.output.cancel).toHaveBeenCalledOnce();
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    releaseStart();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });
});
