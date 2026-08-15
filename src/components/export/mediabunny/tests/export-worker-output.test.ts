import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportRequest } from '../../export-types';
import { isExportWorkerResponse } from '../export-worker-protocol';

const runtime = vi.hoisted(() => ({
  videoCodec: vi.fn(),
  canEncodeVideo: vi.fn(),
  audioCodec: vi.fn(),
  registerAacEncoder: vi.fn(),
  aacRegistered: false,
  stream: null as WritableStream<{ data: Uint8Array; position: number }> | null,
  targetOptions: null as Record<string, unknown> | null,
  outputOptions: null as Record<string, unknown> | null,
  videoOptions: null as Record<string, unknown> | null,
  audioOptions: null as Record<string, unknown> | null,
  posted: [] as Array<{ message: Record<string, unknown>; transfer?: Transferable[] }>,
}));

vi.mock('mediabunny', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mediabunny')>();

  class FakeStreamTarget {
    constructor(stream: WritableStream<{ data: Uint8Array; position: number }>, options: Record<string, unknown>) {
      runtime.stream = stream;
      runtime.targetOptions = options;
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
    canEncodeVideo: runtime.canEncodeVideo,
    StreamTarget: FakeStreamTarget,
    Output: FakeOutput,
    CanvasSource: FakeCanvasSource,
    AudioSampleSource: FakeAudioSampleSource,
    WebMOutputFormat: class FakeWebMOutputFormat {},
    Mp4OutputFormat: class FakeMp4OutputFormat {},
  };
});

vi.mock('@mediabunny/aac-encoder', () => ({ registerAacEncoder: runtime.registerAacEncoder }));

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
    runtime.canEncodeVideo.mockReset().mockResolvedValue(true);
    runtime.audioCodec.mockReset().mockResolvedValue('opus');
    runtime.registerAacEncoder.mockReset().mockImplementation(() => {
      runtime.aacRegistered = true;
    });
    runtime.aacRegistered = false;
    runtime.stream = null;
    runtime.targetOptions = null;
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

  it.each([
    { supported: true, expected: 'prefer-hardware' as const },
    { supported: false, expected: 'no-preference' as const },
  ])('selects $expected only when hardware encoding is supported', async ({ supported, expected }) => {
    runtime.canEncodeVideo.mockResolvedValueOnce(supported);
    const { ExportWorkerOutput } = await import('../export-worker-output');
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, true);

    expect(runtime.videoCodec).toHaveBeenCalledOnce();
    expect(runtime.canEncodeVideo).toHaveBeenCalledWith(
      'vp9',
      expect.objectContaining({ hardwareAcceleration: 'prefer-hardware' }),
    );
    expect(runtime.audioCodec).toHaveBeenCalledOnce();
    expect(runtime.videoOptions).toMatchObject({ codec: 'vp9' });
    expect(runtime.videoOptions).not.toHaveProperty('latencyMode');
    expect(runtime.videoOptions).not.toHaveProperty('contentHint');
    if (supported) expect(runtime.videoOptions).toHaveProperty('hardwareAcceleration', 'prefer-hardware');
    else expect(runtime.videoOptions).not.toHaveProperty('hardwareAcceleration');
    expect(runtime.audioOptions).toMatchObject({ codec: 'opus' });
    expect(runtime.targetOptions).toEqual({ chunked: true, chunkSize: 16 * 1024 * 1024 });
    expect(runtime.stream).not.toBeNull();

    const onEncoderConfig = runtime.videoOptions?.onEncoderConfig as (config: {
      codec: string;
      bitrate?: number;
    }) => void;
    const onEncodedPacket = runtime.videoOptions?.onEncodedPacket as (packet: {
      type: string;
      byteLength: number;
    }) => void;
    onEncoderConfig({ codec: 'vp9', bitrate: 5_500_000 });
    onEncodedPacket({ type: 'key', byteLength: 123 });
    onEncodedPacket({ type: 'delta', byteLength: 77 });

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
      audioEncoderImplementation: 'webcodecs',
      chunkCount: 2,
      bytesWritten: 5,
      ipcWriteWaitMs: 60,
      hardwareAcceleration: expected,
      encoderCodec: 'vp9',
      encoderBitrate: 5_500_000,
      encodedPacketCount: 2,
      keyFrameCount: 1,
      encodedVideoBytes: 200,
    });
  });

  it('accepts the worker disposal acknowledgement response', () => {
    expect(isExportWorkerResponse({ type: 'disposed' })).toBe(true);
  });

  it('registers and re-probes the AAC extension when native AAC is unavailable', async () => {
    runtime.audioCodec.mockImplementation(() => (runtime.aacRegistered ? 'aac' : null));
    const { ExportWorkerOutput } = await import('../export-worker-output');

    const output = await ExportWorkerOutput.create(request('mp4'), { width: 16, height: 16 } as OffscreenCanvas, true);

    expect(runtime.registerAacEncoder).toHaveBeenCalledOnce();
    expect(runtime.audioCodec).toHaveBeenCalledTimes(2);
    expect(runtime.audioOptions).toMatchObject({ codec: 'aac' });
    expect(output.diagnostics()).toMatchObject({ audioCodec: 'aac', audioEncoderImplementation: 'mediabunny-aac' });
  });

  it('keeps native AAC without registering the WASM extension when it is available', async () => {
    runtime.audioCodec.mockResolvedValue('aac');
    const { ExportWorkerOutput } = await import('../export-worker-output');

    const output = await ExportWorkerOutput.create(request('mp4'), { width: 16, height: 16 } as OffscreenCanvas, true);

    expect(runtime.audioCodec).toHaveBeenCalledOnce();
    expect(runtime.registerAacEncoder).not.toHaveBeenCalled();
    expect(output.diagnostics()).toMatchObject({ audioCodec: 'aac', audioEncoderImplementation: 'webcodecs' });
  });

  it('fails explicitly when AAC remains unavailable after extension registration', async () => {
    runtime.audioCodec.mockResolvedValue(null);
    const { ExportWorkerOutput } = await import('../export-worker-output');

    await expect(
      ExportWorkerOutput.create(request('mp4'), { width: 16, height: 16 } as OffscreenCanvas, true),
    ).rejects.toThrow('MP4 audio is not encodable on this device.');
    expect(runtime.registerAacEncoder).toHaveBeenCalledOnce();
    expect(runtime.audioCodec).toHaveBeenCalledTimes(2);
  });
});
