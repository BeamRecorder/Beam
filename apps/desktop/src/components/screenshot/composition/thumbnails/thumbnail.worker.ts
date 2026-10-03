import { createThumbnailWorker } from './thumbnail-worker';
import type { ThumbnailWorkerMessage } from './thumbnail-types';

const receive = createThumbnailWorker((reply) => self.postMessage(reply));
self.onmessage = (event: MessageEvent<ThumbnailWorkerMessage>) => receive(event.data);
