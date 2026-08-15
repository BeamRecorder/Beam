import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhisperWorkerEvent } from '../whisper-worker-protocol';

const runtime = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: {
    version: 'test-transformers',
    backends: { onnx: { webgpu: {} as Record<string, unknown>, wasm: {} as Record<string, unknown> } },
  } as Record<string, any>,
}));

vi.mock('@huggingface/transformers', () => ({ env: runtime.env, pipeline: runtime.pipeline }));

type WorkerSelf = {
  onmessage?: (event: MessageEvent<unknown>) => void | Promise<void>;
  postMessage: ReturnType<typeof vi.fn>;
};

let workerSelf: WorkerSelf;

beforeEach(async () => {
  vi.resetModules();
  runtime.pipeline.mockReset();
  runtime.env.version = 'test-transformers';
  runtime.env.backends = { onnx: { webgpu: {}, wasm: {} } };
  workerSelf = { onmessage: undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', workerSelf);
  vi.stubGlobal('navigator', {
    gpu: undefined,
    hardwareConcurrency: 8,
    userAgent: 'Beam test browser',
  });
  vi.stubGlobal('crossOriginIsolated', false);
  await import('../whisper.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (message: unknown) => workerSelf.onmessage!({ data: message } as MessageEvent<unknown>);
const messages = () => workerSelf.postMessage.mock.calls.map(([message]) => message as WhisperWorkerEvent);

describe('whisper worker', () => {
  it('uses 30-second windows with 5-second overlap and emits partial deltas', async () => {
    const transcriber = vi
      .fn()
      .mockResolvedValueOnce({ chunks: [{ text: ' first', timestamp: [1, 2] }] })
      // This word is inside the left context and must be discarded.
      .mockResolvedValueOnce({
        chunks: [
          { text: ' duplicate', timestamp: [1, 2] },
          { text: ' second', timestamp: [10, 11] },
        ],
      })
      .mockResolvedValueOnce({ chunks: [{ text: ' third', timestamp: [5, 6] }] });
    runtime.pipeline.mockResolvedValue(transcriber);

    await send({
      type: 'transcribe',
      id: 'request-1',
      model: 'Xenova/whisper-tiny',
      audio: new Float32Array(65),
      sampleRate: 1,
      locale: 'fr-FR',
    });

    expect(runtime.pipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      expect.objectContaining({ device: 'wasm', dtype: 'q8' }),
    );
    expect(transcriber).toHaveBeenCalledTimes(3);
    expect(transcriber.mock.calls.map(([audio]) => audio.length)).toEqual([30, 30, 25]);
    expect(transcriber.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ sampling_rate: 1, return_timestamps: 'word', language: 'french', task: 'transcribe' }),
    );

    const emitted = messages();
    expect(emitted.filter((event) => event.type === 'partial')).toEqual([
      { type: 'partial', id: 'request-1', words: [{ text: 'first', startMs: 1_000, endMs: 2_000 }] },
      { type: 'partial', id: 'request-1', words: [{ text: 'second', startMs: 30_000, endMs: 31_000 }] },
      { type: 'partial', id: 'request-1', words: [{ text: 'third', startMs: 45_000, endMs: 46_000 }] },
    ]);
    expect(emitted.at(-1)).toEqual({
      type: 'result',
      id: 'request-1',
      words: [
        { text: 'first', startMs: 1_000, endMs: 2_000 },
        { text: 'second', startMs: 30_000, endMs: 31_000 },
        { text: 'third', startMs: 45_000, endMs: 46_000 },
      ],
    });

    const diagnostics = emitted.filter((event) => event.type === 'diagnostics');
    expect(diagnostics[0]).toMatchObject({
      type: 'diagnostics',
      id: 'request-1',
      diagnostics: {
        backend: 'wasm',
        wasmThreads: 1,
        chunkLengthSeconds: 30,
        strideLengthSeconds: 5,
      },
    });
    expect(
      diagnostics.find(
        (event) =>
          event.type === 'diagnostics' &&
          event.diagnostics.status === 'completed' &&
          event.diagnostics.completedChunks === 3,
      ),
    ).toMatchObject({
      type: 'diagnostics',
      diagnostics: {
        status: 'completed',
        completedChunks: 3,
        totalChunks: 3,
        processedAudioMs: 65_000,
        wordCount: 3,
      },
    });
    expect(emitted.filter((event) => event.type === 'progress').at(-1)).toMatchObject({ progress: 100 });
  });

  it('selects WebGPU when an adapter is available and exposes its diagnostics', async () => {
    const adapter = {
      info: { vendor: 'test-vendor', architecture: 'test-arch', device: 'test-device', description: 'Test GPU' },
      features: new Set(['timestamp-query']),
      limits: {
        maxBufferSize: 1,
        maxComputeInvocationsPerWorkgroup: 2,
        maxComputeWorkgroupStorageSize: 3,
        maxStorageBufferBindingSize: 4,
      },
    } as unknown as GPUAdapter;
    const requestAdapter = vi.fn().mockResolvedValue(adapter);
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter },
      hardwareConcurrency: 12,
      userAgent: 'Beam WebGPU test',
    });
    vi.stubGlobal('crossOriginIsolated', true);
    const transcriber = vi.fn().mockResolvedValue({ chunks: [] });
    runtime.pipeline.mockResolvedValue(transcriber);

    await send({
      type: 'transcribe',
      id: 'gpu-request',
      model: 'Xenova/whisper-tiny.en',
      audio: new Float32Array(1),
      sampleRate: 1,
      locale: 'en',
    });

    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
    expect(runtime.env.backends.onnx.webgpu.adapter).toBe(adapter);
    expect(runtime.pipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      expect.objectContaining({ device: 'webgpu', dtype: 'q8' }),
    );
    expect(messages().find((event) => event.type === 'diagnostics')).toMatchObject({
      diagnostics: {
        backend: 'webgpu',
        gpu: {
          vendor: 'test-vendor',
          architecture: 'test-arch',
          device: 'test-device',
          features: ['timestamp-query'],
        },
        wasmThreads: null,
      },
    });
    expect(transcriber.mock.calls[0]?.[1]).not.toHaveProperty('language');
  });
});
