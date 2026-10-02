import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportRequest } from '@beam/encoder/export-types';
import type { ExportWorkerResponse } from '@beam/encoder/mediabunny/export-worker-protocol';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';

const { prepareExportCursorImages, environment } = vi.hoisted(() => ({
  prepareExportCursorImages: vi.fn(),
  environment: vi.fn(),
}));
const nativeExport = vi.hoisted(() => vi.fn());
vi.mock('@desktop/components/export/experimental-exporter', () => ({ exportWithLinuxFfmpeg: nativeExport }));
vi.mock('@beam/encoder/mediabunny/export-cursor-images', () => ({ prepareExportCursorImages }));
vi.mock('@desktop/components/export/export-environment', () => ({ collectExportEnvironment: environment }));

import { exportWithMediabunny } from '@desktop/components/export/mediabunny/exporter';

type WorkerMessage = { type: string; [key: string]: unknown };

class FakeWorker {
  static instances: FakeWorker[] = [];
  static startFailure: Error | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: WorkerMessage[] = [];
  readonly transfers: Transferable[][] = [];
  readonly terminate = vi.fn();

  constructor(_url: URL, _options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage, options?: Transferable[] | { transfer?: Transferable[] }) {
    if (message.type === 'start' && FakeWorker.startFailure) throw FakeWorker.startFailure;
    this.posted.push(message);
    this.transfers.push(Array.isArray(options) ? options : (options?.transfer ?? []));
  }

  emit(message: ExportWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<ExportWorkerResponse>);
  }

  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const request = (): ExportRequest =>
  ({
    projectName: 'Worker export',
    format: 'webm',
    preset: 'medium',
    snapshot: {
      duration: 2,
      render: { fps: 60, sourceWidth: null, sourceHeight: null },
      composition: { clips: [] },
    },
  }) as unknown as ExportRequest;

const progress = (
  overallProgress: number,
  stage: 'validating_assets' | 'loading_assets' | 'encoding' | 'finalizing',
) => ({
  stage,
  overallProgress,
  completedImages: Math.round(overallProgress * 120),
  totalImages: 120,
  audioProgress: stage === 'validating_assets' ? 0 : 0.5,
  currentTimeMs: Math.round(overallProgress * 2_000),
  totalTimeMs: 2_000,
});

