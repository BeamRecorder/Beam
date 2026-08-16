import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioClipPropertiesPanel from '../AudioClipPropertiesPanel.vue';

const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="volume-slider" @click="$emit(\'update:modelValue\', 125)">Volume</button>',
};
const Button = {
  emits: ['click'],
  template: '<button class="button-stub" @click="$emit(\'click\')"><slot /></button>',
};

describe('AudioClipPropertiesPanel', () => {
  it('renders the empty state without a clip', () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: null },
      global: { stubs: { BigSlider, Button } },
    });
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.options-group').exists()).toBe(false);
  });

  it('emits volume changes for a clip', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider, Button } },
    });
    expect(wrapper.get('.section-title').text()).toBe('Voice track');
    await wrapper.get('.volume-slider').trigger('click');
    expect(wrapper.emitted('update:volume')).toEqual([[125]]);
  });

  it('emits enabled changes and deletes from the inline action group', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider, Button } },
    });

    const buttons = wrapper.findAll('.button-stub');
    expect(buttons).toHaveLength(2);

    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('update:enabled')).toEqual([[false]]);

    await wrapper.get('.button-stub.delete-button').trigger('click');
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });
});
