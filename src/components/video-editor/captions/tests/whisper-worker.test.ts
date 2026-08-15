import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhisperWorkerEvent } from '../whisper-worker-protocol';

const runtime = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: {} as Record<string, unknown>,
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
  workerSelf = { onmessage: undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', workerSelf);
  vi.stubGlobal('navigator', { gpu: undefined });
  await import('../whisper.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (message: unknown) => workerSelf.onmessage!({ data: message } as MessageEvent<unknown>);
const messages = () => workerSelf.postMessage.mock.calls.map(([message]) => message as WhisperWorkerEvent);

describe('whisper worker', () => {
  it('streams cumulative partial words with absolute timestamps before the final result', async () => {
    const transcriber = vi
      .fn()
      .mockResolvedValueOnce({ chunks: [{ text: ' first', timestamp: [0.5, 1.25] }] })
      .mockResolvedValueOnce({ chunks: [{ text: ' second', timestamp: [0.25, 0.75] }] });
    runtime.pipeline.mockResolvedValue(transcriber);

    await send({
      type: 'transcribe',
      id: 'request-1',
      model: 'Xenova/whisper-tiny',
      audio: new Float32Array(12),
      sampleRate: 2,
      locale: 'en',
    });

    const partials = messages().filter((event) => event.type === 'partial');
    const result = messages().at(-1);

    expect(runtime.pipeline).toHaveBeenCalledOnce();
    expect(transcriber).toHaveBeenCalledTimes(2);
    expect(partials).toEqual([
      {
        type: 'partial',
        id: 'request-1',
        words: [{ text: 'first', startMs: 500, endMs: 1_250 }],
      },
      {
        type: 'partial',
        id: 'request-1',
        words: [
          { text: 'first', startMs: 500, endMs: 1_250 },
          { text: 'second', startMs: 5_250, endMs: 5_750 },
        ],
      },
    ]);
    expect(result).toEqual({
      type: 'result',
      id: 'request-1',
      words: [
        { text: 'first', startMs: 500, endMs: 1_250 },
        { text: 'second', startMs: 5_250, endMs: 5_750 },
      ],
    });
    expect(
      messages()
        .map((event) => event.type)
        .at(-3),
    ).toBe('partial');
    expect(
      messages()
        .map((event) => event.type)
        .at(-1),
    ).toBe('result');
  });
});
