import type { ClipComposition } from '../shared/composition-types';
import { CompositionEngineError } from './clip-composition-validation';

export const byId = (composition: ClipComposition, clipId: string) => {
  const clip = composition.clips.find((entry) => entry.id === clipId);
  if (!clip) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  return clip;
};

export const targetIds = (composition: ClipComposition, clipId: string) => {
  const clip = byId(composition, clipId);
  if (!clip.groupId) return [clip.id];
  return composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id);
};
