import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetInternalEditorClipboardSync,
  shouldPreferInternalEditorClipboard,
  syncInternalEditorClipboard,
} from './internal-editor-clipboard';

afterEach(() => {
  resetInternalEditorClipboardSync();
  vi.unstubAllGlobals();
});

describe('internal editor clipboard synchronization', () => {
  it('keeps an internal copy authoritative when the native clipboard cannot be replaced', () => {
    vi.stubGlobal('navigator', {});
    syncInternalEditorClipboard('Rectangle');

    expect(shouldPreferInternalEditorClipboard(true)).toBe(true);
  });

  it('recognizes a later native image after synchronizing the internal copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    syncInternalEditorClipboard('Rectangle');
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Beam — Rectangle');
    expect(shouldPreferInternalEditorClipboard(true)).toBe(false);
    expect(shouldPreferInternalEditorClipboard(true)).toBe(false);
  });
});
