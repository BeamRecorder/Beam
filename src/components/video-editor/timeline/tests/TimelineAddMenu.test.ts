import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TimelineAddMenu from '../TimelineAddMenu.vue';

const PopoverMenuButton = {
  props: {
    label: String,
    items: Array,
    icon: { default: undefined },
    direction: String,
    block: Boolean,
    bare: Boolean,
  },
  emits: ['select'],
  template: '<button class="add-trigger" @click="$emit(\'select\', \'voiceover\')">{{ label }}</button>',
};

describe('TimelineAddMenu', () => {
  it('uses an upward block menu with a plus icon and forwards the selected kind', async () => {
    const wrapper = mount(TimelineAddMenu, { global: { stubs: { PopoverMenuButton } } });
    const menu = wrapper.findComponent(PopoverMenuButton);

    expect(menu.props('block')).toBe(true);
    expect(menu.props('bare')).toBe(true);
    expect(menu.props('direction')).toBe('up');
    expect(menu.props('icon')).toBeDefined();
    const items = menu.props('items') as Array<{
      id: string;
      children?: Array<{ id: string }>;
    }>;
    expect(items.map((item) => item.id)).toEqual(['media', 'composition', 'audio', 'caption']);
    expect(items[0]?.children?.map((item) => item.id)).toEqual(['video', 'image']);
    expect(items[1]?.children?.map((item) => item.id)).toEqual(['shape', 'blur', 'color']);
    expect(items[2]?.children?.map((item) => item.id)).toEqual(['sound', 'voiceover']);
    expect(items[3]?.children).toBeUndefined();

    await wrapper.get('.add-trigger').trigger('click');
    expect(wrapper.emitted('add:element')).toEqual([['voiceover']]);
  });
});
