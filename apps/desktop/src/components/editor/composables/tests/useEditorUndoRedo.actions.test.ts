import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useEditorUndoRedo } from '../useEditorUndoRedo';

const mountHistory = (restore = (_snapshot: { name: string }) => {}) => {
  let history!: ReturnType<typeof useEditorUndoRedo<{ name: string }>>;
  const wrapper = mount(
    defineComponent({
      setup() {
        history = useEditorUndoRedo({ onRestoreSnapshot: restore });
        return () => null;
      },
    }),
  );
  return { wrapper, history };
};

describe('history action snapshots', () => {
  it('keeps the original edit direction for undo and redo', async () => {
    const { history, wrapper } = mountHistory();
    history.initialize({ name: 'Before' });
    history.commitNow({ name: 'After' });
    await history.undo();
    expect(history.lastAction.value?.snapshots).toEqual({
      before: { name: 'Before' },
      after: { name: 'After' },
    });
    await history.redo();
    expect(history.lastAction.value?.snapshots).toEqual({
      before: { name: 'Before' },
      after: { name: 'After' },
    });
    wrapper.unmount();
  });

  it('describes hydrated redo history and clears the action on initialization', async () => {
    const { history, wrapper } = mountHistory();
    history.initialize({ name: 'Before' }, { version: 1, undo: [{ name: 'Before' }], redo: [{ name: 'After' }] });
    await history.redo();
    expect(history.lastAction.value?.snapshots).toEqual({
      before: { name: 'Before' },
      after: { name: 'After' },
    });
    expect(history.serialize()).toEqual({
      version: 1,
      undo: [{ name: 'Before' }, { name: 'After' }],
      redo: [],
    });
    history.initialize({ name: 'New project' });
    expect(history.lastAction.value).toBeNull();
    wrapper.unmount();
  });

  it('flushes a pending edit before identifying the action', async () => {
    const { history, wrapper } = mountHistory();
    history.initialize({ name: 'Before' });
    history.recordSnapshot({ name: 'After' }, 1000);
    await history.undo();
    expect(history.lastAction.value?.snapshots).toEqual({
      before: { name: 'Before' },
      after: { name: 'After' },
    });
    wrapper.unmount();
  });

  it('does not announce a failed restoration', async () => {
    const { history, wrapper } = mountHistory(
      vi.fn(() => {
        throw new Error('failed');
      }),
    );
    history.initialize({ name: 'Before' });
    history.commitNow({ name: 'After' });
    await expect(history.undo()).rejects.toThrow('failed');
    expect(history.lastAction.value).toBeNull();
    wrapper.unmount();
  });
});
