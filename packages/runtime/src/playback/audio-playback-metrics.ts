export interface AudioPlaybackMetrics {
  schedulePasses: number;
  scheduledBuffers: number;
  lateBuffers: number;
  scheduleErrors: number;
  maxLatenessMs: number;
  contextState: AudioContextState | 'unavailable';
}

export const emptyAudioPlaybackMetrics = (): AudioPlaybackMetrics => ({
  schedulePasses: 0,
  scheduledBuffers: 0,
  lateBuffers: 0,
  scheduleErrors: 0,
  maxLatenessMs: 0,
  contextState: 'unavailable',
});
