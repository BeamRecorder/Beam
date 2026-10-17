import { describe, expect, it } from 'vitest';
import { validateComposition } from './clip-composition-validation';
import {
  emptyComposition,
  type AudioClip,
  type BlurClip,
  type ClipComposition,
  type MediaAsset,
} from '../shared/composition-types';
import { colorClip } from '../scene/tests/scene-fixtures';
import type { AudioAnalysis, AudioNormalization } from '../shared/audio-normalization-types';

const media = (): MediaAsset => ({
  id: 'audio',
  kind: 'audio',
  name: 'Audio',
  fileName: 'audio.wav',
  src: 'audio.wav',
  origin: 'project',
  durationMs: 1000,
  width: null,
  height: null,
});
const audio = (): AudioClip => ({
  ...colorClip('audio'),
  kind: 'audio',
  assetId: 'audio',
  role: 'imported',
  volume: 100,
});
const blur = (): BlurClip => ({
  ...colorClip('blur'),
  kind: 'blur',
  mode: 'blur',
  shape: 'rectangle',
  strength: 60,
  feather: 0,
  tintOpacity: 0,
  color: '#000000',
  cornerRadius: 0,
});
const document = (): ClipComposition => ({
  ...emptyComposition(),
  durationMs: 10000,
  assets: [media()],
  clips: [colorClip(), audio(), blur()],
});
const analysis = (): AudioAnalysis => ({
  version: 1,
  key: 'analysis',
  rangeStartMs: 0,
  rangeDurationMs: 1000,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: -16,
  samplePeakDbfs: -3,
  truePeakDbtp: -1,
});
const normalization = (): AudioNormalization => ({
  enabled: true,
  mode: 'lufs',
  targetLufs: -16,
  targetPeakDbtp: -1,
  appliedGainDb: 0,
  analysisVersion: 1,
  analysisKey: 'analysis',
});

describe('composition validation with an extended timeline', () => {
  it('accepts valid media, effects and analyzed audio without padding source timing', () => {
    const value = document();
    value.assets[0]!.audioAnalyses = [analysis()];
    (value.clips[1] as AudioClip).normalization = normalization();
    expect(() => validateComposition(value)).not.toThrow();
    expect(value.clips.every((clip) => clip.timelineDurationMs === 1000)).toBe(true);
  });

  it.each([
    { version: 0 },
    { version: 1.5 },
    { key: '' },
    { rangeStartMs: -1 },
    { rangeDurationMs: 0 },
    { sampleRate: 0 },
    { channels: 0 },
    { channels: Infinity },
  ])('still rejects invalid analysis metadata %j', (patch) => {
    const value = document();
    value.assets[0]!.audioAnalyses = [{ ...analysis(), ...patch }];
    expect(() => validateComposition(value)).toThrow('Invalid audio analysis cache');
  });

  it.each([
    { enabled: 1 },
    { mode: 'unknown' },
    { targetLufs: NaN },
    { appliedGainDb: -25 },
    { appliedGainDb: 25 },
    { analysisVersion: 1.5 },
    { analysisVersion: 0 },
    { analysisKey: '' },
  ])('still rejects invalid normalization metadata %j', (patch) => {
    const value = document();
    (value.clips[1] as AudioClip).normalization = { ...normalization(), ...patch } as AudioNormalization;
    expect(() => validateComposition(value)).toThrow('Invalid audio normalization');
  });

  it.each([
    { shape: 'triangle' },
    { mode: 'unknown' },
    { strength: NaN },
    { strength: -1 },
    { strength: 101 },
    { feather: -1 },
    { feather: 101 },
    { cornerRadius: NaN },
    { cornerRadius: -1 },
    { cornerRadius: 101 },
    { tintOpacity: -1 },
    { tintOpacity: 101 },
    { color: 'invalid' },
    { highlightColor: 'invalid' },
  ])('does not let a longer project bypass effect validation %j', (patch) => {
    const value = document();
    value.clips[2] = { ...blur(), ...patch } as BlurClip;
    expect(() => validateComposition(value)).toThrow(/Invalid blur effect/);
  });

  it.each([
    {
      label: 'schema',
      change: (value: ClipComposition) => {
        value.schemaVersion = -1;
      },
      error: 'Invalid composition schema',
    },
    {
      label: 'session markers',
      change: (value: ClipComposition) => {
        value.keyboardCaptionSessions = [''];
      },
      error: 'Invalid composition schema',
    },
    {
      label: 'asset duration',
      change: (value: ClipComposition) => {
        value.assets[0]!.durationMs = -1;
      },
      error: 'Invalid media asset',
    },
    {
      label: 'duplicate asset',
      change: (value: ClipComposition) => {
        value.assets.push(media());
      },
      error: 'Invalid media asset',
    },
    {
      label: 'lock',
      change: (value: ClipComposition) => {
        value.clips[0]!.locked = 'yes' as never;
      },
      error: 'Invalid clip lock',
    },
    {
      label: 'duplicate ID',
      change: (value: ClipComposition) => {
        value.clips[2]!.id = value.clips[0]!.id;
      },
      error: 'Invalid clip identity',
    },
    {
      label: 'timing',
      change: (value: ClipComposition) => {
        value.clips[0]!.timelineStartMs = -1;
      },
      error: 'Invalid clip timing',
    },
    {
      label: 'missing transition',
      change: (value: ClipComposition) => {
        value.clips[0]!.transitions = undefined as never;
      },
      error: 'Missing clip transitions',
    },
    {
      label: 'source mismatch',
      change: (value: ClipComposition) => {
        value.clips[0]!.sourceDurationMs = 2000;
      },
      error: 'Clip source and timeline durations disagree',
    },
    {
      label: 'missing media',
      change: (value: ClipComposition) => {
        value.assets = [];
      },
      error: 'Missing asset for clip',
    },
    {
      label: 'audio role',
      change: (value: ClipComposition) => {
        (value.clips[1] as AudioClip).role = 'invalid' as never;
      },
      error: 'Invalid audio role',
    },
    {
      label: 'audio gain',
      change: (value: ClipComposition) => {
        (value.clips[1] as AudioClip).volume = 201;
      },
      error: 'Invalid clip volume',
    },
    {
      label: 'recording link',
      change: (value: ClipComposition) => {
        value.clips[0]!.recordingClipId = '';
      },
      error: 'Invalid recording sidecar link',
    },
    {
      label: 'transform',
      change: (value: ClipComposition) => {
        value.clips[0] = { ...colorClip(), transform: { x: 0, y: 0, width: 0, height: 1 } };
      },
      error: 'Invalid visual transform',
    },
    {
      label: 'color fill',
      change: (value: ClipComposition) => {
        value.clips[0] = { ...colorClip(), fill: { kind: 'color', color: 'invalid' } };
      },
      error: 'Invalid color clip settings',
    },
    {
      label: 'group timing',
      change: (value: ClipComposition) => {
        value.clips[0]!.groupId = 'g';
        value.clips[2]!.groupId = 'g';
        value.clips[2]!.timelineStartMs = 500;
      },
      error: 'Grouped clips must share timeline timing',
    },
    {
      label: 'track overlap',
      change: (value: ClipComposition) => {
        value.clips.push({ ...colorClip('copy'), trackId: 'a' });
      },
      error: 'overlap',
    },
  ])('still rejects invalid $label', ({ change, error }) => {
    const value = document();
    change(value);
    expect(() => validateComposition(value)).toThrow(error);
  });
});
