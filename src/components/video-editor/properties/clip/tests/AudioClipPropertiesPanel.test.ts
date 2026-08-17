import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioClipPropertiesPanel from '../AudioClipPropertiesPanel.vue';

const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="volume-slider" @click="$emit(\'update:modelValue\', 125)">Volume</button>',
};

describe('AudioClipPropertiesPanel', () => {
  it('renders the empty state without a clip', () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: null },
      global: { stubs: { BigSlider } },
    });
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.options-group').exists()).toBe(false);
  });

  it('emits volume changes for a clip', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider } },
    });
    expect(wrapper.find('.section-title').exists()).toBe(false);
    expect(wrapper.find('.button-stub').exists()).toBe(false);
    await wrapper.get('.volume-slider').trigger('click');
    expect(wrapper.emitted('update:volume')).toEqual([[125]]);
  });

  it('renders only the volume control for a selected clip', () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.findAll('.volume-slider')).toHaveLength(1);
    expect(wrapper.findAll('button')).toHaveLength(1);
  });
});
