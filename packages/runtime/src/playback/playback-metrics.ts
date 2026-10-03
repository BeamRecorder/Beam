import type { PlaybackMetrics } from '@beam/runtime/playback/playback-types';

export const createPlaybackMetrics = (): PlaybackMetrics => ({
  decodedFrames: 0,
  presentedFrames: 0,
  droppedFrames: 0,
  supersededRequests: 0,
  queueSize: 0,
  cacheBytes: 0,
  disposedBitmaps: 0,
  seekLatencyMs: [],
});
