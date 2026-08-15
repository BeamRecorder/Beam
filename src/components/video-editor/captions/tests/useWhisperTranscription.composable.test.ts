import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWhisperTranscription } from '../useWhisperTranscription';
import type { WhisperResult } from '../whisper-types';

const workerState = vi.hoisted(() => ({
  mode: 'result' as 'result' | 'error' | 'stream',
  instances: [] as FakeWorker[],
  partialWords: [] as Array<Array<{ text: string; startMs: number; endMs: number }>>,
}));

class FakeWorker {
  messages: unknown[] = [];
  terminated = false;
  private listener?: (event: MessageEvent) => void;
  addEventListener = vi.fn((_type: string, listener: (event: MessageEvent) => void) => {
    this.listener = listener;
  });
  removeEventListener = vi.fn(() => undefined);
  terminate = vi.fn(() => {
    this.terminated = true;
  });
  postMessage = vi.fn((message: { id: string }) => {
    this.messages.push(message);
    this.listener?.({
      data: {
        id: 'other-request',
        type: 'progress',
        status: 'transcribing',
        message: 'ignored',
        progress: 0.1,
      },
    } as MessageEvent);
    if (workerState.mode === 'stream') {
      this.listener?.({
        data: {
          id: 'other-request',
          type: 'partial',
          words: [{ text: 'foreign', startMs: 0, endMs: 100 }],
        },
      } as MessageEvent);
      this.listener?.({
        data: {
          id: 'other-request',
          type: 'result',
          words: [{ text: 'foreign.', startMs: 0, endMs: 100 }],
        },
      } as MessageEvent);
      for (const partialWords of workerState.partialWords) {
        this.listener?.({ data: { id: message.id, type: 'partial', words: partialWords } } as MessageEvent);
      }
      this.listener?.({
        data: { id: message.id, type: 'result', words: workerState.partialWords.at(-1) ?? [] },
      } as MessageEvent);
      return;
    }
    if (workerState.mode === 'error') {
      this.listener?.({
        data: { id: message.id, type: 'error', message: 'Whisper failed' },
      } as MessageEvent);
      return;
    }
    this.listener?.({
      data: {
        id: message.id,
        type: 'progress',
        status: 'transcribing',
        message: 'Working',
        progress: 0.5,
      },
    } as MessageEvent);
    this.listener?.({
      data: {
        id: message.id,
        type: 'result',
        words: [
          { text: 'Hello', startMs: 0, endMs: 200 },
          { text: 'world.', startMs: 210, endMs: 500 },
        ],
      },
    } as MessageEvent);
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
  readonly args: [number, number, number];
  createBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
  }));
  startRendering = vi.fn(async () => ({
    getChannelData: () => new Float32Array([0.1, 0.2, 0.3]),
  }));
  constructor(channels: number, length: number, sampleRate: number) {
    this.args = [channels, length, sampleRate];
  }
}

const words = [
  { text: 'Hello', startMs: 0, endMs: 200 },
  { text: 'world.', startMs: 210, endMs: 500 },
];

describe('useWhisperTranscription composable', () => {
  beforeEach(() => {
    workerState.mode = 'result';
    workerState.instances.length = 0;
    workerState.partialWords = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes audio, reports progress, returns sentences and terminates the worker', async () => {
    let api!: ReturnType<typeof useWhisperTranscription>;
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useWhisperTranscription();
          return () => null;
        },
      }),
    );
    const result = await api.transcribe('audio.wav', 'Xenova/whisper-tiny', 1_000);
    await flushPromises();

    expect(result.words).toEqual(words);
    expect(result.sentences[0]).toMatchObject({
      text: 'Hello world.',
      startMs: 0,
      endMs: 500,
    });
    expect(api.progress.value).toEqual({ status: 'idle', message: '' });
    expect(workerState.instances[0]!.messages[0]).toEqual(
      expect.objectContaining({
        model: 'Xenova/whisper-tiny',
        locale: expect.any(String),
        sampleRate: 16_000,
      }),
    );
    expect((workerState.instances[0]!.messages[0] as { audio: Float32Array }).audio).toBeInstanceOf(Float32Array);
    expect(workerState.instances[0]).toBeDefined();
    wrapper.unmount();
    expect(workerState.instances[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('uses the full source duration when no limit is supplied', async () => {
    let api!: ReturnType<typeof useWhisperTranscription>;
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useWhisperTranscription();
          return () => null;
        },
      }),
    );
    await api.transcribe('audio.wav', 'Xenova/whisper-base');
    expect(api.progress.value.status).toBe('idle');
    wrapper.unmount();
  });

  it('streams cumulative partial words before the result and preserves sentence ids as text grows', async () => {
    workerState.mode = 'stream';
    workerState.partialWords = [
      [{ text: 'Hello', startMs: 0, endMs: 200 }],
      [
        { text: 'Hello', startMs: 0, endMs: 200 },
        { text: 'world.', startMs: 210, endMs: 500 },
      ],
    ];
    let api!: ReturnType<typeof useWhisperTranscription>;
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useWhisperTranscription();
          return () => null;
        },
      }),
    );
    const partials: WhisperResult[] = [];
    let finalResolved = false;
    const resultPromise = api.transcribe('audio.wav', 'Xenova/whisper-tiny', undefined, (partial) => {
      expect(finalResolved).toBe(false);
      partials.push(partial);
    });
    const result = await resultPromise;
    finalResolved = true;

    expect(partials).toHaveLength(2);
    expect(partials.map((partial) => partial.words.map((word) => word.text))).toEqual([['Hello'], ['Hello', 'world.']]);
    expect(partials[0]!.sentences[0]!.id).toBe(partials[1]!.sentences[0]!.id);
    expect(partials[1]!.sentences[0]!.id).toBe(result.sentences[0]!.id);
    expect(result.words).toEqual(workerState.partialWords[1]);
    expect(api.progress.value).toEqual({ status: 'idle', message: '' });
    wrapper.unmount();
  });

  it('rejects unreadable audio and worker transcription failures', async () => {
    let api!: ReturnType<typeof useWhisperTranscription>;
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useWhisperTranscription();
          return () => null;
        },
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(api.transcribe('missing.wav', 'Xenova/whisper-tiny')).rejects.toThrow(
      'Unable to read selected audio source.',
    );

    workerState.mode = 'error';
    await expect(api.transcribe('audio.wav', 'Xenova/whisper-tiny')).rejects.toThrow('Whisper failed');
    expect(api.progress.value).toEqual({
      status: 'error',
      message: 'Whisper failed',
    });
    wrapper.unmount();
  });
});
