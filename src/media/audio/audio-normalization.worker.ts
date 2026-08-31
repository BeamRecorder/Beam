import { AudioSampleSink } from 'mediabunny';
import { openMediaInput } from '../shared';
import { StreamingLoudnessAnalyzer } from './audio-normalization';
import type {
  AudioNormalizationWorkerRequest,
  AudioNormalizationWorkerResponse,
} from './audio-normalization-worker-types';

self.onmessage = (event: MessageEvent<AudioNormalizationWorkerRequest>) => {
  if (event.data?.type !== 'analyze') return;
  void analyze(event.data);
};

async function analyze(request: AudioNormalizationWorkerRequest) {
  let opened: Awaited<ReturnType<typeof openMediaInput>> | null = null;
  try {
    opened = await openMediaInput({ ...request.source, kind: 'audio' });
    const track = await opened.input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error('Audio source cannot be decoded.');
    const analyzer = new StreamingLoudnessAnalyzer();
    const startSeconds = request.rangeStartMs / 1_000;
    const endSeconds = (request.rangeStartMs + request.rangeDurationMs) / 1_000;
    for await (const sample of new AudioSampleSink(track).samples(startSeconds, endSeconds, { skipLiveWait: true })) {
      try {
        const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const data = new Float32Array(sample.numberOfFrames);
          sample.copyTo(data, { planeIndex, format: 'f32-planar' });
          return data;
        });
        analyzer.push(channels, sample.sampleRate);
      } finally {
        sample.close();
      }
    }
    post({
      type: 'result',
      requestId: request.requestId,
      analysis: analyzer.finish(request.analysisKey, request.rangeStartMs, request.rangeDurationMs),
    });
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    opened?.dispose();
  }
}

function post(message: AudioNormalizationWorkerResponse) {
  self.postMessage(message);
}
