import type { AudioClip, ClipComposition } from '../shared/composition-types';
import { effectiveAudioClipGain } from '../shared/audio-gain';
import { authoredSceneComposition, sceneClocks, propertyTrackTime } from './scene-clock';
import { samplePropertyTrack } from './keyframes';
import { decibelsToGain } from '../shared/audio-gain';

export function createAudioGainSampler(composition: ClipComposition, clip: AudioClip) {
  composition = authoredSceneComposition(composition);
  const authored = composition.clips.find((entry) => entry.id === clip.id) ?? clip;
  const animated = composition.animations?.tracks.some((track) => track.targetId === clip.id);
  if (!animated) {
    const gain = effectiveAudioClipGain(clip);
    return (_timeMs: number) => gain;
  }
  const tracks = new Map(
    composition
      .animations!.tracks.filter((track) => track.targetId === clip.id)
      .map((track) => [track.property, track]),
  );
  const clock = sceneClocks(composition).get(clip.id);
  const sample = (property: string, timeMs: number, fallback: number | boolean) => {
    const track = tracks.get(property);
    if (!track) return fallback;
    const time = propertyTrackTime(track, timeMs, clock, authored.timelineStartMs);
    return samplePropertyTrack(track, time);
  };
  return (timeMs: number) => {
    if (!sample('enabled', timeMs, clip.enabled)) return 0;
    const volume = sample('volume', timeMs, clip.volume) as number;
    const normalized = sample('normalization.enabled', timeMs, clip.normalization?.enabled ?? false);
    const gain = normalized
      ? decibelsToGain(sample('normalization.appliedGainDb', timeMs, clip.normalization!.appliedGainDb) as number)
      : 1;
    return Math.max(0, Math.min(2, volume / 100)) * gain;
  };
}
