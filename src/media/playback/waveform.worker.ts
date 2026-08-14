import { MediaInputError, type MediaError } from '../shared';
import { extractWaveformPeaks } from './waveform';
import {
  assertWaveformWorkerResponse,
  isWaveformWorkerRequest,
  type WaveformWorkerRequest,
  type WaveformWorkerResponse,
} from './waveform-protocol';

let latestGeneration = 0;
const pending = new Map<string, Extract<WaveformWorkerRequest, { type: 'extract' }>>();
let processing = false;

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isWaveformWorkerRequest(event.data)) return;
  latestGeneration = Math.max(latestGeneration, event.data.generation);
  if (event.data.type === 'clear') {
    pending.clear();
    return;
  }
  pending.set(event.data.clipId, event.data);
  void processRequests();
};

async function processRequests() {
  if (processing) return;
  processing = true;
  try {
    while (pending.size) {
      const request = pending.values().next().value;
      if (!request) break;
      pending.delete(request.clipId);
      try {
        const peaks = await extractWaveformPeaks(
          request.source,
          request.startSeconds,
          request.endSeconds,
          request.pointCount,
        );
        if (request.generation === latestGeneration) {
          post({
            type: 'result',
            generation: request.generation,
            clipId: request.clipId,
            peaks,
            resolution: request.resolution,
          });
        }
      } catch (error) {
        if (request.generation !== latestGeneration) continue;
        post({
          type: 'error',
          generation: request.generation,
          clipId: request.clipId,
          error: mediaError(error, request.source.assetId),
        });
      }
    }
  } finally {
    processing = false;
  }
}

const mediaError = (error: unknown, sourceId: string): MediaError =>
  error instanceof MediaInputError
    ? error.detail
    : {
        kind: 'decode-failure',
        sourceId,
        message: error instanceof Error ? error.message : 'The waveform could not be decoded.',
      };

function post(message: WaveformWorkerResponse) {
  assertWaveformWorkerResponse(message);
  if (message.type === 'result') self.postMessage(message, { transfer: [message.peaks.buffer] });
  else self.postMessage(message);
}
