import { computed, onMounted, onUnmounted } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import { clipboardContainsImage, isEditablePasteTarget } from '../../composables/useClipboardImagePaste';
import { shouldPreferInternalEditorClipboard } from '../../composables/internal-editor-clipboard';
import { getClipCategory } from './useTimelineClipboard';
import type { TimelinePasteTarget } from './timeline-clipboard-types';

export function useTimelineClipboardShortcuts(options: {
  composition: () => ClipComposition;
  selectedClipId: () => string | null;
  selectedZoomId: () => string | null;
  disabled: () => boolean;
  copySelected: () => void;
  cutSelected: () => boolean;
  canPaste: () => boolean;
  pasteClipboard: (target: TimelinePasteTarget | null) => void;
}) {
  const selectedPasteTarget = computed<TimelinePasteTarget | null>(() => {
    const clipId = options.selectedClipId();
    const clip = clipId ? (options.composition().clips.find((item) => item.id === clipId) ?? null) : null;
    if (clip) return { category: getClipCategory(clip), trackId: clip.trackId ?? null };
    return options.selectedZoomId() ? { category: 'zoom' } : null;
  });
  const keydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      options.disabled() ||
      event.altKey ||
      event.shiftKey ||
      !(event.ctrlKey || event.metaKey)
    )
      return;
    const element = event.target instanceof Element ? event.target : document.activeElement;
    if (
      element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    const key = event.key.toLowerCase();
    const hasSelection = Boolean(options.selectedClipId() || options.selectedZoomId());
    if (key === 'c' && hasSelection) {
      event.preventDefault();
      options.copySelected();
    } else if (key === 'x' && hasSelection) {
      if (options.cutSelected()) event.preventDefault();
    }
  };
  const paste = (event: ClipboardEvent) => {
    const containsImage = clipboardContainsImage(event);
    if (
      event.defaultPrevented ||
      options.disabled() ||
      isEditablePasteTarget(event.target) ||
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      !options.canPaste() ||
      (containsImage && !shouldPreferInternalEditorClipboard(containsImage))
    )
      return;
    event.preventDefault();
    options.pasteClipboard({
      ...(selectedPasteTarget.value ?? { category: 'visual' as const }),
      placement: 'new-layer',
    });
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onMounted(() => window.addEventListener('paste', paste));
  onUnmounted(() => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('paste', paste);
  });
}
