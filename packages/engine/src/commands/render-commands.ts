import { createCommandRegistry } from './command-registry';
import { createCompositionCommands } from './composition-commands';
import { jsonObject } from '../document/json-value';
import type { CompositionSnapshot } from '../shared/render-document-types';
import { compositionDurationMs } from '../shared/timeline-mapping';

/** Shared authoring for a complete video document, including presentation and camera settings. */
export function createRenderCommands() {
  const registry = createCommandRegistry<CompositionSnapshot>();
  const composition = createCompositionCommands();
  for (const type of composition.types)
    registry.register({
      type,
      parse: (payload: unknown) => payload,
      apply(document, payload) {
        const next = composition.execute(document.composition, {
          type,
          payload,
        });
        return {
          ...document,
          composition: next,
          duration: Math.max(1 / document.render.fps, compositionDurationMs(next) / 1000),
        };
      },
    });
  registry.register({
    type: 'render.patch',
    parse(input) {
      const patch = jsonObject(input);
      const fields = new Set([
        'canvas',
        'background',
        'blurPercent',
        'zooms',
        'zoomMotionBlur',
        'zoomAutoFollow',
        'cursorSettings',
        'cursorPack',
        'fontSources',
        'render',
      ]);
      if (Object.keys(patch).some((key) => !fields.has(key))) throw new TypeError('Unknown render document setting.');
      return patch;
    },
    apply: (document, patch) => ({ ...document, ...patch }) as CompositionSnapshot,
  });
  return registry;
}