const diagnostics = (): ExportRuntimeDiagnostics => ({
  elapsedMs: 1_000,
  phase: 'finalizing',
  validationMs: 10,
  assetLoadingMs: 20,
  outputSetupMs: 5,
  videoPipelineMs: 900,
  audioPipelineMs: null,
  muxFinalizationMs: 50,
  nativeFinalizationMs: null,
  decodeMs: 300,
  renderMs: 200,
  encoderBackpressureMs: 400,
  ipcWriteWaitMs: 25,
  encodedFps: 120,
  audioRealtimeSpeed: null,
  chunkCount: 1,
  bytesWritten: 3,
  videoCodec: 'vp9',
  audioCodec: null,
  inputVideoCodecs: ['vp9'],
  inputAudioCodecs: [],
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

let beginExport: ReturnType<typeof vi.fn>;
let writeExportChunk: ReturnType<typeof vi.fn>;
let finalizeExport: ReturnType<typeof vi.fn>;
let abortExport: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.startFailure = null;
  prepareExportCursorImages.mockReset().mockResolvedValue([]);
  environment.mockReset().mockResolvedValue({ platform: 'linux' });
  vi.stubGlobal('Worker', FakeWorker);
  beginExport = vi.fn().mockResolvedValue({ canceled: false, jobId: 'job-1' });
  writeExportChunk = vi.fn().mockResolvedValue(undefined);
  finalizeExport = vi.fn().mockResolvedValue({ path: '/tmp/worker.webm' });
  abortExport = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: { beginExport, writeExportChunk, finalizeExport, abortExport },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export worker client', () => {
  it('rejects already-cancelled requests and unavailable workers before preparing resources', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(exportWithMediabunny(request(), vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    vi.stubGlobal('Worker', undefined);
    await expect(exportWithMediabunny(request(), vi.fn(), new AbortController().signal)).rejects.toThrow(
      'Web Workers are unavailable',
    );
    expect(prepareExportCursorImages).not.toHaveBeenCalled();
  });
  it('closes prepared images when cancellation arrives before destination selection', async () => {
    const controller = new AbortController();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    prepareExportCursorImages.mockImplementationOnce(async () => {
      controller.abort();
      return [{ id: 'cursor', bitmap }];
    });
    await expect(exportWithMediabunny(request(), vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(beginExport).not.toHaveBeenCalled();
  });
  it('releases prepared images if the destination dialog fails or the desktop API is absent', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    prepareExportCursorImages.mockResolvedValue([{ id: 'cursor', bitmap }]);
    beginExport.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(exportWithMediabunny(request(), vi.fn(), new AbortController().signal)).rejects.toThrow(
      'dialog failed',
    );
    Object.defineProperty(window, 'capture', { configurable: true, value: undefined });
    await expect(exportWithMediabunny(request(), vi.fn(), new AbortController().signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(bitmap.close).toHaveBeenCalledTimes(2);
    expect(abortExport).not.toHaveBeenCalled();
  });
  it.each(['environment', 'started', 'cancel'] as const)(
    'aborts a reserved destination on %s failure before starting a worker',
    async (stage) => {
      const controller = new AbortController();
      const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
      prepareExportCursorImages.mockResolvedValue([{ id: 'cursor', bitmap }]);
      if (stage === 'environment') environment.mockRejectedValueOnce(new Error('environment failed'));
      const started = () => {
        if (stage === 'started') throw new Error('started failed');
        if (stage === 'cancel') controller.abort();
      };
      abortExport.mockRejectedValueOnce(new Error('cleanup failed'));
      await expect(exportWithMediabunny(request(), vi.fn(), controller.signal, started)).rejects.toThrow(
        stage === 'cancel' ? 'cancelled' : `${stage} failed`,
      );
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(abortExport).toHaveBeenCalledWith('job-1');
      expect(FakeWorker.instances).toHaveLength(0);
    },
  );
  it('dispatches an explicit Linux native request before creating any WebCodecs worker', async () => {
    const value = { ...request(), experimentalLinuxFfmpeg: true };
    const result = { path: '/tmp/native.mp4' };
    nativeExport.mockResolvedValueOnce(result);
    const progress = vi.fn(),
      started = vi.fn(),
      signal = new AbortController().signal;
    expect(await exportWithMediabunny(value, progress, signal, started)).toBe(result);
    expect(nativeExport).toHaveBeenCalledWith(value, progress, signal, started);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(prepareExportCursorImages).not.toHaveBeenCalled();
  });
  it.each(['webm', 'mp4'] as const)('prepares and transfers cursor bitmaps for %s', async (format) => {
    const defaultBitmap = { width: 144, height: 144, close: vi.fn() } as unknown as ImageBitmap;
    const pointerBitmap = { width: 72, height: 36, close: vi.fn() } as unknown as ImageBitmap;
    const value = { ...request(), format };
    prepareExportCursorImages.mockResolvedValueOnce([
      { id: 'default', bitmap: defaultBitmap },
      { id: 'pointer', bitmap: pointerBitmap },
    ]);

    const running = exportWithMediabunny(value, vi.fn(), new AbortController().signal);
    await flush();
    const worker = FakeWorker.instances[0]!;
    const startIndex = worker.posted.findIndex((message) => message.type === 'start');

    expect(prepareExportCursorImages).toHaveBeenCalledWith(value, expect.any(AbortSignal));
    expect(worker.posted[startIndex]).toMatchObject({
      type: 'start',
      request: expect.objectContaining({ format }),
      cursorImages: [
        { id: 'default', bitmap: defaultBitmap },
        { id: 'pointer', bitmap: pointerBitmap },
      ],
    });
    expect(worker.transfers[startIndex]).toEqual([defaultBitmap, pointerBitmap]);

    worker.emit({ type: 'complete', diagnostics: diagnostics() });
    await expect(running).resolves.toMatchObject({ format });
    expect(defaultBitmap.close).not.toHaveBeenCalled();
    expect(pointerBitmap.close).not.toHaveBeenCalled();
  });

  it('closes prepared cursor bitmaps when destination selection is cancelled', async () => {
    const bitmap = { width: 144, height: 144, close: vi.fn() } as unknown as ImageBitmap;
    prepareExportCursorImages.mockResolvedValueOnce([{ id: 'default', bitmap }]);
    beginExport.mockResolvedValueOnce({ canceled: true, jobId: 'job-cancelled' });

    await expect(exportWithMediabunny(request(), vi.fn(), new AbortController().signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('closes prepared cursor bitmaps and aborts native export when transfer posting fails', async () => {
    const bitmap = { width: 144, height: 144, close: vi.fn() } as unknown as ImageBitmap;
    prepareExportCursorImages.mockResolvedValueOnce([{ id: 'default', bitmap }]);
    FakeWorker.startFailure = new Error('cursor transfer failed');

    await expect(exportWithMediabunny(request(), vi.fn(), new AbortController().signal)).rejects.toThrow(
      'cursor transfer failed',
    );

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(abortExport).toHaveBeenCalledWith('job-1');
    expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledOnce();
  });

  it('propagates cancellation while cursor preparation is pending before opening a destination', async () => {
    const controller = new AbortController();
    let rejectPreparation!: (error: unknown) => void;
    prepareExportCursorImages.mockImplementationOnce(
      (_value: ExportRequest, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          rejectPreparation = reject;
          signal.addEventListener(
            'abort',
            () => rejectPreparation(new DOMException('Cursor image loading was cancelled.', 'AbortError')),
            { once: true },
          );
        }),
    );

    const running = exportWithMediabunny(request(), vi.fn(), controller.signal);
    await flush();
    controller.abort();

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(beginExport).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('forwards throttled worker progress and reports 100% only after native finalization', async () => {
    const reported: number[] = [];
    const running = exportWithMediabunny(
      request(),
      (value) => reported.push(value.overallProgress),
      new AbortController().signal,
    );
    await flush();
    const worker = FakeWorker.instances[0]!;

    worker.emit({ type: 'progress', progress: progress(0, 'validating_assets') });
    worker.emit({ type: 'progress', progress: progress(0.05, 'validating_assets') });
    worker.emit({ type: 'progress', progress: progress(0.08, 'loading_assets') });
    worker.emit({ type: 'progress', progress: progress(0.65, 'encoding') });
    worker.emit({ type: 'progress', progress: progress(0.98, 'finalizing') });
    await flush();

    expect(reported).toEqual([0, 0.05, 0.08, 0.65, 0.98]);
    expect(finalizeExport).not.toHaveBeenCalled();

    worker.emit({ type: 'complete', diagnostics: diagnostics() });
    await expect(running).resolves.toMatchObject({ path: '/tmp/worker.webm', format: 'webm' });
    expect(finalizeExport).toHaveBeenCalledWith('job-1');
    expect(reported.at(-1)).toBe(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('waits for the disk write before acknowledging each muxed chunk', async () => {
    let resolveWrite!: () => void;
    writeExportChunk.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const running = exportWithMediabunny(request(), vi.fn(), new AbortController().signal);
    await flush();
    const worker = FakeWorker.instances[0]!;
    const data = new Uint8Array([1, 2, 3]);

    worker.emit({ type: 'chunk', sequence: 0, position: 4096, data });
    await flush();
    expect(writeExportChunk).toHaveBeenCalledWith({ jobId: 'job-1', sequence: 0, position: 4096, data });
    expect(worker.posted).not.toContainEqual({ type: 'chunkAck', sequence: 0 });

    resolveWrite();
    await flush();
    expect(worker.posted).toContainEqual({ type: 'chunkAck', sequence: 0 });

    worker.emit({ type: 'complete', diagnostics: diagnostics() });
    await expect(running).resolves.toMatchObject({ path: '/tmp/worker.webm' });
  });

  it('sends chunkError and aborts the native partial file when IPC writing fails', async () => {
    writeExportChunk.mockRejectedValueOnce(new Error('disk full'));
    const running = exportWithMediabunny(request(), vi.fn(), new AbortController().signal);
    await flush();
    const worker = FakeWorker.instances[0]!;
    worker.emit({ type: 'chunk', sequence: 3, position: 0, data: new Uint8Array([7]) });

    await expect(running).rejects.toThrow('disk full');
    expect(worker.posted).toContainEqual({ type: 'chunkError', sequence: 3, message: 'disk full' });
    expect(abortExport).toHaveBeenCalledWith('job-1');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('waits for worker disposal before aborting native export and terminating', async () => {
    const controller = new AbortController();
    const running = exportWithMediabunny(request(), vi.fn(), controller.signal);
    await flush();
    const worker = FakeWorker.instances[0]!;
    let settled = false;
    void running.catch(() => {
      settled = true;
    });

    controller.abort();
    await flush();

    expect(worker.posted).toContainEqual({ type: 'cancel' });
    expect(settled).toBe(false);
    expect(abortExport).not.toHaveBeenCalled();
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit({ type: 'disposed' } as unknown as ExportWorkerResponse);

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortExport).toHaveBeenCalledWith('job-1');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
