import { describe, expect, it } from 'vitest';
import {
  AUDIO_ANALYSIS_VERSION,
  DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS,
  DEFAULT_AUDIO_TRUE_PEAK_DBTP,
} from '../shared/audio-normalization-types';
import { StreamingLoudnessAnalyzer, audioAnalysisKey, normalizationFromAnalysis } from './audio-normalization';
import type { AudioAnalysis } from '../shared/audio-normalization-types';

const analysis = (overrides: Partial<AudioAnalysis> = {}): AudioAnalysis => ({
  version: AUDIO_ANALYSIS_VERSION,
  key: 'asset:0:1000:v1',
  rangeStartMs: 0,
  rangeDurationMs: 1_000,
  sampleRate: 48_000,
  channels: 1,
  integratedLufs: -20,
  samplePeakDbfs: -3,
  truePeakDbtp: -2,
  ...overrides,
});

describe('StreamingLoudnessAnalyzer', () => {
  it('preserves analysis across streaming chunks and records the audio format', () => {
    const samples = Float32Array.from({ length: 4_800 }, (_, index) => 0.25 * Math.sin(index / 13));
    const oneChunk = new StreamingLoudnessAnalyzer();
    oneChunk.push([samples], 4_800);

    const manyChunks = new StreamingLoudnessAnalyzer();
    for (let offset = 0; offset < samples.length; offset += 137)
      manyChunks.push([samples.slice(offset, offset + 137)], 4_800);

    const expected = oneChunk.finish('asset:one', 12.4, 987.6);
    const actual = manyChunks.finish('asset:two', 12.4, 987.6);
    expect(actual).toMatchObject({
      version: AUDIO_ANALYSIS_VERSION,
      rangeStartMs: 12,
      rangeDurationMs: 988,
      sampleRate: 4_800,
      channels: 1,
    });
    expect(actual.integratedLufs).toBeCloseTo(expected.integratedLufs!, 8);
    expect(actual.samplePeakDbfs).toBeCloseTo(expected.samplePeakDbfs!, 8);
    expect(actual.truePeakDbtp).toBeCloseTo(expected.truePeakDbtp!, 8);
  });

  it('reports silence without loudness or peak values', () => {
    const analyzer = new StreamingLoudnessAnalyzer();
    analyzer.push([new Float32Array(4_800)], 4_800);

    const result = analyzer.finish('silent', 0, 1_000);
    expect(result.integratedLufs).toBeNull();
    expect(result.samplePeakDbfs).toBeNull();
    expect(result.truePeakDbtp).toBeNull();
    expect(normalizationFromAnalysis(result)).toBeNull();
  });
});

describe('normalizationFromAnalysis', () => {
  it('uses the more restrictive LUFS and true-peak gain', () => {
    expect(normalizationFromAnalysis(analysis())).toMatchObject({
      enabled: true,
      mode: 'lufs',
      targetLufs: DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS,
      targetPeakDbtp: DEFAULT_AUDIO_TRUE_PEAK_DBTP,
      appliedGainDb: 1,
      analysisKey: 'asset:0:1000:v1',
    });
  });

  it('falls back to peak mode and clamps gain to the supported bounds', () => {
    expect(normalizationFromAnalysis(analysis({ integratedLufs: null, truePeakDbtp: -40 }))).toMatchObject({
      mode: 'peak',
      appliedGainDb: 24,
    });
    expect(normalizationFromAnalysis(analysis({ integratedLufs: 20, truePeakDbtp: null }))).toMatchObject({
      mode: 'lufs',
      appliedGainDb: -24,
    });
  });
});

describe('audioAnalysisKey', () => {
  it('rounds the range and includes the analysis version', () => {
    expect(audioAnalysisKey('asset-42', 12.4, 987.6)).toBe(`asset-42:12:988:v${AUDIO_ANALYSIS_VERSION}`);
  });
});
