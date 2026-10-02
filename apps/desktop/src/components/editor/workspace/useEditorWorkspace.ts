import { onMounted } from 'vue';
import { capture } from '~/api/capture';
import { useTimelineResize } from '../composables/useTimelineResize';
import { useEditorWorkspaceState } from './useEditorWorkspaceState';
import { useEditorWorkspaceHistory } from './useEditorWorkspaceHistory';
import { useEditorWorkspaceSelection } from './useEditorWorkspaceSelection';
import { useEditorWorkspaceTimeline } from './useEditorWorkspaceTimeline';
import { useEditorWorkspaceCanvas } from './useEditorWorkspaceCanvas';
import { useEditorWorkspaceMedia } from './useEditorWorkspaceMedia';
import { useEditorWorkspaceKeyboard } from './useEditorWorkspaceKeyboard';
import type { EditorWorkspaceProps, EditorWorkspaceEmit } from './workspace-types';

/** Vue host wiring; document commands and completed-frame rendering live in the reusable packages. */
export function useEditorWorkspace(props: EditorWorkspaceProps, emit: EditorWorkspaceEmit) {
  const state = useEditorWorkspaceState(props, emit);
  const history = useEditorWorkspaceHistory(state);
  const selectClip = (clipId: string): void => {
    selection.selectEditorClip(clipId);
  };
  const canvas = useEditorWorkspaceCanvas(state, history, selectClip);
  const selection = useEditorWorkspaceSelection(state, canvas.finishCrop);
  const timeline = useEditorWorkspaceTimeline(state, history, selection, canvas.finishCrop);
  const media = useEditorWorkspaceMedia(state, canvas.finishCrop);
  useEditorWorkspaceKeyboard(state, selection, timeline, canvas);
  const resize = useTimelineResize();
  onMounted(() => {
    capture.reportEditorLoadingStage?.('loadingPreview');
    // Show the native shell before camera decoding can occupy the hidden renderer.
    emit('ready');
  });
  capture.reportEditorLoadingStage?.('renderingEditor');
  return {
    ...state,
    ...history,
    ...selection,
    ...timeline,
    ...canvas,
    ...media,
    ...resize,
  };
}
