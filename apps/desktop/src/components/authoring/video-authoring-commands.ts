import { createRenderCommands } from '@beam/engine/commands/render-commands';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';

/** Only presentation fields owned by the desktop's undo history are writable live. */
export function createLiveVideoCommands() {
  const registry = createRenderCommands();
  const fields = new Set(['canvas', 'background', 'blurPercent', 'zooms', 'zoomMotionBlur', 'zoomAutoFollow']);
  return {
    register: registry.register,
    get types() {
      return registry.types;
    },
    execute(document: CompositionSnapshot, command: Parameters<typeof registry.execute>[1]) {
      if (
        command.type === 'render.patch' &&
        command.payload &&
        typeof command.payload === 'object' &&
        Object.keys(command.payload).some((key) => !fields.has(key))
      )
        throw new Error(
          'Live render.patch supports canvas, background, blurPercent, zooms, zoomMotionBlur and zoomAutoFollow.',
        );
      return registry.execute(document, command);
    },
  };
}
