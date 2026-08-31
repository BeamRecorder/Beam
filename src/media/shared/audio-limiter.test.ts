import { describe, expect, it } from 'vitest';
import {
  AUDIO_LIMITER_LOOKAHEAD_SECONDS,
  AUDIO_LIMITER_RELEASE_SECONDS,
  AUDIO_LIMITER_THRESHOLD_DB,
  StreamingAudioLimiter,
} from './audio-limiter';

const thresholdGain = 10 ** (AUDIO_LIMITER_THRESHOLD_DB / 20);

describe('StreamingAudioLimiter', () => {
  it('limits peaks to the configured -1 dB threshold', () => {
    expect(AUDIO_LIMITER_THRESHOLD_DB).toBe(-1);

    const samples = Float32Array.from([0.5, 1, 0.5]);
    new StreamingAudioLimiter().processInterleaved(samples, 1, 100);

    expect(samples[1]).toBeCloseTo(thresholdGain, 6);
    expect(Math.max(...samples.map((sample) => Math.abs(sample)))).toBeLessThanOrEqual(thresholdGain + 1e-6);
  });

  it('uses lookahead to attenuate a frame before a future peak', () => {
    expect(AUDIO_LIMITER_LOOKAHEAD_SECONDS).toBe(0.005);

    const samples = Float32Array.from([0.25, 0.25, 1, 0.25]);
    new StreamingAudioLimiter().processInterleaved(samples, 1, 100);

    expect(samples[0]).toBeCloseTo(0.25, 6);
    expect(samples[1]).toBeCloseTo(0.25 * thresholdGain, 6);
    expect(samples[2]).toBeCloseTo(thresholdGain, 6);
  });

  it('releases gain progressively after a peak', () => {
    expect(AUDIO_LIMITER_RELEASE_SECONDS).toBe(0.1);

    const samples = Float32Array.from([1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    new StreamingAudioLimiter().processInterleaved(samples, 1, 100);

    expect(samples[1]).toBeGreaterThan(samples[0] * 0.5);
    expect(samples[2]).toBeGreaterThan(samples[1]);
    expect(samples.at(-1)).toBeGreaterThan(samples[2]);
    expect(samples.at(-1)).toBeLessThan(0.5);
  });

  it('applies one linked gain to all stereo channels', () => {
    const samples = Float32Array.from([1, 0.25]);
    new StreamingAudioLimiter().processInterleaved(samples, 2, 100);

    expect(samples[0]).toBeCloseTo(thresholdGain, 6);
    expect(samples[1]).toBeCloseTo(0.25 * thresholdGain, 6);
  });

  it('resets gain state between independent streams', () => {
    const limiter = new StreamingAudioLimiter();
    const loud = Float32Array.from([1]);
    limiter.processInterleaved(loud, 1, 100);
    limiter.reset();

    const quiet = Float32Array.from([0.5]);
    limiter.processInterleaved(quiet, 1, 100);

    expect(quiet[0]).toBeCloseTo(0.5, 6);
  });
});
