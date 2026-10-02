import { preservesLockedItems, preservesLockedAssets } from '../composition/timeline-locks';
import type { ClipComposition } from '../shared/composition-types';
import type { CommandRegistry, DocumentCommand } from './command-types';
import { createCommandRegistry } from './command-registry';
import { registerSceneCommands } from './scene-commands';
import { registerAuthoringCommands } from './authoring-commands';
import {
  moveClip,
  trimClip,
  splitClip,
  deleteClip,
  setPlaybackRate,
  setClipEnabled,
  setVolume,
  reorderClip,
  detachClip,
} from './clip-engine';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Command payload must be an object.');
  return value as Record<string, unknown>;
};
const clipId = (payload: Record<string, unknown>) => {
  if (typeof payload.clipId !== 'string' || !payload.clipId) throw new TypeError('Command requires a clipId.');
  return payload.clipId;
};
const number = (payload: Record<string, unknown>, name: string) => {
  const value = payload[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Invalid command value: ${name}`);
  return value;
};

export function createCompositionCommands(): CommandRegistry<ClipComposition> {
  const registry = createCommandRegistry<ClipComposition>();
  registerSceneCommands(registry);
  registerAuthoringCommands(registry);
  const numeric = (
    type: string,
    key: string,
    apply: (document: ClipComposition, id: string, value: number) => ClipComposition,
  ) => {
    registry.register({
      type,
      parse: (input) => {
        const payload = object(input);
        return { clipId: clipId(payload), value: number(payload, key) };
      },
      apply: (document, payload) => apply(document, payload.clipId, payload.value),
    });
  };
  numeric('clip.move', 'startMs', moveClip);
  numeric('clip.split', 'timeMs', splitClip);
  numeric('clip.rate', 'rate', setPlaybackRate);
  numeric('clip.volume', 'volume', setVolume);
  numeric('clip.reorder', 'index', reorderClip);
  registry.register({
    type: 'clip.trim',
    parse: (input) => {
      const payload = object(input);
      if (payload.edge !== 'start' && payload.edge !== 'end') throw new TypeError('Invalid trim edge.');
      return {
        clipId: clipId(payload),
        edge: payload.edge as 'start' | 'end',
        timeMs: number(payload, 'timeMs'),
      };
    },
    apply: (document, payload) => trimClip(document, payload.clipId, payload.edge, payload.timeMs),
  });
  registry.register({
    type: 'clip.enable',
    parse: (input) => {
      const payload = object(input);
      if (typeof payload.enabled !== 'boolean') throw new TypeError('Invalid enabled value.');
      return { clipId: clipId(payload), enabled: payload.enabled };
    },
    apply: (document, payload) => setClipEnabled(document, payload.clipId, payload.enabled),
  });
  for (const [type, apply] of [
    ['clip.delete', deleteClip],
    ['clip.detach', detachClip],
  ] as const) {
    registry.register({ type, parse: (input) => clipId(object(input)), apply });
  }
  return {
    register: registry.register,
    get types() {
      return registry.types;
    },
    execute(document, command) {
      const next = registry.execute(document, command);
      if (!preservesLockedItems(document.clips, next.clips) || !preservesLockedAssets(document, next)) {
        throw new Error('Command would change locked content.');
      }
      return next;
    },
  };
}

const commands = createCompositionCommands();
export const executeCompositionCommand = (document: ClipComposition, command: DocumentCommand) =>
  commands.execute(document, command);
