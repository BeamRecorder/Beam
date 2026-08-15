import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWhisperTranscription } from '../useWhisperTranscription';
import type { WhisperResult } from '../whisper-types';

type WorkerMode = 'result' | 'stream' | 'error' | 'crash';

const workerState = vi.hoisted(() => ({
  mode: 'result' as WorkerMode,
  instances: [] as FakeWorker[],
}));

class FakeWorker {
  messages: unknown[] = [];
  terminated = false;
  private listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener = vi.fn((type: string, listener: (event: Event) => void) => {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });

  removeEventListener = vi.fn((type: string, listener: (event: Event) => void) => {
    this.listeners.get(type)?.delete(listener);
  });

  terminate = vi.fn(() => {
    this.terminated = true;
  });

  private emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent);
  }

  postMessage = vi.fn((message: { id: string }) => {
    this.messages.push(message);
    this.emit('message', {
      id: 'other-request',
      type: 'progress',
      status: 'running',
      message: 'ignored',
      progress: 0.1,
    });
    if (workerState.mode === 'crash') {
      for (const listener of this.listeners.get('error') ?? []) listener({ message: 'Worker exploded' } as ErrorEvent);
      return;
    }
    if (workerState.mode === 'error') {
      this.emit('message', { id: message.id, type: 'error', message: 'Whisper failed' });
      return;
    }
    this.emit('message', {
      id: message.id,
      type: 'diagnostics',
      diagnostics: {
        backend: 'wasm',
        wasmThreads: 1,
        modelLoadMs: 12,
        inferenceMs: 34,
        totalChunks: workerState.mode === 'stream' ? 2 : 1,
      },
    });
    this.emit('message', {
      id: message.id,
      type: 'progress',
      status: 'running',
      message: 'Working',
      progress: 50,
    });
    if (workerState.mode === 'stream') {
      this.emit('message', {
        id: message.id,
        type: 'partial',
        words: [{ text: 'Hello', startMs: 0, endMs: 200 }],
      });
      this.emit('message', {
        id: message.id,
        type: 'partial',
        words: [{ text: 'world.', startMs: 210, endMs: 500 }],
      });
      this.emit('message', {
        id: message.id,
        type: 'result',
        words: [
          { text: 'Hello', startMs: 0, endMs: 200 },
          { text: 'world.', startMs: 210, endMs: 500 },
        ],
      });
      return;
    }
    this.emit('message', {
      id: message.id,
      type: 'result',
      words: [
        { text: 'Hello', startMs: 0, endMs: 200 },
        { text: 'world.', startMs: 210, endMs: 500 },
      ],
    });
  });

  constructor() {
    workerState.instances.push(this);
  }
}

class FakeAudioContext {
  decodeAudioData = vi.fn(async () => ({ duration: 2 }));
  close = vi.fn(async () => undefined);
}

class FakeOfflineAudioContext {
  readonly destination = {};
  readonly length: number;
  createBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
  }));

  constructor(_channels: number, length: number, _sampleRate: number) {
    this.length = length;
  }

  startRendering = vi.fn(async () => ({
    length: this.length,
    copyFromChannel: (target: Float32Array) => {
      target.fill(0.1);
    },
  }));
}

const words = [
  { text: 'Hello', startMs: 0, endMs: 200 },
  { text: 'world.', startMs: 210, endMs: 500 },
];

const mountApi = () => {
  let api!: ReturnType<typeof useWhisperTranscription>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useWhisperTranscription();
        return () => null;
      },
    }),
  );
  return { api, wrapper };
};

describe('useWhisperTranscription composable', () => {
  beforeEach(() => {
    workerState.mode = 'result';
    workerState.instances.length = 0;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records audio preparation and worker diagnostics while completing with 100% progress', async () => {
    const { api, wrapper } = mountApi();
    const result = await api.transcribe('audio.wav', 'Xenova/whisper-tiny', 1_000);

    expect(result.words).toEqual(words);
    expect(result.sentences[0]).toMatchObject({ text: 'Hello world.', startMs: 0, endMs: 500 });
    expect(api.progress.value).toMatchObject({ status: 'completed', progress: 100 });
    expect(api.diagnostics.value).toMatchObject({
      status: 'completed',
      model: 'Xenova/whisper-tiny',
      audioDurationMs: 1_000,
      sampleRate: 16_000,
      sampleCount: 16_000,
      pcmBytes: 64_000,
      backend: 'wasm',
      wasmThreads: 1,
      modelLoadMs: 12,
      inferenceMs: 34,
      totalChunks: 1,
      wordCount: 2,
      sentenceCount: 1,
    });
    expect(api.diagnostics.value!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(workerState.instances[0]!.messages[0]).toEqual(
      expect.objectContaining({ model: 'Xenova/whisper-tiny', sampleRate: 16_000, locale: expect.any(String) }),
    );

    wrapper.unmount();
    expect(workerState.instances[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('accumulates delta partials and preserves sentence identity', async () => {
    workerState.mode = 'stream';
    const { api, wrapper } = mountApi();
    const partials: WhisperResult[] = [];
    const result = await api.transcribe('audio.wav', 'Xenova/whisper-tiny', undefined, (partial) =>
      partials.push(partial),
    );

    expect(partials).toHaveLength(2);
    expect(partials.map((partial) => partial.words.map((word) => word.text))).toEqual([['Hello'], ['Hello', 'world.']]);
    expect(partials[0]!.sentences[0]!.id).toBe(partials[1]!.sentences[0]!.id);
    expect(partials[1]!.sentences[0]!.id).toBe(result.sentences[0]!.id);
    expect(result.words).toEqual(words);
    wrapper.unmount();
  });

  it('rejects a crashed worker and exposes failed diagnostics', async () => {
    workerState.mode = 'crash';
    const { api, wrapper } = mountApi();

    await expect(api.transcribe('audio.wav', 'Xenova/whisper-tiny')).rejects.toThrow('Worker exploded');
    expect(api.progress.value).toMatchObject({ status: 'error', message: 'Worker exploded' });
    expect(api.diagnostics.value).toMatchObject({ status: 'failed', error: 'Worker exploded' });
    wrapper.unmount();
  });

  it('reports preparation failures before creating a worker', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { api, wrapper } = mountApi();

    await expect(api.transcribe('missing.wav', 'Xenova/whisper-tiny')).rejects.toThrow(
      'Unable to read selected audio source.',
    );
    expect(workerState.instances).toHaveLength(0);
    expect(api.diagnostics.value).toMatchObject({ status: 'failed', error: 'Unable to read selected audio source.' });
    wrapper.unmount();
  });
});
