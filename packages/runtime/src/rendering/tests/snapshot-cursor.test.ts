import { describe, expect, it } from 'vitest';
import { snapshotWithScreenCursor, snapshotCursorImageKey, snapshotCursorMotion } from '../snapshot-cursor';
import { snapshot } from './render.test-support';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import type { VisualClip } from '@beam/engine/shared/composition-types';

function fixture() {
  const value = snapshot(),
    clip = value.composition.clips[0] as VisualClip;
  const { enabled: _, ...style } = createDefaultCursorPresentation();
  clip.cursorSettings = { ...style, size: 80, color: '#ff0000', selection: { ...style.selection, packId: 'other' } };
  value.cursorPacks = [{ ...value.cursorPack!, id: 'other' }];
  return { value, clip };
}
describe('clip-specific cursor render resources', () => {
  it('resolves the clip’s presentation and pack without changing the project baseline', () => {
    const { value, clip } = fixture(),
      next = snapshotWithScreenCursor(value, clip);
    expect(next.cursorSettings).toMatchObject({ size: 80, color: '#ff0000' });
    expect(next.cursorPack?.id).toBe('other');
    expect(value.cursorSettings.size).toBe(24);
    expect(snapshotWithScreenCursor(next, clip)).toBe(next);
  });
  it('scales only preview rasterization and never scales the export cursor a second time', () => {
    const { value, clip } = fixture(),
      preview = snapshotWithScreenCursor(value, clip, 0.5);
    expect(preview.cursorSettings.size).toBe(40);
    expect(snapshotWithScreenCursor(preview, clip).cursorSettings.size).toBe(40);
    expect(snapshotWithScreenCursor(value, clip).cursorSettings.size).toBe(80);
  });
  it('supports temporary artwork previews while retaining the clip’s color and effects', () => {
    const { value, clip } = fixture(),
      next = snapshotWithScreenCursor(value, clip, 1, value.cursorSettings.selection);
    expect(next.cursorPack).toBe(value.cursorPack);
    expect(next.cursorSettings.color).toBe('#ff0000');
  });
  it('keeps missing packs explicit instead of substituting different artwork', () => {
    const { value, clip } = fixture();
    value.cursorPacks = [];
    expect(snapshotWithScreenCursor(value, clip).cursorPack).toBeNull();
    delete clip.cursorSettings;
    expect(snapshotWithScreenCursor(value, clip)).toBe(value);
  });
  it('namespaces per-clip artwork and retains unqualified resources for the project presentation', () => {
    const { value, clip } = fixture(),
      next = snapshotWithScreenCursor(value, clip);
    expect(snapshotCursorImageKey(next, clip, 'default')).toBe('["other","default","#ff0000"]');
    delete clip.cursorSettings;
    expect(snapshotCursorImageKey(value, clip, 'default')).toBe('default');
  });
  it('reuses deterministic motion for equal settings but separates dimensions and different smoothing', () => {
    const { value, clip } = fixture(),
      next = snapshotWithScreenCursor(value, clip),
      first = snapshotCursorMotion(next, 100, 50);
    expect(snapshotCursorMotion(snapshotWithScreenCursor(value, clip), 100, 50)).toBe(first);
    expect(snapshotCursorMotion(next, 200, 100)).not.toBe(first);
    const alternate = {
      ...next,
      cursorSettings: { ...next.cursorSettings, motion: { ...next.cursorSettings.motion, smoothing: 0 } },
    };
    expect(snapshotCursorMotion(alternate, 100, 50)).not.toBe(first);
  });
  it('invalidates motion for replacement telemetry or hover analysis and bounds retained players', () => {
    const { value } = fixture();
    const first = snapshotCursorMotion(value, 100, 50);
    value.cursor = { ...value.cursor, events: [...value.cursor.events] };
    expect(snapshotCursorMotion(value, 100, 50)).not.toBe(first);
    const current = snapshotCursorMotion(value, 100, 50);
    for (let i = 0; i < 25; i++) snapshotCursorMotion(value, 200 + i, 100);
    expect(snapshotCursorMotion(value, 100, 50)).not.toBe(current);
  });
});
