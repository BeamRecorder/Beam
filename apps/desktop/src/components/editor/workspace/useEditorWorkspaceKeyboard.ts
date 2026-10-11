import { matchesAction, shortcutTargetIsEditable } from '~/shortcuts/action-bindings';
import { onBeforeUnmount, onMounted } from 'vue';
import type {
  EditorWorkspaceState,
  EditorWorkspaceSelection,
  EditorWorkspaceTimeline,
  EditorWorkspaceCanvas,
} from './workspace-types';
export function useEditorWorkspaceKeyboard(
  state: EditorWorkspaceState,
  selection: EditorWorkspaceSelection,
  timeline: EditorWorkspaceTimeline,
  canvas: EditorWorkspaceCanvas,
) {
  const { selectedClipId, selectedClipIds, splitSelectedClip, selectedZoomIds } = state;
  const { clearTimelineSelection } = selection;
  const { isDeleteDialogOpen, requestTimelineDeletion } = timeline;
  const { isCropping, canvasFullscreen } = canvas;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      isDeleteDialogOpen.value ||
      shortcutTargetIsEditable(event.target) ||
      shortcutTargetIsEditable(document.activeElement) ||
      document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')
    )
      return;
    if (event.key === 'Escape' && canvasFullscreen.isFullscreen.value) return;
    if (matchesAction(event, 'editor.deselect')) {
      if (isCropping.value) isCropping.value = false;
      else clearTimelineSelection();
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || active.getAttribute('contenteditable') === 'true') return;
    }
    if (matchesAction(event, 'editor.split') && selectedClipId.value) {
      event.preventDefault();
      splitSelectedClip();
      return;
    }
    const navigation = [
      ['editor.previousFrame', state.currentTime.value - 1 / (state.exportRequest.value?.fps ?? 30)],
      ['editor.nextFrame', state.currentTime.value + 1 / (state.exportRequest.value?.fps ?? 30)],
      ['editor.start', 0],
      ['editor.end', state.duration.value],
    ] as const;
    const seek = navigation.find(([id]) => matchesAction(event, id));
    if (seek) {
      event.preventDefault();
      void state.player.seek(Math.max(0, Math.min(state.duration.value, seek[1])));
      return;
    }
    if (!matchesAction(event, 'editor.delete')) return;
    if (selectedClipIds.value.length || selectedZoomIds.value.length) {
      event.preventDefault();
      requestTimelineDeletion({
        clipIds: [...selectedClipIds.value],
        zoomIds: [...selectedZoomIds.value],
        mode: 'smart',
      });
    }
  };
  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
  return { handleKeyDown };
}
