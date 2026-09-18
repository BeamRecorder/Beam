import { onMounted, onScopeDispose } from 'vue';
import { shouldPreferInternalEditorClipboard } from './internal-editor-clipboard';

const EDITABLE_PASTE_TARGET =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

export const isEditablePasteTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest(EDITABLE_PASTE_TARGET));

export const clipboardContainsImage = (event: ClipboardEvent) =>
  Array.from(event.clipboardData?.items ?? []).some((item) => item.kind === 'file' && item.type.startsWith('image/'));

export function useClipboardImagePaste(options: {
  disabled?: () => boolean;
  preferInternal?: () => boolean;
  paste: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const handlePaste = (event: ClipboardEvent) => {
    const containsImage = clipboardContainsImage(event);
    if (
      event.defaultPrevented ||
      options.disabled?.() ||
      isEditablePasteTarget(event.target) ||
      !containsImage ||
      (options.preferInternal?.() && shouldPreferInternalEditorClipboard(containsImage))
    )
      return;
    event.preventDefault();
    void options.paste().catch(options.onError);
  };
  onMounted(() => window.addEventListener('paste', handlePaste));
  onScopeDispose(() => window.removeEventListener('paste', handlePaste));
  return { handlePaste };
}
