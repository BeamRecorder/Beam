import type { CommandRegistry } from './command-types';
import type { ClipComposition } from '../shared/composition-types';
import type { PropertyTrack, SceneGraph } from '../scene/scene-types';
import { validateSceneExtensions } from '../scene/scene-schema.js';

export function registerSceneCommands(registry: CommandRegistry<ClipComposition>) {
  registry.register({
    type: 'scene.set',
    parse: (value) => {
      if (!value || typeof value !== 'object') throw new Error('Expected a scene graph.');
      return JSON.parse(JSON.stringify(value)) as SceneGraph;
    },
    apply: (document, scene) => {
      if (document.clips.some((clip) => clip.locked))
        throw new Error('Cannot change scenes containing locked content.');
      const next = { ...document, scene };
      validateSceneExtensions(next);
      return next;
    },
  });
  registry.register({
    type: 'animation.set',
    parse: (value) => {
      if (!value || typeof value !== 'object') throw new Error('Expected a property track.');
      return JSON.parse(JSON.stringify(value)) as PropertyTrack;
    },
    apply: (document, track) => {
      if (
        document.clips.some((clip) => clip.locked && clip.id === track.targetId) ||
        document.clips.some(
          (clip) => clip.locked && document.scene?.groups.some((group) => group.id === track.targetId),
        )
      )
        throw new Error('Cannot animate locked content.');
      const next: ClipComposition = {
        ...document,
        animations: {
          version: 1,
          tracks: [...(document.animations?.tracks ?? []).filter((entry) => entry.id !== track.id), track],
        },
      };
      validateSceneExtensions(next);
      return next;
    },
  });
  registry.register({
    type: 'animation.delete',
    parse: (value) => {
      if (typeof value !== 'string' || !value) throw new Error('Expected a track ID.');
      return value;
    },
    apply: (document, id) => {
      const track = document.animations?.tracks.find((track) => track.id === id);
      if (!track) throw new Error(`Unknown animation: ${id}`);
      if (document.clips.some((clip) => clip.locked)) throw new Error('Cannot change animation with locked content.');
      return {
        ...document,
        animations: { version: 1, tracks: document.animations!.tracks.filter((track) => track.id !== id) },
      };
    },
  });
}
