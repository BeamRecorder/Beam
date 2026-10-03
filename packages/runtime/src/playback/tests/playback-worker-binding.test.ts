import { describe, expect, it, vi } from 'vitest';
import { bindPlaybackWorker } from '@beam/runtime/playback/playback-worker-binding';
import type { PlaybackWorkerBinding, PlaybackWorkerLike } from '@beam/runtime/playback/playback-worker-binding-types';
import { MediaInputError } from '@beam/runtime/shared/index';

const setup = () => {
  const worker: PlaybackWorkerLike = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
  const binding: PlaybackWorkerBinding = {
    receive: vi.fn(),
    disposed: vi.fn(() => false),
    terminate: vi.fn(),
    loads: new Map(),
    seeks: new Map(),
    fail: vi.fn(),
  };
  bindPlaybackWorker(worker, binding);
  return { worker, binding, error: () => Reflect.apply(worker.onerror!, worker, [new ErrorEvent('error')]) };
};

describe('playback worker lifetime binding', () => {
  it('passes message data unchanged to the protocol boundary', () => {
    const { worker, binding } = setup();
    const data = { unexpected: 'validated by receiver' };
    Reflect.apply(worker.onmessage!, worker, [new MessageEvent('message', { data })]);
    expect(binding.receive).toHaveBeenCalledWith(data);
  });

  it('rejects every pending load, supersedes every seek and reports an active worker failure', () => {
    const { binding, error } = setup();
    const reject = vi.fn(),
      resolve = vi.fn();
    binding.loads.set(1, { reject });
    binding.loads.set(2, { reject });
    binding.seeks.set(3, { resolve });
    binding.seeks.set(4, { resolve });
    error();
    expect(reject).toHaveBeenCalledTimes(2);
    expect(reject.mock.calls[0]?.[0]).toBeInstanceOf(MediaInputError);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith('superseded');
    expect(binding.loads.size).toBe(0);
    expect(binding.seeks.size).toBe(0);
    expect(binding.fail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'decode-failure', sourceId: 'playback-worker' }),
    );
    expect(binding.terminate).not.toHaveBeenCalled();
  });

  it('only terminates on errors delivered after disposal', () => {
    const { binding, error } = setup();
    vi.mocked(binding.disposed).mockReturnValue(true);
    error();
    expect(binding.terminate).toHaveBeenCalledOnce();
    expect(binding.fail).not.toHaveBeenCalled();
  });
});
