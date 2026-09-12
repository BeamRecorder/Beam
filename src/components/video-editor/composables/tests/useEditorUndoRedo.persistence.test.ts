import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotHistory } from '~/media/shared/editor-history-types';
import { MAX_HISTORY_DEPTH, useEditorUndoRedo } from '../useEditorUndoRedo';

interface Snapshot {
  value: number;
  nested: { label: string };
}

const snapshot = (value: number): Snapshot => ({ value, nested: { label: `snapshot-${value}` } });

const mountHistory = (onRestoreSnapshot: (value: Snapshot) => void | Promise<void>, disabled?: () => boolean) => {
  let history!: ReturnType<typeof useEditorUndoRedo<Snapshot>>;
  const wrapper = mount(
    defineComponent({
      setup() {
        history = useEditorUndoRedo<Snapshot>({ onRestoreSnapshot, disabled });
        return () => null;
      },
    }),
  );
  return { history, wrapper };
};

describe('useEditorUndoRedo persistence', () => {
  afterEach(() => vi.useRealTimers());

  it('reopens serialized undo and redo stacks and keeps their ordering', async () => {
    let current = snapshot(0);
    const first = mountHistory((value) => {
      current = value;
    });
    first.history.initialize(current);
    first.history.commitNow(snapshot(1));
    first.history.commitNow(snapshot(2));
    await first.history.undo();
    expect(current).toEqual(snapshot(1));
    const saved = first.history.serialize();
    expect(saved).toEqual({ version: 1, undo: [snapshot(0), snapshot(1)], redo: [snapshot(2)] });
    first.wrapper.unmount();

    const reopened = mountHistory((value) => {
      current = value;
    });
    reopened.history.initialize(current, saved);
    expect(reopened.history.canUndo.value).toBe(true);
    expect(reopened.history.canRedo.value).toBe(true);

    await reopened.history.undo();
    expect(current).toEqual(snapshot(0));
    await reopened.history.redo();
    expect(current).toEqual(snapshot(1));
    await reopened.history.redo();
    expect(current).toEqual(snapshot(2));
    reopened.wrapper.unmount();
  });

  it('clones initialized, recorded, serialized, and restored snapshots', async () => {
    let current = snapshot(1);
    const restore = vi.fn((value: Snapshot) => {
      current = value;
    });
    const { history, wrapper } = mountHistory(restore);
    const initial = snapshot(1);
    history.initialize(initial);
    initial.nested.label = 'mutated after initialize';

    const next = snapshot(2);
    history.commitNow(next);
    next.nested.label = 'mutated after record';
    expect(history.undoStack.value).toEqual([snapshot(1), snapshot(2)]);

    const serialized = history.serialize();
    serialized.undo[0]!.nested.label = 'mutated serialized copy';
    expect(history.undoStack.value[0]).toEqual(snapshot(1));

    await history.undo();
    expect(current).toEqual(snapshot(1));
    expect(restore).toHaveBeenCalledOnce();
    const restoreArgument = restore.mock.calls[0]![0];
    restoreArgument.nested.label = 'mutated restore argument';
    expect(history.undoStack.value[0]).toEqual(snapshot(1));
    wrapper.unmount();
  });

  it.each([
    ['unknown version', { version: 2, undo: [snapshot(0), snapshot(1)], redo: [] }],
    ['empty undo stack', { version: 1, undo: [], redo: [] }],
    ['invalid redo container', { version: 1, undo: [snapshot(7)], redo: null }],
    ['stale current snapshot', { version: 1, undo: [snapshot(0)], redo: [] }],
    [
      'history over the depth limit',
      {
        version: 1,
        undo: Array.from({ length: MAX_HISTORY_DEPTH }, (_, value) => snapshot(value + 1)),
        redo: [snapshot(99)],
      },
    ],
  ])('ignores incompatible persisted history: %s', (_reason, candidate) => {
    const { history, wrapper } = mountHistory(() => undefined);
    const current = snapshot(7);
    history.initialize(current, candidate as unknown as SnapshotHistory<Snapshot>);

    expect(history.undoStack.value).toEqual([current]);
    expect(history.redoStack.value).toEqual([]);
    expect(history.serialize()).toEqual({ version: 1, undo: [current], redo: [] });
    wrapper.unmount();
  });

  it.each(['undo', 'redo'] as const)('preserves both stacks when %s restoration rejects', async (action) => {
    const restore = vi.fn<() => Promise<void>>().mockRejectedValue(new Error(`${action} failed`));
    const { history, wrapper } = mountHistory(restore as unknown as (value: Snapshot) => Promise<void>);
    const current = action === 'undo' ? snapshot(2) : snapshot(1);
    const persisted: SnapshotHistory<Snapshot> =
      action === 'undo'
        ? { version: 1, undo: [snapshot(1), snapshot(2)], redo: [] }
        : { version: 1, undo: [snapshot(0), snapshot(1)], redo: [snapshot(2)] };
    history.initialize(current, persisted);
    const before = history.serialize();

    await expect(history[action]()).rejects.toThrow(`${action} failed`);

    expect(history.serialize()).toEqual(before);
    expect(history.restoring.value).toBe(false);
    wrapper.unmount();
  });

  it('blocks overlapping restores until the active restoration settles', async () => {
    let finishRestore!: () => void;
    const restoreFinished = new Promise<void>((resolve) => {
      finishRestore = resolve;
    });
    const restore = vi.fn(() => restoreFinished);
    const { history, wrapper } = mountHistory(restore as unknown as (value: Snapshot) => Promise<void>);
    history.initialize(snapshot(1), { version: 1, undo: [snapshot(0), snapshot(1)], redo: [] });

    const firstRestore = history.undo();
    expect(history.restoring.value).toBe(true);
    expect(history.canUndo.value).toBe(false);
    expect(history.canRedo.value).toBe(false);
    history.commitNow(snapshot(3));
    history.recordSnapshot(snapshot(4), 250);
    expect(history.serialize()).toEqual({ version: 1, undo: [snapshot(0), snapshot(1)], redo: [] });
    await history.redo();
    expect(restore).toHaveBeenCalledOnce();

    finishRestore();
    await firstRestore;
    expect(history.restoring.value).toBe(false);
    expect(history.serialize()).toEqual({ version: 1, undo: [snapshot(0)], redo: [snapshot(1)] });
    wrapper.unmount();
  });

  it('does not enable history actions or keyboard shortcuts while disabled', async () => {
    const disabled = ref(true);
    const restore = vi.fn((_value: Snapshot) => undefined);
    const { history, wrapper } = mountHistory(restore, () => disabled.value);
    history.initialize(snapshot(1), {
      version: 1,
      undo: [snapshot(0), snapshot(1)],
      redo: [snapshot(2)],
    });

    expect(history.canUndo.value).toBe(false);
    expect(history.canRedo.value).toBe(false);
    await history.undo();
    await history.redo();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(restore).not.toHaveBeenCalled();

    disabled.value = false;
    expect(history.canUndo.value).toBe(true);
    expect(history.canRedo.value).toBe(true);
    await history.undo();
    expect(restore).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('ignores reserved key events and maps Ctrl+Shift+Z to redo', async () => {
    let current = snapshot(1);
    const restore = vi.fn((value: Snapshot) => {
      current = value;
    });
    const { history, wrapper } = mountHistory(restore);
    history.initialize(current, {
      version: 1,
      undo: [snapshot(0), snapshot(1)],
      redo: [snapshot(2)],
    });
    const dispatch = (options: KeyboardEventInit & { composing?: boolean; prePrevented?: boolean }) => {
      const { composing, prePrevented, ...init } = options;
      const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
      if (typeof composing === 'boolean') Object.defineProperty(event, 'isComposing', { value: composing });
      if (prePrevented) event.preventDefault();
      window.dispatchEvent(event);
      return event;
    };

    const reservedEvents = [
      dispatch({ key: 'z', ctrlKey: true, prePrevented: true }),
      dispatch({ key: 'z', ctrlKey: true, composing: true }),
      dispatch({ key: 'z', ctrlKey: true, altKey: true }),
      dispatch({ key: 'z' }),
      dispatch({ key: 'x', ctrlKey: true }),
    ];
    expect(reservedEvents.map((event) => event.defaultPrevented)).toEqual([true, false, false, false, false]);
    expect(restore).not.toHaveBeenCalled();

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    document.body.append(editable);
    editable.focus();
    expect(document.activeElement).toBe(editable);
    dispatch({ key: 'z', ctrlKey: true });
    editable.remove();

    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    dispatch({ key: 'z', ctrlKey: true });
    modal.remove();
    expect(restore).not.toHaveBeenCalled();

    const redoEvent = dispatch({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(redoEvent.defaultPrevented).toBe(true);
    expect(history.redoStack.value).toEqual([snapshot(2)]);
    await flushPromises();
    expect(restore).toHaveBeenCalledWith(snapshot(2));
    expect(current).toEqual(snapshot(2));
    expect(restore).toHaveBeenCalledOnce();
    expect(history.lastAction.value?.type).toBe('redo');
    wrapper.unmount();
  });

  it('leaves both stacks unchanged when there is no state to undo or redo', async () => {
    const restore = vi.fn((_value: Snapshot) => undefined);
    const { history, wrapper } = mountHistory(restore);
    history.initialize(snapshot(0));

    await history.undo();
    await history.redo();

    expect(restore).not.toHaveBeenCalled();
    expect(history.undoStack.value).toEqual([snapshot(0)]);
    expect(history.redoStack.value).toEqual([]);
    expect(history.lastAction.value).toBeNull();
    wrapper.unmount();
  });

  it('enables undo for a pending debounced snapshot and flushes it before serialization', () => {
    vi.useFakeTimers();
    const { history, wrapper } = mountHistory(() => undefined);
    history.initialize(snapshot(0));
    expect(history.canUndo.value).toBe(false);

    history.recordSnapshot(snapshot(1), 500);

    expect(history.canUndo.value).toBe(true);
    expect(history.serialize()).toEqual({ version: 1, undo: [snapshot(0), snapshot(1)], redo: [] });
    expect(history.canUndo.value).toBe(true);
    wrapper.unmount();
  });
});
