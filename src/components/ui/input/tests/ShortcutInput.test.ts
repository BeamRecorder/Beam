import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import ShortcutInput from '../ShortcutInput.vue';

enableAutoUnmount(afterEach);

const key = (code: string, options: Partial<KeyboardEventInit> = {}) => ({
  code,
  key: options.key ?? code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...options,
});

describe('ShortcutInput', () => {
  it('records modifiers and normalizes keyboard codes into an accelerator', async () => {
    const wrapper = mount(ShortcutInput, { props: { modelValue: '' } });
    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper.get('.shortcut-input').trigger('keydown', key('ControlLeft', { key: 'Control', ctrlKey: true }));
    expect(wrapper.find('.recording-state').text()).toContain('Ctrl');
    await wrapper.get('.shortcut-input').trigger('keydown', key('KeyK', { key: 'k', ctrlKey: true }));
    expect(wrapper.emitted('update:modelValue')).toEqual([['Ctrl+K']]);
    expect(wrapper.emitted('change')).toEqual([['Ctrl+K']]);
    expect(wrapper.find('.value-state').exists()).toBe(false);
  });

  it.each([
    ['ShiftRight', 'Shift'],
    ['AltLeft', 'Alt'],
    ['MetaRight', 'Super'],
    ['Space', 'Space'],
    ['Enter', 'Enter'],
    ['NumpadEnter', 'Enter'],
    ['Backspace', 'Backspace'],
    ['Numpad5', '5'],
    ['F12', 'F12'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
  ])('accepts %s as %s', async (code, expected) => {
    const wrapper = mount(ShortcutInput, { props: { modelValue: '' } });
    await wrapper.get('.shortcut-input').trigger('click');
    const modifier = code.startsWith('Shift')
      ? { shiftKey: true }
      : code.startsWith('Alt')
        ? { altKey: true }
        : code.startsWith('Meta')
          ? { metaKey: true }
          : {};
    await wrapper.get('.shortcut-input').trigger('keydown', key(code, { key: expected, ...modifier }));
    if (Object.keys(modifier).length === 0) {
      expect(wrapper.emitted('change')).toEqual([[expected]]);
      return;
    }
    expect(wrapper.find('.recording-state').text()).toContain(expected);
    await wrapper.get('.shortcut-input').trigger('keydown', key('KeyA', { key: 'a', ...modifier }));
    expect(wrapper.emitted('change')).toEqual([[`${expected}+A`]]);
  });

  it('supports fallback keys, escape, outside clicks, clear, and reset', async () => {
    const wrapper = mount(ShortcutInput, { props: { modelValue: 'Ctrl+K', error: 'Shortcut already used' } });
    expect(wrapper.find('.shortcut-error-msg').text()).toBe('Shortcut already used');
    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper.get('.shortcut-input').trigger('keydown', key('Unusual', { key: 'é' }));
    expect(wrapper.emitted('change')).toContainEqual(['É']);

    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper.get('.shortcut-input').trigger('keydown', key('Escape', { key: 'Escape' }));
    expect(wrapper.find('.recording-state').exists()).toBe(false);

    await wrapper.get('.shortcut-input').trigger('click');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('.recording-state').exists()).toBe(false);

    await wrapper.get('[title="Clear shortcut"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['']);
    expect(wrapper.emitted('change')).toContainEqual(['']);
    await wrapper.get('[title="Reset to default"]').trigger('click');
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('does not record when disabled and still renders the disabled/error state', async () => {
    const wrapper = mount(ShortcutInput, { props: { modelValue: 'Ctrl+K', disabled: true, error: true } });
    expect(wrapper.get('.shortcut-input').classes()).toContain('is-disabled');
    expect(wrapper.find('[title="Clear shortcut"]').exists()).toBe(false);
    expect(wrapper.find('[title="Reset to default"]').exists()).toBe(false);
    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper.get('.shortcut-input').trigger('keydown', key('KeyA', { key: 'a' }));
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('does not keep a Tab recording active and combines all modifier types', async () => {
    const wrapper = mount(ShortcutInput, { props: { modelValue: '' } });
    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper.get('.shortcut-input').trigger('keydown', key('Tab', { key: 'Tab', ctrlKey: true }));
    expect(wrapper.emitted('change')).toEqual([['Ctrl']]);

    await wrapper.get('.shortcut-input').trigger('click');
    await wrapper
      .get('.shortcut-input')
      .trigger('keydown', key('KeyA', { key: 'a', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }));
    expect(wrapper.emitted('change')).toContainEqual(['Ctrl+Alt+Shift+Super+A']);
  });
});
