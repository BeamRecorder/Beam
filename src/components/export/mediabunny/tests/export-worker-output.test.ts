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
  outputStart: vi.fn(),
  outputFinalize: vi.fn(),
  outputCancel: vi.fn(),
  videoAdd: vi.fn(),
  videoClose: vi.fn(),
  audioAdd: vi.fn(),
  audioClose: vi.fn(),
  audioAddReject: null as Error | null,
  videoTrackAdded: 0,
  audioTrackAdded: 0,
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

    addVideoTrack() {
      runtime.videoTrackAdded += 1;
    }
    addAudioTrack() {
      runtime.audioTrackAdded += 1;
    }
    start() {
      runtime.outputStart();
      return Promise.resolve();
    }
    finalize() {
      runtime.outputFinalize();
      return Promise.resolve();
    }
    cancel() {
      runtime.outputCancel();
      return Promise.resolve();
    }
  }

  class FakeCanvasSource {
    constructor(_canvas: OffscreenCanvas, options: Record<string, unknown>) {
      runtime.videoOptions = options;
    }

    add(timestamp: number, duration: number) {
      runtime.videoAdd(timestamp, duration);
      return Promise.resolve();
    }
    close() {
      runtime.videoClose();
    }
  }

  class FakeAudioSampleSource {
    constructor(options: Record<string, unknown>) {
      runtime.audioOptions = options;
    }

    add(sample: unknown) {
      runtime.audioAdd(sample);
      const error = runtime.audioAddReject;
      return error ? Promise.reject(error) : Promise.resolve();
    }
    close() {
      runtime.audioClose();
    }
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
    runtime.outputStart.mockReset();
    runtime.outputFinalize.mockReset();
    runtime.outputCancel.mockReset();
    runtime.videoAdd.mockReset();
    runtime.videoClose.mockReset();
    runtime.audioAdd.mockReset();
    runtime.audioClose.mockReset();
    runtime.audioAddReject = null;
    runtime.videoTrackAdded = 0;
    runtime.audioTrackAdded = 0;
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
  ])('selects $expected for WebM when hardware encoding support is $supported', async ({ supported, expected }) => {
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
    onEncoderConfig({ codec: 'vp9' });
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

  it('keeps the StreamTarget source buffer usable when a chunk is transferred', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn((message: Record<string, unknown>, options?: { transfer?: Transferable[] }) => {
        // Capture the receiver's clone before detaching the sender's transfer list.
        const receivedMessage = structuredClone(message);
        runtime.posted.push({ message: receivedMessage, transfer: options?.transfer });
        for (const transferable of options?.transfer ?? []) {
          if (transferable instanceof ArrayBuffer) structuredClone(transferable, { transfer: [transferable] });
        }
      }),
    });
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, false);
    const writer = runtime.stream!.getWriter();
    const sourceBuffer = new ArrayBuffer(8);
    const sourceData = new Uint8Array(sourceBuffer, 2, 4);
    const expected = [11, 22, 33, 44];
    sourceData.set(expected);

    const write = writer.write({ data: sourceData, position: 32 });
    await flush();

    const postedData = runtime.posted[0]?.message.data as Uint8Array;
    expect(Array.from(postedData)).toEqual(expected);
    expect(sourceData.byteLength).toBe(expected.length);
    expect(sourceBuffer.byteLength).toBe(8);
    expect(Array.from(new Uint8Array(sourceBuffer, 2, expected.length))).toEqual(expected);

    output.acknowledge(0);
    await write;
    await writer.releaseLock();
  });

  it('forwards lifecycle operations and closes encoded sources', async () => {
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, true);
    const sample = { close: vi.fn() } as unknown as import('mediabunny').AudioSample;

    await output.start();
    await output.addVideo(250, 500);
    await output.addAudio(sample);
    output.closeAudio();
    output.closeVideo();
    await output.finalize();

    expect(runtime.outputStart).toHaveBeenCalledOnce();
    expect(runtime.videoAdd).toHaveBeenCalledWith(250, 500);
    expect(runtime.audioAdd).toHaveBeenCalledWith(sample);
    expect(sample.close).toHaveBeenCalledOnce();
    expect(runtime.audioClose).toHaveBeenCalledOnce();
    expect(runtime.videoClose).toHaveBeenCalledOnce();
    expect(runtime.outputFinalize).toHaveBeenCalledOnce();
    expect(runtime.videoTrackAdded).toBe(1);
    expect(runtime.audioTrackAdded).toBe(1);
  });

  it('closes an audio sample immediately when no audio track was selected', async () => {
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, false);
    const sample = { close: vi.fn() } as unknown as import('mediabunny').AudioSample;

    await output.addAudio(sample);
    output.closeAudio();

    expect(sample.close).toHaveBeenCalledOnce();
    expect(runtime.audioAdd).not.toHaveBeenCalled();
    expect(runtime.audioClose).not.toHaveBeenCalled();
    expect(runtime.audioTrackAdded).toBe(0);
  });

  it('closes an audio sample when encoding it fails', async () => {
    runtime.audioAddReject = new Error('audio source failed');
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, true);
    const sample = { close: vi.fn() } as unknown as import('mediabunny').AudioSample;

    await expect(output.addAudio(sample)).rejects.toThrow('audio source failed');

    expect(runtime.audioAdd).toHaveBeenCalledWith(sample);
    expect(sample.close).toHaveBeenCalledOnce();
  });

  it('reports when no video codec is available', async () => {
    runtime.videoCodec.mockResolvedValueOnce(null);
    const { ExportWorkerOutput } = await import('../export-worker-output');

    await expect(
      ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, false),
    ).rejects.toThrow('WEBM video is not encodable on this device.');
    expect(runtime.canEncodeVideo).not.toHaveBeenCalled();
  });

  it('reports unavailable WebM audio without attempting the AAC extension fallback', async () => {
    runtime.audioCodec.mockResolvedValue(null);
    const { ExportWorkerOutput } = await import('../export-worker-output');

    await expect(
      ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, true),
    ).rejects.toThrow('WEBM audio is not encodable on this device.');
    expect(runtime.registerAacEncoder).not.toHaveBeenCalled();
  });

  it('rejects failed chunks and ignores acknowledgements for unknown sequences', async () => {
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, false);
    const writer = runtime.stream!.getWriter();
    const write = writer.write({ data: new Uint8Array([6]), position: 12 });
    await flush();

    output.acknowledge(999);
    output.reject(0, 'disk write failed');
    await expect(write).rejects.toThrow('disk write failed');
    output.reject(999, 'ignored');
    await writer.releaseLock();
  });

  it('cancels pending chunks once and rejects their writes with AbortError', async () => {
    const { ExportWorkerOutput } = await import('../export-worker-output');
    const output = await ExportWorkerOutput.create(request(), { width: 16, height: 16 } as OffscreenCanvas, false);
    const writer = runtime.stream!.getWriter();
    const write = writer.write({ data: new Uint8Array([7]), position: 14 });
    await flush();

    const firstCancel = output.cancel();
    const secondCancel = output.cancel();
    expect(secondCancel).toBe(firstCancel);
    await firstCancel;
    await expect(write).rejects.toMatchObject({ name: 'AbortError', message: 'Export cancelled.' });
    expect(runtime.outputCancel).toHaveBeenCalledOnce();
    await writer.releaseLock();
  });

  it('keeps MP4 AVC on the default hardware preference', async () => {
    runtime.videoCodec.mockResolvedValueOnce('avc');
    const { ExportWorkerOutput } = await import('../export-worker-output');

    const output = await ExportWorkerOutput.create(request('mp4'), { width: 16, height: 16 } as OffscreenCanvas, false);

    expect(runtime.canEncodeVideo).not.toHaveBeenCalled();
    expect(runtime.videoOptions).toMatchObject({ codec: 'avc' });
    expect(runtime.videoOptions).not.toHaveProperty('hardwareAcceleration');
    expect(output.diagnostics()).toMatchObject({
      videoCodec: 'avc',
      hardwareAcceleration: 'no-preference',
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
