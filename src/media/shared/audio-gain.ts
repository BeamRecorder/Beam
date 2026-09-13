import type { AudioClip } from './composition-types';

export const decibelsToGain = (decibels: number) => (Number.isFinite(decibels) ? Math.pow(10, decibels / 20) : 1);

export const audioNormalizationGain = (clip: AudioClip) =>
  clip.normalization?.enabled ? decibelsToGain(clip.normalization.appliedGainDb) : 1;

export const effectiveAudioClipGain = (clip: AudioClip) =>
  Math.max(0, Math.min(2, clip.volume / 100)) * audioNormalizationGain(clip);
