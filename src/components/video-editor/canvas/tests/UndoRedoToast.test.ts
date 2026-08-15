import { mount } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import UndoRedoToast from '../UndoRedoToast.vue';

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
  });
});
