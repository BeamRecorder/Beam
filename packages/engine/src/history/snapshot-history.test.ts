// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSnapshotHistory, MAX_HISTORY_DEPTH } from './snapshot-history';

describe('headless snapshot history', () => {
  it('copies caller-owned state, coalesces identical snapshots and copies serialization', () => {
    const history = createSnapshotHistory({ onRestoreSnapshot: vi.fn() });
    const first = { count: 0 };
    history.initialize(first);
    first.count = 99;
    history.record({ count: 0 });
    expect(history.state.undo).toEqual([{ count: 0 }]);
    history.record({ count: 1 });
    const saved = history.serialize();
    saved.undo[0] = {};
    expect(history.state.undo).toEqual([{ count: 0 }, { count: 1 }]);
  });
  it('retains exactly the bounded history depth', () => {
    const history = createSnapshotHistory({ onRestoreSnapshot: vi.fn() });
    history.initialize({ count: 0 });
    for (let count = 1; count <= 60; count++) history.record({ count });
    expect(history.state.undo).toHaveLength(MAX_HISTORY_DEPTH);
    expect(history.state.undo[0]).toEqual({ count: 11 });
  });
  it('transfers persisted history but still copies restored snapshots', async () => {
    const saved = { version: 1 as const, undo: [{ count: 0 }, { count: 1 }], redo: [] };
    const restore = vi.fn((state: { count: number }) => {
      state.count = 77;
    });
    const history = createSnapshotHistory({ onRestoreSnapshot: restore });
    history.initialize({ count: 1 }, saved, 'transfer');
    expect(history.state.undo).toBe(saved.undo);
    await history.undo();
    expect(saved.undo[0]?.count).toBe(0);
    expect(history.state.lastAction?.type).toBe('undo');
    await history.redo();
    expect(history.state.lastAction?.type).toBe('redo');
  });
  it('copies valid saved history by default', () => {
    const saved = { version: 1 as const, undo: [{ count: 0 }, { count: 1 }], redo: [{ count: 2 }] };
    const history = createSnapshotHistory({ onRestoreSnapshot: vi.fn() });
    history.initialize({ count: 1 }, saved);
    expect(history.state.undo).not.toBe(saved.undo);
    expect(history.state.redo).toEqual(saved.redo);
  });
  it('rejects unusable persisted history and resets last action', () => {
    const history = createSnapshotHistory({ onRestoreSnapshot: vi.fn() });
    history.initialize({ count: 1 }, { version: 1, undo: [{ count: 0 }], redo: [] });
    expect(history.state.undo).toEqual([{ count: 1 }]);
    expect(history.state.lastAction).toBeNull();
  });
  it('does not mutate stacks when restoration fails', async () => {
    const history = createSnapshotHistory({
      onRestoreSnapshot: () => {
        throw new Error('restore failed');
      },
    });
    history.initialize({ count: 0 });
    history.record({ count: 1 });
    await expect(history.undo()).rejects.toThrow('restore failed');
    expect(history.state.restoring).toBe(false);
    expect(history.state.undo).toHaveLength(2);
    expect(history.state.redo).toEqual([]);
  });
  it('blocks edits and concurrent restoration during an async restore', async () => {
    let finish!: () => void;
    const history = createSnapshotHistory({
      onRestoreSnapshot: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    history.initialize({ count: 0 });
    history.record({ count: 1 });
    const pending = history.undo();
    history.record({ count: 2 });
    await history.redo();
    expect(() => history.initialize({ count: 3 })).toThrow('restoration');
    expect(history.state.undo).toHaveLength(2);
    finish();
    await pending;
  });
  it('ignores unavailable actions and respects disabled hosts', async () => {
    const restore = vi.fn();
    const history = createSnapshotHistory({ onRestoreSnapshot: restore, disabled: () => true });
    await history.undo();
    history.initialize({ count: 0 });
    history.record({ count: 1 });
    await history.undo();
    expect(restore).not.toHaveBeenCalled();
    const empty = createSnapshotHistory({ onRestoreSnapshot: restore });
    await empty.redo();
    await empty.undo();
    expect(restore).not.toHaveBeenCalled();
  });
  it('discards redo on a new branch and detaches change listeners', async () => {
    const history = createSnapshotHistory({ onRestoreSnapshot: vi.fn() });
    const listener = vi.fn();
    const stop = history.subscribe(listener);
    history.initialize({ count: 0 });
    history.record({ count: 1 });
    await history.undo();
    expect(history.state.redo).toHaveLength(1);
    stop();
    const calls = listener.mock.calls.length;
    history.record({ count: 2 });
    expect(history.state.redo).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
