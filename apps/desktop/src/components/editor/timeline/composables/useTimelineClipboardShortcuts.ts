import { matchesAction, actionKeys, canonicalBinding } from '~/shortcuts/action-bindings';
import { computed, onMounted, onUnmounted } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
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
    if (event.defaultPrevented || event.repeat || event.isComposing || options.disabled()) return;
    const element = event.target instanceof Element ? event.target : document.activeElement;
    if (
      element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    const hasSelection = Boolean(options.selectedClipId() || options.selectedZoomId());
    if (matchesAction(event, 'editor.copy') && hasSelection) {
      event.preventDefault();
      options.copySelected();
    } else if (matchesAction(event, 'editor.cut') && hasSelection) {
      if (options.cutSelected()) event.preventDefault();
    } else if (
      matchesAction(event, 'editor.paste') &&
      canonicalBinding(actionKeys('editor.paste')) !== canonicalBinding('CommandOrControl+V') &&
      options.canPaste()
    ) {
      event.preventDefault();
      options.pasteClipboard({ ...(selectedPasteTarget.value ?? { category: 'visual' }), placement: 'auto' });
    } else if (matchesAction(event, 'editor.duplicate') && hasSelection) {
      event.preventDefault();
      options.copySelected();
      options.pasteClipboard({ ...(selectedPasteTarget.value ?? { category: 'visual' }), placement: 'new-layer' });
    }
  };
  const paste = (event: ClipboardEvent) => {
    const containsImage = clipboardContainsImage(event);
    if (
      event.defaultPrevented ||
      !actionKeys('editor.paste') ||
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
      placement: 'auto',
    });
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onMounted(() => window.addEventListener('paste', paste));
  onUnmounted(() => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('paste', paste);
  });
}
