import { onMounted, onScopeDispose } from 'vue';
import { clipboardContainsImage, isEditablePasteTarget } from '../composables/useClipboardImagePaste';
import { shouldPreferInternalEditorClipboard } from '../composables/internal-editor-clipboard';
import type { ScreenshotLayer } from './screenshot-layer-types';

export function useScreenshotLayerShortcuts(options: {
  selected: () => ScreenshotLayer | undefined;
  disabled: () => boolean;
  remove: (id: string) => void;
  copy: () => boolean;
  cut: () => boolean;
  paste: () => boolean;
}) {
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || options.disabled()) return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="menu"], .popover-content',
      ) ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const handled = key === 'c' ? options.copy() : key === 'x' ? options.cut() : false;
      if (handled) event.preventDefault();
      return;
    }
    if (
      !['Delete', 'Backspace'].includes(event.key) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const layer = options.selected();
    if (!layer || layer.locked || (!layer.removable && ['image', 'background', 'watermark'].includes(layer.kind)))
      return;
    event.preventDefault();
    options.remove(layer.id);
  };
  const paste = (event: ClipboardEvent) => {
    const containsImage = clipboardContainsImage(event);
    if (
      event.defaultPrevented ||
      options.disabled() ||
      isEditablePasteTarget(event.target) ||
      (event.target instanceof Element && event.target.closest('[role="menu"], .popover-content')) ||
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      (containsImage && !shouldPreferInternalEditorClipboard(containsImage))
    )
      return;
    if (options.paste()) event.preventDefault();
  };
  onMounted(() => window.addEventListener('keydown', keydown));
  onMounted(() => window.addEventListener('paste', paste));
  onScopeDispose(() => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('paste', paste);
  });
}
