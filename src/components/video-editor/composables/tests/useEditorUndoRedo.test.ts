import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorUndoRedo, type EditorStateSnapshot } from '../useEditorUndoRedo';

const snapshot = (value: number): EditorStateSnapshot =>
  ({
    composition: { assets: [], clips: [{ id: `clip-${value}`, value }] },
    zoomElements: [],
    outputCanvas: {
      preset: '16:9',
      width: 1920,
      height: 1080,
      showBackground: false,
    },
    selectedBackground: null,
    backgroundBlurPercent: value,
  }) as unknown as EditorStateSnapshot;

const zoomAutoFollowSnapshot = (safeZone: number): EditorStateSnapshot => ({
  ...snapshot(safeZone),
  zoomAutoFollow: { safeZone, responsiveness: 0.55, directionLock: true },
});

describe('useEditorUndoRedo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('records snapshots, ignores duplicates, restores undo and redo states', async () => {
    const restored: unknown[] = [];
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: (value) => {
            restored.push(value);
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    const first = snapshot(1);
    const second = snapshot(2);
    api.recordSnapshot(first);
    api.recordSnapshot(first);
    api.recordSnapshot(second);
    expect(api.undoStack.value).toHaveLength(2);
    expect(api.canUndo.value).toBe(true);
    await api.undo();
    expect(restored).toHaveLength(1);
    expect(api.lastAction.value?.type).toBe('undo');
    expect(api.canRedo.value).toBe(true);
    await api.redo();
    expect(restored).toHaveLength(2);
    expect(api.lastAction.value?.type).toBe('redo');
    wrapper.unmount();
  });

  it('restores zoom auto-follow settings through undo and redo', async () => {
    const restored: EditorStateSnapshot[] = [];
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: (value) => {
            restored.push(value);
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(zoomAutoFollowSnapshot(0.5));
    api.recordSnapshot(zoomAutoFollowSnapshot(0.35));

    await api.undo();
    expect(restored[0]?.zoomAutoFollow).toEqual({ safeZone: 0.5, responsiveness: 0.55, directionLock: true });

    await api.redo();
    expect(restored[1]?.zoomAutoFollow).toEqual({ safeZone: 0.35, responsiveness: 0.55, directionLock: true });
    wrapper.unmount();
  });

  it('releases the restoring guard when undo restoration rejects', async () => {
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: async () => {
            throw new Error('undo restore failed');
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(1));
    api.recordSnapshot(snapshot(2));

    await expect(api.undo()).rejects.toThrow('undo restore failed');

    api.recordSnapshot(snapshot(3));
    expect(api.undoStack.value.at(-1)?.backgroundBlurPercent).toBe(3);
    expect(api.redoStack.value).toHaveLength(0);
    wrapper.unmount();
  });

  it('releases the restoring guard when redo restoration rejects', async () => {
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const restore = vi
      .fn<() => void>()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('redo restore failed');
      });
    const Harness = defineComponent({
      setup: () => ((api = useEditorUndoRedo({ onRestoreSnapshot: restore })), {}),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(1));
    api.recordSnapshot(snapshot(2));

    await api.undo();
    await expect(api.redo()).rejects.toThrow('redo restore failed');

    api.recordSnapshot(snapshot(3));
    expect(api.undoStack.value.at(-1)?.backgroundBlurPercent).toBe(3);
    expect(api.redoStack.value).toHaveLength(0);
    wrapper.unmount();
  });

  it('flushes pending debounced snapshots on undo/redo before rolling back', async () => {
    const restored: unknown[] = [];
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: (value) => {
            restored.push(value);
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(1));
    api.recordSnapshot(snapshot(2), 300);
    expect(api.undoStack.value).toHaveLength(1);
    await api.undo();
    expect(restored).toHaveLength(1);
    expect(api.lastAction.value?.type).toBe('undo');
    expect(api.canRedo.value).toBe(true);
    wrapper.unmount();
  });

  it('debounces records, cancels pending work and keeps the history bounded', () => {
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => ((api = useEditorUndoRedo({ onRestoreSnapshot: () => undefined })), {}),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(0), 100);
    api.recordSnapshot(snapshot(1), 100);
    vi.advanceTimersByTime(99);
    expect(api.undoStack.value).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(api.undoStack.value).toHaveLength(1);
    for (let value = 2; value <= 55; value++) api.recordSnapshot(snapshot(value));
    expect(api.undoStack.value).toHaveLength(50);
    wrapper.unmount();
  });

  it('lazily resolves only the latest debounced factory and flushes it on undo', async () => {
    const restored: unknown[] = [];
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: (value) => {
            restored.push(value);
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);

    api.recordSnapshot(snapshot(0));
    const firstFactory = vi.fn(() => snapshot(1));
    const secondFactory = vi.fn(() => snapshot(2));
    api.recordSnapshot(firstFactory, 300);
    api.recordSnapshot(secondFactory, 300);
    expect(firstFactory).not.toHaveBeenCalled();
    expect(secondFactory).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(firstFactory).not.toHaveBeenCalled();
    expect(secondFactory).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(firstFactory).not.toHaveBeenCalled();
    expect(secondFactory).toHaveBeenCalledTimes(1);
    expect(api.undoStack.value.at(-1)?.backgroundBlurPercent).toBe(2);

    const flushedFactory = vi.fn(() => snapshot(3));
    api.recordSnapshot(flushedFactory, 300);
    expect(flushedFactory).not.toHaveBeenCalled();
    await api.undo();
    expect(flushedFactory).toHaveBeenCalledTimes(1);
    expect(restored).toHaveLength(1);
    expect((restored[0] as ReturnType<typeof snapshot>).backgroundBlurPercent).toBe(2);

    api.commitNow(snapshot(4));
    expect(api.undoStack.value.at(-1)?.backgroundBlurPercent).toBe(4);
    wrapper.unmount();
  });

  it('maps Ctrl/Cmd shortcuts and ignores editable fields', async () => {
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => ((api = useEditorUndoRedo({ onRestoreSnapshot: () => undefined })), {}),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(1));
    api.recordSnapshot(snapshot(2));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await Promise.resolve();
    expect(api.lastAction.value?.type).toBe('undo');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
    await Promise.resolve();
    expect(api.lastAction.value?.type).toBe('redo');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(api.lastAction.value?.type).toBe('redo');
    input.remove();
    wrapper.unmount();
  });

  it('keeps undo shortcuts active for a focused range input while ignoring other inputs', async () => {
    const restored: EditorStateSnapshot[] = [];
    let api!: ReturnType<typeof useEditorUndoRedo>;
    const Harness = defineComponent({
      setup: () => (
        (api = useEditorUndoRedo({
          onRestoreSnapshot: (value) => {
            restored.push(value);
          },
        })),
        {}
      ),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    api.recordSnapshot(snapshot(1));
    api.recordSnapshot(snapshot(2));

    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    range.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await Promise.resolve();

    expect(restored).toHaveLength(1);
    expect(api.lastAction.value?.type).toBe('undo');

    api.recordSnapshot(snapshot(3));
    const number = document.createElement('input');
    number.type = 'number';
    document.body.appendChild(number);
    number.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await Promise.resolve();

    expect(restored).toHaveLength(1);
    expect(api.undoStack.value.at(-1)?.backgroundBlurPercent).toBe(3);
    number.remove();
    range.remove();
    wrapper.unmount();
  });
});
