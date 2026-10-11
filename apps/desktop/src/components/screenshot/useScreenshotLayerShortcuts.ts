import { matchesAction, actionKeys, canonicalBinding } from '~/shortcuts/action-bindings';
import { onMounted, onScopeDispose } from 'vue';
import { clipboardContainsImage, isEditablePasteTarget } from '../editor/composables/useClipboardImagePaste';
import { shouldPreferInternalEditorClipboard } from '../editor/composables/internal-editor-clipboard';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';

export function useScreenshotLayerShortcuts(options: {
  selected: () => ScreenshotLayer | undefined;
  disabled: () => boolean;
  remove: (id: string) => void;
  copy: () => boolean | Promise<boolean>;
  cut: () => boolean | Promise<boolean>;
  paste: () => boolean;
  selectAll?: () => void;
  deselect?: () => void;
  duplicate?: () => boolean;
  group?: () => boolean;
  ungroup?: () => boolean;
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
    if (matchesAction(event, 'editor.selectAll') && options.selectAll) {
      event.preventDefault();
      options.selectAll();
      return;
    }
    if (matchesAction(event, 'editor.deselect') && options.deselect) {
      event.preventDefault();
      options.deselect();
      return;
    }
    if (matchesAction(event, 'editor.group') || matchesAction(event, 'editor.ungroup')) {
      if (matchesAction(event, 'editor.ungroup') ? options.ungroup?.() : options.group?.()) event.preventDefault();
      return;
    }
    const handled = matchesAction(event, 'editor.copy')
      ? options.copy()
      : matchesAction(event, 'editor.cut')
        ? options.cut()
        : matchesAction(event, 'editor.paste') &&
            canonicalBinding(actionKeys('editor.paste')) !== canonicalBinding('CommandOrControl+V')
          ? options.paste()
          : matchesAction(event, 'editor.duplicate')
            ? options.duplicate?.()
            : false;
    if (handled instanceof Promise) {
      event.preventDefault();
      void handled;
      return;
    }
    if (handled) {
      event.preventDefault();
      return;
    }
    if (!matchesAction(event, 'editor.delete')) return;
    const layer = options.selected();
    if (!layer || layer.locked) return;
    event.preventDefault();
    options.remove(layer.id);
  };
  const paste = (event: ClipboardEvent) => {
    const containsImage = clipboardContainsImage(event);
    if (
      event.defaultPrevented ||
      !actionKeys('editor.paste') ||
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
