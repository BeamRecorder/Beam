type ClipboardSyncState = 'idle' | 'pending' | 'synced' | 'local-only';

let revision = 0;
let state: ClipboardSyncState = 'idle';

const copyWithSelection = (text: string) => {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  try {
    return document.execCommand('copy');
  } finally {
    input.remove();
  }
};

/**
 * Replace stale native clipboard media whenever Beam copies an editor item.
 * A later native image paste therefore unambiguously represents a newer
 * screenshot or image copied outside Beam.
 */
export const syncInternalEditorClipboard = (description: string) => {
  const current = ++revision;
  state = 'pending';
  const text = `Beam — ${description}`;
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  const writeText = clipboard?.writeText;
  if (!writeText) {
    state = copyWithSelection(text) ? 'synced' : 'local-only';
    return;
  }
  void writeText
    .call(clipboard, text)
    .then(() => {
      if (current === revision) state = 'synced';
    })
    .catch(() => {
      if (current === revision) state = copyWithSelection(text) ? 'synced' : 'local-only';
    });
};

/**
 * A native image that appears after a successful sync is newer than Beam's
 * internal copy and should be imported. While the native sync is pending or
 * unavailable, keep the internal item authoritative so Ctrl+C/Ctrl+V remains
 * reliable instead of pasting a stale image.
 */
export const shouldPreferInternalEditorClipboard = (containsNativeImage: boolean) => {
  if (state === 'idle') return false;
  if (!containsNativeImage || state !== 'synced') return true;
  revision += 1;
  state = 'idle';
  return false;
};

export const resetInternalEditorClipboardSync = () => {
  revision += 1;
  state = 'idle';
};
