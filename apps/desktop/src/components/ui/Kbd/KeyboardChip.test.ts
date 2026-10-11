import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KeyboardChip from './KeyboardChip.vue';

afterEach(() => vi.unstubAllGlobals());

describe('keyboard combinations', () => {
  it('renders each key in a keycap and separates each pair of keys', () => {
    const wrapper = mount(KeyboardChip, { props: { shortcut: 'Ctrl+Shift+K' } });
    expect(wrapper.classes()).toContain('chip-sm');
    expect(wrapper.findAll('kbd').map((key) => key.text())).toEqual(['Ctrl', 'Shift', 'K']);
    expect(wrapper.findAll('.chip-plus').map((plus) => plus.text())).toEqual(['+', '+']);
  });

  it('uses the requested size and prioritizes explicit keys with platform labels', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const wrapper = mount(KeyboardChip, {
      props: { keys: ['CommandOrControl', 'Shift', 'A'], shortcut: 'Alt+Z', size: 'md' },
    });
    expect(wrapper.classes()).toContain('chip-md');
    expect(wrapper.findAll('kbd').map((key) => key.text())).toEqual(['⌘', '⇧', 'A']);
  });

  it('handles unassigned and single-key bindings without stray separators', async () => {
    const wrapper = mount(KeyboardChip, { props: { keys: [], shortcut: '' } });
    expect(wrapper.find('.keyboard-chip-group').exists()).toBe(false);
    await wrapper.setProps({ shortcut: 'Escape' });
    expect(wrapper.get('kbd').text()).toBe('Esc');
    expect(wrapper.find('.chip-plus').exists()).toBe(false);
    await wrapper.setProps({ shortcut: 'Ctrl+Plus' });
    expect(wrapper.findAll('kbd').map((key) => key.text())).toEqual(['Ctrl', '+']);
    expect(wrapper.findAll('.chip-plus')).toHaveLength(1);
  });
});
