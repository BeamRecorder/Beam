import { describe, expect, it } from 'vitest';
import type { LockableTimelineItem } from '../../composition/timeline-lock-types';
import { useLockedState } from '../useLockedState';

interface TestItem extends LockableTimelineItem {
  label: string;
}

interface TestState {
  items: TestItem[];
  revision: number;
}

const item = (id: string, label = id, overrides: Partial<Pick<TestItem, 'locked' | 'order'>> = {}): TestItem => ({
  id,
  label,
  order: 0,
  ...overrides,
});

const lockedState = () => {
  const locked = item('locked', 'Protected content', { locked: true, order: 1 });
  const free = item('free', 'Editable content', { order: 2 });
  const initial: TestState = { items: [locked, free], revision: 1 };
  return { initial, locked, free, ...useLockedState(initial, (state) => state.items) };
};

describe('useLockedState', () => {
  it('blocks ordinary edits and deletion of locked items', () => {
    const { initial, locked, free, state } = lockedState();

    state.value = {
      revision: 2,
      items: [{ ...locked, label: 'Changed protected content' }, free],
    };
    expect(state.value).toBe(initial);

    state.value = { revision: 3, items: [free] };
    expect(state.value).toBe(initial);
  });

  it('allows lock-only changes, order renumbering, and unrelated edits', () => {
    const { initial, locked, free, state } = lockedState();
    const next: TestState = {
      revision: 2,
      items: [
        { ...locked, locked: false, order: 8 },
        { ...free, label: 'Updated editable content', order: 9 },
      ],
    };

    state.value = next;

    expect(state.value).toBe(next);
    expect(state.value.items).toEqual(next.items);
    expect(state.value).not.toBe(initial);
  });

  it('restores undo and project-load state without applying the ordinary lock guard', () => {
    const { initial, locked, state, restore } = lockedState();
    const loaded: TestState = {
      revision: 20,
      items: [{ ...locked, label: 'Loaded replacement', locked: false }],
    };

    state.value = loaded;
    expect(state.value).toBe(initial);

    restore(loaded);
    expect(state.value).toBe(loaded);

    const undoState: TestState = { revision: 19, items: [] };
    restore(undoState);
    expect(state.value).toBe(undoState);
  });

  it('updates an unprotected state through the ordinary setter', () => {
    const initial: TestState = { revision: 1, items: [item('free')] };
    const { state } = useLockedState(initial, (value) => value.items);
    const next: TestState = { revision: 2, items: [{ ...initial.items[0]!, label: 'Updated' }] };

    state.value = next;

    expect(state.value).toBe(next);
  });

  it('applies an additional state-level preservation guard when provided', () => {
    interface AssetState {
      assets: Array<{ id: string; checksum: string }>;
      items: TestItem[];
      revision: number;
    }
    const initial: AssetState = {
      assets: [{ id: 'asset', checksum: 'original' }],
      items: [item('locked', 'Protected content', { locked: true })],
      revision: 1,
    };
    const { state } = useLockedState(
      initial,
      (value) => value.items,
      (before, after) => JSON.stringify(before.assets) === JSON.stringify(after.assets),
    );

    state.value = { ...initial, assets: [{ id: 'asset', checksum: 'changed' }] };
    expect(state.value).toBe(initial);

    const metadataUpdate = { ...initial, revision: 2 };
    state.value = metadataUpdate;
    expect(state.value).toBe(metadataUpdate);
  });
});
