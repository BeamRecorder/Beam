import type { WaveformFilter } from './waveform-types';

const BAND_GAINS = [1, 1.18, 1.42, 1.78];

function lowpass(frequency: number, sampleRate: number): WaveformFilter {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosine) / (2 * a0),
    b1: (1 - cosine) / a0,
    b2: (1 - cosine) / (2 * a0),
    a1: (-2 * cosine) / a0,
    a2: (1 - alpha) / a0,
    z1: 0,
    z2: 0,
  };
}

function filter(filter: WaveformFilter, value: number): number {
  const result = filter.b0 * value + filter.z1;
  filter.z1 = filter.b1 * value - filter.a1 * result + filter.z2;
  filter.z2 = filter.b2 * value - filter.a2 * result;
  return result;
}

/** Fixed dB mapping and max-pooled 256-frame RMS, as in the Blick reference. */
export class WaveformBands {
  private readonly filters: WaveformFilter[];
  private readonly sums = new Float64Array(4);
  private frames = 0;
  private point = -1;
  private readonly output: Float32Array;

  constructor(sampleRate: number, output: Float32Array) {
    this.output = output;
    this.filters = [
      lowpass(Math.min(180, sampleRate * 0.2), sampleRate),
      lowpass(Math.min(900, sampleRate * 0.22), sampleRate),
      lowpass(Math.min(4000, sampleRate * 0.24), sampleRate),
    ];
  }

  add(mono: number, point: number): void {
    if (point !== this.point) this.flush();
    this.point = point;
    const low = filter(this.filters[0]!, mono);
    const below900 = filter(this.filters[1]!, mono);
    const below4000 = filter(this.filters[2]!, mono);
    this.sums[0] += low * low;
    this.sums[1] += (below900 - low) ** 2;
    this.sums[2] += (below4000 - below900) ** 2;
    this.sums[3] += (mono - below4000) ** 2;
    if (++this.frames === 256) this.flush();
  }

  flush(): void {
    if (!this.frames) return;
    for (let band = 0; band < 4; band += 1) {
      const rms = Math.sqrt(this.sums[band]! / this.frames) * BAND_GAINS[band]!;
      const db = 20 * Math.log10(Math.max(1e-8, rms));
      const value = Math.max(0, Math.min(1, (db + 60) / 50)) ** 1.18;
      const offset = this.point * 4 + band;
      this.output[offset] = Math.max(this.output[offset]!, value);
    }
    this.sums.fill(0);
    this.frames = 0;
  }
}
