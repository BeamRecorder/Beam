import { createThumbnailWorker } from './thumbnail-worker';
import type { ThumbnailRequest } from './thumbnail-types';

const receive = createThumbnailWorker((reply) => self.postMessage(reply));
self.onmessage = (event: MessageEvent<ThumbnailRequest>) => receive(event.data);
