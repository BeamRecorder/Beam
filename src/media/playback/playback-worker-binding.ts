import type { PlaybackWorkerBinding, PlaybackWorkerLike } from './playback-worker-binding-types';
import { MediaInputError, type MediaError } from '../shared';

export function bindPlaybackWorker(worker: PlaybackWorkerLike, binding: PlaybackWorkerBinding): void {
  worker.onmessage = (event: MessageEvent<unknown>) => binding.receive(event.data);
  worker.onerror = () => {
    if (binding.disposed()) return binding.terminate();
    const error: MediaError = {
      kind: 'decode-failure',
      sourceId: 'playback-worker',
      message: 'The playback worker stopped unexpectedly.',
    };
    for (const pending of binding.loads.values()) pending.reject(new MediaInputError(error));
    binding.loads.clear();
    for (const pending of binding.seeks.values()) pending.resolve('superseded');
    binding.seeks.clear();
    binding.fail(error);
  };
}
