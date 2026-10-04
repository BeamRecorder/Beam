import { describe, expect, it } from 'vitest';
import { localizedCursorLabel } from '../cursor-labels';
import { MACOS_CURSOR_PACK, BUNDLED_CURSOR_PACKS } from '../cursor-packs';
const translate = (key: string, params?: Record<string, string>) => `${key}${params ? `:${params.direction}` : ''}`;
describe('localized builtin cursor artwork', () => {
  it('labels all macOS cursor roles and resize directions without exposing file names', () => {
    for (const cursor of MACOS_CURSOR_PACK.cursors)
      expect(localizedCursorLabel(MACOS_CURSOR_PACK, cursor, translate)).toMatch(
        /^cursor(Labels\.|Resize:cursorDirections\.)/,
      );
  });
  it('maps builtin asset identities through their real automatic roles', () => {
    const pack = { ...MACOS_CURSOR_PACK, automaticMap: { handpointing: 'asset-1' } };
    expect(localizedCursorLabel(pack, { ...pack.cursors[0]!, id: 'asset-1' }, translate)).toBe(
      'cursorLabels.handpointing',
    );
    for (const pack of BUNDLED_CURSOR_PACKS)
      for (const cursor of pack.cursors) expect(localizedCursorLabel(pack, cursor, translate)).toBeTruthy();
  });
  it('preserves custom pack labels and unknown builtin artwork names', () => {
    const asset = { ...MACOS_CURSOR_PACK.cursors[0]!, id: 'custom', label: 'Artist cursor' };
    expect(localizedCursorLabel({ ...MACOS_CURSOR_PACK, source: 'imported' }, asset, translate)).toBe(asset.label);
    expect(localizedCursorLabel(MACOS_CURSOR_PACK, asset, translate)).toBe(asset.label);
  });
});
