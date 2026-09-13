import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EditorHistoryControls from '../EditorHistoryControls.vue';

describe('EditorHistoryControls', () => {
  it('exposes availability and emits undo and redo from the shared buttons', async () => {
    const wrapper = mount(EditorHistoryControls, { props: { canUndo: false, canRedo: true } });
    const undo = wrapper.get('button[aria-label="Undo (Ctrl+Z)"]');
    const redo = wrapper.get('button[aria-label="Redo (Ctrl+Y)"]');

    expect(undo.attributes('disabled')).toBeDefined();
    expect(redo.attributes('disabled')).toBeUndefined();
    expect(undo.classes()).toContain('btn-ghost');
    expect(redo.classes()).toContain('btn-icon-only');
    await undo.trigger('click');
    await redo.trigger('click');
    expect(wrapper.emitted('undo')).toBeUndefined();
    expect(wrapper.emitted('redo')).toHaveLength(1);

    await wrapper.setProps({ canUndo: true, canRedo: false });
    await wrapper.get('button[aria-label="Undo (Ctrl+Z)"]').trigger('click');
    await wrapper.get('button[aria-label="Redo (Ctrl+Y)"]').trigger('click');
    expect(wrapper.emitted('undo')).toHaveLength(1);
    expect(wrapper.emitted('redo')).toHaveLength(1);
    wrapper.unmount();
  });
});
