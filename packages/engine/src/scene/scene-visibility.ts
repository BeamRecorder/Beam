import type { Clip, ClipComposition } from '../shared/composition-types';
import { authoredSceneComposition } from './scene-clock';

const candidates = new WeakMap<ClipComposition, ReadonlySet<string>>();
/** Resource planners must prepare authored-hidden media that an animation can enable. */
export function mayBeEnabled(composition: ClipComposition | null, clip: Clip) {
  if (clip.enabled) return true;
  if (!composition) return false;
  composition = authoredSceneComposition(composition);
  let ids = candidates.get(composition);
  if (!ids) {
    ids = new Set(
      composition.animations?.tracks
        .filter((track) => track.property === 'enabled' && track.keyframes.some((frame) => frame.value === true))
        .map((track) => track.targetId),
    );
    candidates.set(composition, ids);
  }
  return ids.has(clip.id);
}
