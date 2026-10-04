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
    if (event.defaultPrevented || isDeleteDialogOpen.value) return;
    if (event.key === 'Escape' && canvasFullscreen.isFullscreen.value) return;
    if (event.key === 'Escape') {
      if (isCropping.value) isCropping.value = false;
      else clearTimelineSelection();
    }
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || active.getAttribute('contenteditable') === 'true') return;
    }
    if ((event.key === 's' || event.key === 'S') && selectedClipId.value) {
      event.preventDefault();
      splitSelectedClip();
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
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
