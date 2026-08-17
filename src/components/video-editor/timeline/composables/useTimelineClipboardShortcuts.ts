import { computed, onMounted, onUnmounted } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import { getClipCategory } from './useTimelineClipboard';
import type { TimelinePasteTarget } from './timeline-clipboard-types';

export function useTimelineClipboardShortcuts(options: {
  composition: () => ClipComposition;
  selectedClipId: () => string | null;
  selectedZoomId: () => string | null;
  copySelected: () => void;
  pasteClipboard: (target: TimelinePasteTarget | null) => void;
}) {
  const selectedPasteTarget = computed<TimelinePasteTarget | null>(() => {
    const clipId = options.selectedClipId();
    const clip = clipId ? (options.composition().clips.find((item) => item.id === clipId) ?? null) : null;
    if (clip) return { category: getClipCategory(clip), trackId: clip.trackId ?? null };
    return options.selectedZoomId() ? { category: 'zoom' } : null;
  });
  const keydown = (event: KeyboardEvent) => {
    const element = event.target instanceof Element ? event.target : document.activeElement;
    const editable =
      element instanceof Element &&
      (['input', 'textarea', 'select'].includes(element.tagName.toLowerCase()) ||
        element.getAttribute('contenteditable') === 'true');
    if (!(event.ctrlKey || event.metaKey) || editable) return;
    const key = event.key.toLowerCase();
    if (key === 'c' && (options.selectedClipId() || options.selectedZoomId())) {
      event.preventDefault();
      options.copySelected();
    } else if (key === 'v') {
      event.preventDefault();
      options.pasteClipboard(selectedPasteTarget.value);
    }
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onUnmounted(() => window.removeEventListener('keydown', keydown));
}
