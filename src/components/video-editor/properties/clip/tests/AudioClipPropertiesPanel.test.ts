import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioClipPropertiesPanel from '../AudioClipPropertiesPanel.vue';

const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="volume-slider" @click="$emit(\'update:modelValue\', 125)">Volume</button>',
};
const Button = {
  emits: ['click'],
  template: '<button class="delete-button" @click="$emit(\'click\')"><slot /></button>',
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

  it('emits volume and delete changes for a clip', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider, Button } },
    });
    expect(wrapper.get('.section-title').text()).toBe('Voice track');
    await wrapper.get('.volume-slider').trigger('click');
    await wrapper.get('.delete-button').trigger('click');
    expect(wrapper.emitted('update:volume')).toEqual([[125]]);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });
});
