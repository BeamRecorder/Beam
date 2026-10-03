import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { validateStillDocument } from '@beam/engine/screenshot/still-document';
import { projectFontSources } from '../editor/text/project-font-sources';
import { useAuthoringHost } from './useAuthoringHost';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';
import type { ScreenshotAuthoringOptions } from './screenshot-authoring-types';

export function useScreenshotAuthoring(options: ScreenshotAuthoringOptions) {
  const { document, state, history } = options;
  useAuthoringHost<StillDocument>({
    context: () =>
      document.value && state.value ? { projectId: document.value.id, name: document.value.name, kind: 'image' } : null,
    read: () => {
      if (!document.value || !state.value) throw new Error('Screenshot is not ready.');
      return {
        version: 1,
        kind: 'image',
        id: document.value.id,
        source: document.value.source,
        width: document.value.width,
        height: document.value.height,
        state: state.value,
        fontSources: projectFontSources({ clips: state.value.shapes }),
      };
    },
    commands: createStillCommands(),
    validate: validateStillDocument,
    apply: (next) => {
      if (state.value) history.commitNow(state.value);
      state.value = next.state;
      history.commitNow(next.state);
    },
    undo: history.undo,
    redo: history.redo,
    canUndo: () => history.canUndo.value,
    canRedo: () => history.canRedo.value,
    canEdit: () => !options.disabled() && !history.restoring.value,
    save: options.save,
  });
}
