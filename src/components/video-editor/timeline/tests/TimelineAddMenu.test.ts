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
  template: '<button class="add-trigger" @click="$emit(\'select\', \'blur\')">{{ label }}</button>',
};

describe('TimelineAddMenu', () => {
  it('uses an upward block menu with a plus icon and forwards the selected kind', async () => {
    const wrapper = mount(TimelineAddMenu, { global: { stubs: { PopoverMenuButton } } });
    const menu = wrapper.findComponent(PopoverMenuButton);

    expect(menu.props('block')).toBe(true);
    expect(menu.props('bare')).toBe(true);
    expect(menu.props('direction')).toBe('up');
    expect(menu.props('icon')).toBeDefined();
    expect(menu.props('items').map((item: { id: string }) => item.id)).toEqual([
      'video',
      'image',
      'color',
      'shape',
      'sound',
      'voiceover',
      'caption',
      'blur',
    ]);

    await wrapper.get('.add-trigger').trigger('click');
    expect(wrapper.emitted('add:element')).toEqual([['blur']]);
  });
});
