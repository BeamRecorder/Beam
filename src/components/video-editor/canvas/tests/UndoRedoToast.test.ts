import { mount } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import UndoRedoToast from '../UndoRedoToast.vue';
import { setCurrentLocale } from '~/i18n';
import { historyClip, videoSnapshot } from '../../composables/tests/history-description-fixtures';
import type { HistoryAction } from '../../composables/editor-history-types';

const imageAction = (type: HistoryAction['type'] = 'undo'): HistoryAction => {
  const before = videoSnapshot();
  const after = structuredClone(before);
  after.composition.clips.push(historyClip());
  return { type, timestamp: 1, snapshots: { before, after } };
};

describe('UndoRedoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows undo and redo messages and dismisses the current action', async () => {
    const wrapper = mount(UndoRedoToast, { props: { action: null } });
    await wrapper.setProps({ action: { type: 'undo', timestamp: 1 } });
    expect(wrapper.get('[role="status"]').text()).toContain('Undo');
    await wrapper.setProps({ action: { type: 'redo', timestamp: 2 } });
    expect(wrapper.get('[role="status"]').text()).toContain('Redo');
    vi.advanceTimersByTime(1500);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the action and item name for undo and redo', async () => {
    const wrapper = mount(UndoRedoToast, { props: { action: imageAction() } });
    expect(wrapper.get('[role="status"]').text()).toBe('Undone: Add · Image “demo.png”');
    await wrapper.setProps({ action: imageAction('redo') });
    expect(wrapper.get('[role="status"]').text()).toBe('Redone: Add · Image “demo.png”');
    wrapper.unmount();
  });

  it('updates the whole description when the language changes', async () => {
    const wrapper = mount(UndoRedoToast, { props: { action: imageAction() } });
    await setCurrentLocale('fr');
    expect(wrapper.get('[role="status"]').text()).toBe('Annulé : Ajout · Image “demo.png”');
    wrapper.unmount();
  });

  it('uses translated kinds for unnamed items and a count for grouped edits', async () => {
    const action = imageAction();
    const after = action.snapshots!.after as ReturnType<typeof videoSnapshot>;
    after.composition.clips = [historyClip('color')];
    const wrapper = mount(UndoRedoToast, { props: { action } });
    expect(wrapper.get('[role="status"]').text()).toBe('Undone: Add · Color');
    after.composition.clips.push(historyClip('color', 'other'));
    await wrapper.setProps({ action: { ...action, timestamp: 2 } });
    expect(wrapper.get('[role="status"]').text()).toBe('Undone: Add · 2 items');
    wrapper.unmount();
  });

  it('restarts dismissal for rapid actions and releases its timer on unmount', async () => {
    const wrapper = mount(UndoRedoToast, { props: { action: imageAction() } });
    vi.advanceTimersByTime(1000);
    await wrapper.setProps({ action: imageAction('redo') });
    vi.advanceTimersByTime(500);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="status"]').text()).toContain('Redone');
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes feedback and cancels dismissal when the project history resets', async () => {
    const wrapper = mount(UndoRedoToast, { props: { action: imageAction() } });
    await wrapper.setProps({ action: null });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });
});
