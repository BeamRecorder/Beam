export const AUDIO_LIMITER_THRESHOLD_DB = -1;
export const AUDIO_LIMITER_LOOKAHEAD_SECONDS = 0.005;
export const AUDIO_LIMITER_RELEASE_SECONDS = 0.1;

const thresholdGain = Math.pow(10, AUDIO_LIMITER_THRESHOLD_DB / 20);

export class StreamingAudioLimiter {
  private gain = 1;

  reset() {
    this.gain = 1;
  }

  processInterleaved(samples: Float32Array, channels: number, sampleRate: number) {
    if (!Number.isSafeInteger(channels) || channels <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return;
    const frames = Math.floor(samples.length / channels);
    const lookAhead = Math.max(1, Math.round(sampleRate * AUDIO_LIMITER_LOOKAHEAD_SECONDS));
    const release = Math.exp(-1 / (sampleRate * AUDIO_LIMITER_RELEASE_SECONDS));
    const peaks = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      let peak = 0;
      for (let channel = 0; channel < channels; channel += 1)
        peak = Math.max(peak, Math.abs(samples[frame * channels + channel] ?? 0));
      peaks[frame] = peak;
    }
    const deque = new Uint32Array(frames);
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      const end = Math.min(frames, frame + lookAhead + 1);
      while (next < end) {
        while (tail > head && peaks[deque[tail - 1]!]! <= peaks[next]!) tail -= 1;
        deque[tail++] = next++;
      }
      while (head < tail && deque[head]! < frame) head += 1;
      const peak = peaks[deque[head] ?? frame] ?? 0;
      const requiredGain = peak > thresholdGain ? thresholdGain / peak : 1;
      this.gain = Math.min(requiredGain, 1 - (1 - this.gain) * release);
      for (let channel = 0; channel < channels; channel += 1) {
        const index = frame * channels + channel;
        samples[index] = (samples[index] ?? 0) * this.gain;
      }
    }
  }
}
