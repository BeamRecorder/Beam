import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isExportWorkerRequest } from '../export-worker-protocol';

const runtime = vi.hoisted(() => ({
  openExportAssets: vi.fn(),
  loadBitmap: vi.fn(),
  output: {
    start: vi.fn(),
    addVideo: vi.fn(),
    addAudio: vi.fn(),
    closeVideo: vi.fn(),
    closeAudio: vi.fn(),
    finalize: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../export-worker-assets', () => ({
  openExportAssets: runtime.openExportAssets,
  loadBitmap: runtime.loadBitmap,
}));
vi.mock('../export-worker-output', () => ({
  ExportWorkerOutput: {
    create: vi.fn(async () => runtime.output),
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
  createProgressiveAudioMixer: vi.fn(),
}));

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    projectName: 'Worker test',
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
      cursorSettings: { selectedCursor: 'automatic', size: 24, color: '#000000' },
      composition: { assets: [], clips: [] },
    },
    ...overrides,
  }) as never;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const installCanvasRuntime = () => {
  class FakeOffscreenCanvas {
    readonly width = 2;
    readonly height = 2;

    getContext() {
      return {};
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('VideoEncoder', class VideoEncoder {});
  vi.stubGlobal('VideoDecoder', class VideoDecoder {});
};

const importWorker = async () => {
  vi.resetModules();
  await import('../export.worker');
  return globalThis.self as unknown as typeof globalThis & {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  };
};

const startWorker = (worker: Awaited<ReturnType<typeof importWorker>>, value = request()) => {
  expect(isExportWorkerRequest({ type: 'start', request: value })).toBe(true);
  worker.onmessage?.({ data: { type: 'start', request: value } } as MessageEvent<unknown>);
};

beforeEach(() => {
  runtime.openExportAssets.mockReset();
  runtime.loadBitmap.mockReset();
  runtime.output.start.mockReset().mockResolvedValue(undefined);
  runtime.output.addVideo.mockReset().mockResolvedValue(undefined);
  runtime.output.addAudio.mockReset().mockResolvedValue(undefined);
  runtime.output.closeVideo.mockReset();
  runtime.output.closeAudio.mockReset();
  runtime.output.finalize.mockReset().mockResolvedValue(undefined);
  runtime.output.cancel.mockReset().mockResolvedValue(undefined);
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
  it('fails explicitly when OffscreenCanvas is unavailable', async () => {
    const worker = await importWorker();
    startWorker(worker);
    await flush();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: expect.objectContaining({ message: 'OffscreenCanvas is required for export.' }),
    });
    expect(runtime.openExportAssets).not.toHaveBeenCalled();
  });

  it('publishes the validating-assets progress message before opening assets', async () => {
    installCanvasRuntime();
    const worker = await importWorker();
    startWorker(worker);
    await flush();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'progress',
      progress: expect.objectContaining({ stage: 'validating_assets', overallProgress: 0 }),
    });
    expect(runtime.openExportAssets).toHaveBeenCalledOnce();
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
