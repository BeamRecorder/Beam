import {
  AUDIO_ANALYSIS_VERSION,
  DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS,
  DEFAULT_AUDIO_TRUE_PEAK_DBTP,
  type AudioAnalysis,
  type AudioNormalization,
} from '../shared/audio-normalization-types';

type BiquadCoefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };
type BiquadState = { x1: number; x2: number; y1: number; y2: number };

const levelDb = (amplitude: number) => (amplitude > 0 ? 20 * Math.log10(amplitude) : -240);
const energyLoudness = (energy: number) => (energy > 0 ? -0.691 + 10 * Math.log10(energy) : -240);

const shelfCoefficients = (sampleRate: number): BiquadCoefficients => {
  const frequency = 1_681.974450955533;
  const q = 0.7071752369554196;
  const high = Math.pow(10, 3.99984385397 / 20);
  const middle = Math.pow(high, 0.499666774155);
  const k = Math.tan((Math.PI * frequency) / sampleRate);
  const a0 = 1 + k / q + k * k;
  return {
    b0: (high + (middle * k) / q + k * k) / a0,
    b1: (2 * (k * k - high)) / a0,
    b2: (high - (middle * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
};

const highPassCoefficients = (sampleRate: number): BiquadCoefficients => {
  const frequency = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan((Math.PI * frequency) / sampleRate);
  const a0 = 1 + k / q + k * k;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
};

const filterSample = (value: number, coefficients: BiquadCoefficients, state: BiquadState) => {
  const output =
    coefficients.b0 * value +
    coefficients.b1 * state.x1 +
    coefficients.b2 * state.x2 -
    coefficients.a1 * state.y1 -
    coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = value;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
};

const emptyState = (): BiquadState => ({ x1: 0, x2: 0, y1: 0, y2: 0 });

export class StreamingLoudnessAnalyzer {
  private readonly blockEnergies: number[] = [];
  private readonly recentSubblocks: number[][] = [];
  private channelFilters: Array<{ shelf: BiquadState; highPass: BiquadState }> = [];
  private subblockEnergy: number[] = [];
  private subblockFrames = 0;
  private sampleRate = 0;
  private channels = 0;
  private samplePeak = 0;
  private truePeak = 0;
  private previousSamples: number[][] = [];

  push(channelData: readonly Float32Array[], sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || channelData.length === 0) return;
    if (this.sampleRate === 0) this.initialize(sampleRate, channelData.length);
    if (sampleRate !== this.sampleRate || channelData.length !== this.channels)
      throw new Error('Audio format changed during loudness analysis.');
    const frameCount = Math.min(...channelData.map((channel) => channel.length));
    const shelf = shelfCoefficients(sampleRate);
    const highPass = highPassCoefficients(sampleRate);
    const subblockSize = Math.max(1, Math.round(sampleRate / 10));
    for (let frame = 0; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < this.channels; channel += 1) {
        const value = Number.isFinite(channelData[channel]![frame]) ? channelData[channel]![frame]! : 0;
        this.samplePeak = Math.max(this.samplePeak, Math.abs(value));
        this.updateTruePeak(channel, value);
        const filters = this.channelFilters[channel]!;
        const weighted = filterSample(filterSample(value, shelf, filters.shelf), highPass, filters.highPass);
        this.subblockEnergy[channel] = (this.subblockEnergy[channel] ?? 0) + weighted * weighted;
      }
      this.subblockFrames += 1;
      if (this.subblockFrames >= subblockSize) this.finishSubblock();
    }
  }

  finish(key: string, rangeStartMs: number, rangeDurationMs: number): AudioAnalysis {
    if (this.subblockFrames > 0) this.finishSubblock();
    const absoluteGated = this.blockEnergies.filter((energy) => energyLoudness(energy) >= -70);
    const ungatedEnergy = mean(absoluteGated);
    const relativeThreshold = energyLoudness(ungatedEnergy) - 10;
    const gated = absoluteGated.filter((energy) => energyLoudness(energy) >= relativeThreshold);
    return {
      version: AUDIO_ANALYSIS_VERSION,
      key,
      rangeStartMs: Math.max(0, Math.round(rangeStartMs)),
      rangeDurationMs: Math.max(1, Math.round(rangeDurationMs)),
      sampleRate: this.sampleRate,
      channels: this.channels,
      integratedLufs: gated.length ? energyLoudness(mean(gated)) : null,
      samplePeakDbfs: this.samplePeak > 0 ? levelDb(this.samplePeak) : null,
      truePeakDbtp: this.truePeak > 0 ? levelDb(this.truePeak) : null,
    };
  }

  private initialize(sampleRate: number, channels: number) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.channelFilters = Array.from({ length: channels }, () => ({ shelf: emptyState(), highPass: emptyState() }));
    this.subblockEnergy = Array(channels).fill(0);
    this.previousSamples = Array.from({ length: channels }, () => []);
  }

  private finishSubblock() {
    const normalized = this.subblockEnergy.map((energy) => energy / Math.max(1, this.subblockFrames));
    this.recentSubblocks.push(normalized);
    if (this.recentSubblocks.length > 4) this.recentSubblocks.shift();
    if (this.recentSubblocks.length === 4) {
      let total = 0;
      for (let channel = 0; channel < this.channels; channel += 1)
        total += mean(this.recentSubblocks.map((subblock) => subblock[channel] ?? 0));
      this.blockEnergies.push(total);
    }
    this.subblockEnergy.fill(0);
    this.subblockFrames = 0;
  }

  private updateTruePeak(channel: number, value: number) {
    const history = this.previousSamples[channel]!;
    history.push(value);
    if (history.length < 4) {
      this.truePeak = Math.max(this.truePeak, Math.abs(value));
      return;
    }
    const [p0, p1, p2, p3] = history;
    for (let step = 0; step < 4; step += 1) {
      const t = step / 4;
      const interpolated =
        0.5 *
        (2 * p1! +
          (-p0! + p2!) * t +
          (2 * p0! - 5 * p1! + 4 * p2! - p3!) * t * t +
          (-p0! + 3 * p1! - 3 * p2! + p3!) * t * t * t);
      this.truePeak = Math.max(this.truePeak, Math.abs(interpolated));
    }
    history.shift();
  }
}

const mean = (values: readonly number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export const audioAnalysisKey = (assetId: string, rangeStartMs: number, rangeDurationMs: number) =>
  `${assetId}:${Math.round(rangeStartMs)}:${Math.round(rangeDurationMs)}:v${AUDIO_ANALYSIS_VERSION}`;

export function normalizationFromAnalysis(analysis: AudioAnalysis): AudioNormalization | null {
  const loudness = analysis.integratedLufs;
  const peak = analysis.truePeakDbtp ?? analysis.samplePeakDbfs;
  if (loudness === null && peak === null) return null;
  const loudnessGain = loudness === null ? 24 : DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS - loudness;
  const peakGain = peak === null ? 24 : DEFAULT_AUDIO_TRUE_PEAK_DBTP - peak;
  return {
    enabled: true,
    mode: loudness === null ? 'peak' : 'lufs',
    targetLufs: DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS,
    targetPeakDbtp: DEFAULT_AUDIO_TRUE_PEAK_DBTP,
    appliedGainDb: Math.max(-24, Math.min(24, Math.min(loudnessGain, peakGain))),
    analysisVersion: analysis.version,
    analysisKey: analysis.key,
  };
}
