import { validateRenderDocument } from '@beam/engine/document/render-document-validation';
import { propertyInteractionActive } from '~/composables/property-interaction';
import { useAuthoringHost } from './useAuthoringHost';
import { createLiveVideoCommands } from './video-authoring-commands';
import type { EditorWorkspaceState } from '../editor/workspace/workspace-types';
import type { useEditorWorkspaceHistory } from '../editor/workspace/useEditorWorkspaceHistory';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { BackgroundValue } from '@beam/engine/shared/background-types';

export function useVideoAuthoring(state: EditorWorkspaceState, history: ReturnType<typeof useEditorWorkspaceHistory>) {
  const read = () => {
    const document = state.exportRequest.value?.createSnapshot();
    if (!document) throw new Error('Video editor is not ready.');
    return { ...document, duration: Math.max(document.duration, 1 / document.render.fps) };
  };
  const backgroundFor = (background: CompositionSnapshot['background']): BackgroundValue | null => {
    if (!background) return null;
    if (background.kind === 'color' || background.kind === 'gradient')
      return { ...background, id: 'agent-background', name: 'Background' };
    const found = state.backgroundGroups.value
      .flatMap((group) => group.items)
      .find((item) => item.path === background.src);
    if (!found) throw new Error('Import the background into Beam before assigning its source.');
    return found;
  };
  useAuthoringHost<CompositionSnapshot>({
    context: () =>
      state.props.project && state.projectStateReady.value && !state.editorState.loading.value
        ? { projectId: state.props.project.id, name: state.props.project.name, kind: 'video' }
        : null,
    read,
    commands: createLiveVideoCommands(),
    validate: validateRenderDocument,
    apply: (next) => {
      const backgroundChanged = JSON.stringify(next.background) !== JSON.stringify(read().background);
      const background = backgroundChanged ? backgroundFor(next.background) : state.selectedBackground.value;
      history.commitNow(history.createEditorSnapshot());
      state.compositionState.restoreComposition(next.composition);
      state.zoomState.restoreZoomElements(next.zooms);
      if (next.zoomMotionBlur) state.zoomMotionBlur.value = next.zoomMotionBlur;
      if (next.zoomAutoFollow) state.zoomAutoFollow.value = next.zoomAutoFollow;
      state.outputCanvas.value = next.canvas;
      state.selectedBackground.value = background;
      state.backgroundBlurPercent.value = next.blurPercent;
      history.commitNow(history.createEditorSnapshot());
    },
    undo: history.undo,
    redo: history.redo,
    canUndo: () => history.canUndo.value,
    canRedo: () => history.canRedo.value,
    canEdit: () =>
      !propertyInteractionActive.value &&
      !state.isInlineCaptionEditing.value &&
      !state.isExporting.value &&
      !state.timelineCompositionPreview.value &&
      !state.layerCompositionPreview.value &&
      !state.cropCompositionPreview.value &&
      !state.timelineZoomPreview.value &&
      !state.timelineCanvasPreview.value,
    save: () => state.editorState.saveNow(),
  });
}
