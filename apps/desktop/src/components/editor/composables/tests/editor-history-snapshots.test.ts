import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { createEditorHistorySnapshots } from '../editor-history-snapshots';
import type { EditorStateSnapshot } from '../editor-history-types';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createSnapshotHistory } from '@beam/engine/history/snapshot-history';
import { existingZoom } from './useProjectEditorState.test-support';

const fixture = (): EditorStateSnapshot => ({
  composition: emptyComposition(),
  zoomElements: [structuredClone(existingZoom)],
  outputCanvas: structuredClone(DEFAULT_OUTPUT_CANVAS),
  selectedBackground: null,
  backgroundBlurPercent: 0,
});

describe('editor history snapshot ownership', () => {
  it('undoes and redoes visible zoom bounds with their independent transition timing', async () => {
    const snapshots = createEditorHistorySnapshots();
    let live = fixture();
    live.zoomElements[0]!.timing = { version: 1, entryMs: 823, exitMs: 823 };
    const history = createSnapshotHistory<EditorStateSnapshot>({
      immutable: true,
      onRestoreSnapshot: (snapshot) => {
        live = snapshots.restore(snapshot);
      },
    });
    history.record(snapshots.capture(live));
    const original = { ...live.zoomElements[0]!, timing: { ...live.zoomElements[0]!.timing } };
    live.zoomElements[0]!.endMs += 1000;
    live.zoomElements[0]!.timing!.exitMs = 400;
    history.record(snapshots.capture(live));
    await history.undo();
    expect(live.zoomElements[0]).toEqual(original);
    await history.redo();
    expect(live.zoomElements[0]!.endMs).toBe(original.endMs + 1000);
    expect(live.zoomElements[0]!.timing!.exitMs).toBe(400);
    expect(original.timing.exitMs).toBe(823);
  });
  it('owns all scope modes and restores editable copies without modifying document settings', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    input.trackPropertyScopes = { clipTracks: ['screen', 'camera'], cursorTracks: ['screen'], zoom: true };
    const first = snapshots.capture(input),
      restored = snapshots.restore(first);
    expect(first.trackPropertyScopes).toEqual(input.trackPropertyScopes);
    expect(restored.trackPropertyScopes).not.toBe(first.trackPropertyScopes);
    restored.trackPropertyScopes!.zoom = false;
    expect(first.trackPropertyScopes!.zoom).toBe(true);
    const unchecked = snapshots.capture({
      ...input,
      trackPropertyScopes: { clipTracks: [], cursorTracks: [], zoom: false },
    });
    expect(unchecked).not.toBe(first);
    expect(unchecked.composition).toBe(first.composition);
  });
  it('shares and freezes composition without serializing it on each property edit', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    const serialize = vi.fn(() => {
      throw new Error('Composition serialized');
    });
    Object.assign(input.composition, { toJSON: serialize });
    const first = snapshots.capture(input);
    const second = snapshots.capture({ ...input, backgroundBlurPercent: 20 });
    expect(first.composition).toBe(input.composition);
    expect(second.composition).toBe(first.composition);
    expect(Object.isFrozen(first.composition.assets)).toBe(true);
    expect(serialize).not.toHaveBeenCalled();
    expect(() => first.composition.clips.push({} as never)).toThrow();
  });
  it('owns nested mutable controls without freezing their live inputs', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    const first = snapshots.capture(input);
    input.zoomElements[0]!.focus.cx = 0.9;
    input.outputCanvas.watermark!.customText = 'Changed';
    expect(first.zoomElements[0]!.focus.cx).toBe(0.35);
    expect(first.outputCanvas.watermark!.customText).toBe('');
    const next = snapshots.capture(input);
    expect(next).not.toBe(first);
    expect(next.zoomElements[0]!.focus.cx).toBe(0.9);
    expect(Object.isFrozen(first.zoomElements[0]!.focus)).toBe(true);
    expect(Object.isFrozen(input.zoomElements[0]!.focus)).toBe(false);
  });
  it('deduplicates equal controls but observes a replacement composition', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    const first = snapshots.capture(input);
    expect(snapshots.capture({ ...input, outputCanvas: structuredClone(input.outputCanvas) })).toBe(first);
    expect(snapshots.capture({ ...input, composition: { ...input.composition } })).toBe(first);
    const next = snapshots.capture({ ...input, composition: { ...input.composition, durationMs: 5000 } });
    expect(next).not.toBe(first);
    expect(snapshots.capture({ ...input, composition: next.composition })).toBe(next);
  });
  it('unwraps a reactive document and does not retain mutable reactive controls', () => {
    const snapshots = createEditorHistorySnapshots(),
      raw = fixture(),
      input = reactive(raw);
    const captured = snapshots.capture(input);
    expect(captured.composition).toBe(raw.composition);
    input.zoomElements[0]!.focus.cy = 0.1;
    expect(captured.zoomElements[0]!.focus.cy).toBe(0.65);
  });
  it('restores fresh editable controls and rebases deduplication after undo and redo', async () => {
    const snapshots = createEditorHistorySnapshots();
    let live = fixture();
    const history = createSnapshotHistory<EditorStateSnapshot>({
      immutable: true,
      onRestoreSnapshot(snapshot) {
        live = snapshots.restore(snapshot);
      },
    });
    const first = snapshots.capture(live);
    history.record(first);
    live = { ...live, backgroundBlurPercent: 50 };
    const second = snapshots.capture(live);
    history.record(second);
    await history.undo();
    expect(live.backgroundBlurPercent).toBe(0);
    expect(snapshots.capture(live)).toBe(first);
    history.record(snapshots.capture(live));
    expect(history.state.redo).toHaveLength(1);
    live.zoomElements[0]!.focus.cx = 0.8;
    expect(first.zoomElements[0]!.focus.cx).toBe(0.35);
    await history.redo();
    expect(live.backgroundBlurPercent).toBe(50);
    expect(live.zoomElements[0]!.focus.cx).toBe(0.35);
    expect(snapshots.capture(live)).toBe(second);
    expect(Object.isFrozen(live.outputCanvas)).toBe(false);
  });
  it('supports restoring optional controls and a new history branch without changing older entries', () => {
    const snapshots = createEditorHistorySnapshots(),
      first = snapshots.capture(fixture());
    const restored = snapshots.restore(first);
    restored.zoomElements = [];
    restored.selectedBackground = { id: 'color', name: 'Color', kind: 'color', color: '#000000' };
    const next = snapshots.capture(restored);
    expect(next.zoomElements).toEqual([]);
    expect(first.zoomElements).toHaveLength(1);
    expect(first.selectedBackground).toBeNull();
    expect(next.composition).toBe(first.composition);
  });
  it('coalesces semantically unchanged document replacements without losing redo', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    const first = snapshots.capture(input);
    const duplicate = { ...input, composition: structuredClone(input.composition) };
    expect(snapshots.capture(duplicate)).toBe(first);
    const added = {
      ...input,
      composition: { ...input.composition, clips: [colorClip('caption')] },
    };
    const next = snapshots.capture(added);
    expect(next).not.toBe(first);
    expect(
      snapshots.capture({
        ...added,
        composition: { ...added.composition, clips: [...added.composition.clips].map((c) => ({ ...c })) },
      }),
    ).toBe(next);
    expect(
      snapshots.capture({
        ...added,
        composition: { ...added.composition, clips: added.composition.clips.map((c) => ({ ...c, name: 'Changed' })) },
      }),
    ).not.toBe(next);
  });
  it('detects source and scene changes while sharing unchanged records in other snapshots', () => {
    const snapshots = createEditorHistorySnapshots(),
      input = fixture();
    input.composition.assets = [
      {
        id: 'a',
        src: 'a.mp4',
        kind: 'video',
        name: 'A',
        fileName: 'a.mp4',
        durationMs: 1000,
        width: 1920,
        height: 1080,
        origin: 'project',
      },
    ];
    const first = snapshots.capture(input);
    const copied = {
      ...input,
      composition: { ...input.composition, assets: input.composition.assets.map((asset) => ({ ...asset })) },
    };
    expect(snapshots.capture(copied)).toBe(first);
    const replaced = {
      ...input,
      composition: {
        ...input.composition,
        assets: input.composition.assets.map((asset) => ({ ...asset, src: 'b.mp4' })),
      },
    };
    const next = snapshots.capture(replaced);
    expect(next).not.toBe(first);
    expect(
      snapshots.capture({
        ...replaced,
        composition: { ...replaced.composition, scene: { version: 1, roots: [], groups: [] } },
      }),
    ).not.toBe(next);
    expect(snapshots.capture({ ...input, composition: { ...input.composition, assets: [] } })).not.toBe(first);
  });
});
