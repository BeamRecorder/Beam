import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportRequest } from '../../export-types';

const runtime = vi.hoisted(() => ({
  videoCodec: vi.fn(),
  audioCodec: vi.fn(),
  stream: null as WritableStream<{ data: Uint8Array; position: number }> | null,
  outputOptions: null as Record<string, unknown> | null,
  videoOptions: null as Record<string, unknown> | null,
  audioOptions: null as Record<string, unknown> | null,
  posted: [] as Array<{ message: Record<string, unknown>; transfer?: Transferable[] }>,
}));

vi.mock('mediabunny', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mediabunny')>();

  class FakeStreamTarget {
    constructor(stream: WritableStream<{ data: Uint8Array; position: number }>) {
      runtime.stream = stream;
    }
  }

  class FakeOutput {
    constructor(options: Record<string, unknown>) {
      runtime.outputOptions = options;
    }

    addVideoTrack() {}
    addAudioTrack() {}
    start() {
      return Promise.resolve();
    }
    finalize() {
      return Promise.resolve();
    }
    cancel() {
      return Promise.resolve();
    }
  }

  class FakeCanvasSource {
    constructor(_canvas: OffscreenCanvas, options: Record<string, unknown>) {
      runtime.videoOptions = options;
    }

    add() {
      return Promise.resolve();
    }
    close() {}
  }

  class FakeAudioSampleSource {
    constructor(options: Record<string, unknown>) {
      runtime.audioOptions = options;
    }

    add() {
      return Promise.resolve();
    }
    close() {}
  }

  return {
    ...actual,
    getFirstEncodableVideoCodec: runtime.videoCodec,
    getFirstEncodableAudioCodec: runtime.audioCodec,
    StreamTarget: FakeStreamTarget,
    Output: FakeOutput,
    CanvasSource: FakeCanvasSource,
    AudioSampleSource: FakeAudioSampleSource,
    WebMOutputFormat: class FakeWebMOutputFormat {},
    Mp4OutputFormat: class FakeMp4OutputFormat {},
  };
});

const request = (format: ExportRequest['format'] = 'webm') =>
  ({
    projectName: 'Output test',
    format,
    preset: 'medium',
    snapshot: {
      duration: 1,
      render: { fps: 30, sourceWidth: null, sourceHeight: null },
      canvas: { width: 16, height: 16 },
      composition: { assets: [], clips: [] },
    },
  }) as unknown as ExportRequest;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('ExportWorkerOutput diagnostics and IPC backpressure', () => {
  beforeEach(() => {
    runtime.videoCodec.mockReset().mockResolvedValue('vp9');
    runtime.audioCodec.mockReset().mockResolvedValue('opus');
    runtime.stream = null;
    runtime.outputOptions = null;
    runtime.videoOptions = null;
    runtime.audioOptions = null;
    runtime.posted = [];
    vi.stubGlobal('self', {
      postMessage: vi.fn((message: Record<string, unknown>, options?: { transfer?: Transferable[] }) => {
        runtime.posted.push({ message, transfer: options?.transfer });
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports selected codecs, byte/chunk totals, and increasing ACK wait time', async () => {
    const { ExportWorkerOutput } = await import('../export-worker-output');
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, true);

    expect(runtime.videoCodec).toHaveBeenCalledOnce();
    expect(runtime.audioCodec).toHaveBeenCalledOnce();
    expect(runtime.videoOptions).toMatchObject({ codec: 'vp9' });
    expect(runtime.audioOptions).toMatchObject({ codec: 'opus' });
    expect(runtime.stream).not.toBeNull();

    const writer = runtime.stream!.getWriter();
    let firstSettled = false;
    const firstWrite = writer.write({ data: new Uint8Array([1, 2, 3]), position: 10 });
    firstWrite.then(() => {
      firstSettled = true;
    });
    await flush();

    expect(firstSettled).toBe(false);
    expect(runtime.posted[0]?.message).toMatchObject({ type: 'chunk', sequence: 0, position: 10 });

    now = 110;
    output.acknowledge(0);
    await firstWrite;

    const secondWrite = writer.write({ data: new Uint8Array([4, 5]), position: 20 });
    await flush();
    expect(runtime.posted[1]?.message).toMatchObject({ type: 'chunk', sequence: 1, position: 20 });

    now = 160;
    output.acknowledge(1);
    await secondWrite;
    await writer.releaseLock();

    expect(output.diagnostics()).toEqual({
      videoCodec: 'vp9',
      audioCodec: 'opus',
      chunkCount: 2,
      bytesWritten: 5,
      ipcWriteWaitMs: 60,
    });
  });
});
