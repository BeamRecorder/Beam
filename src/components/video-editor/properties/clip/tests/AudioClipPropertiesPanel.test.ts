import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioClipPropertiesPanel from '../AudioClipPropertiesPanel.vue';
import type { AudioNormalization } from '~/media/shared/audio-normalization-types';

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
    expect(wrapper.find('.normalization-block').exists()).toBe(true);
    await wrapper.get('.volume-slider').trigger('click');
    expect(wrapper.emitted('update:volume')).toEqual([[125]]);
  });

  it('emits normalize for a selected clip and disables it while analyzing', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.findAll('.volume-slider')).toHaveLength(1);
    const normalize = wrapper.get('.normalization-block .btn-secondary');
    await normalize.trigger('click');
    expect(wrapper.emitted('normalize')).toEqual([[]]);

    await wrapper.setProps({ normalizationStatus: 'analyzing' });
    expect(wrapper.get('.normalization-block .btn-secondary').attributes('disabled')).toBeDefined();
  });

  it('emits reset-normalization when normalization is enabled', async () => {
    const normalization: AudioNormalization = {
      enabled: true,
      mode: 'lufs',
      targetLufs: -16,
      targetPeakDbtp: -1,
      appliedGainDb: 2.5,
      analysisVersion: 1,
      analysisKey: 'asset:0:1000:v1',
    };
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80, normalization }, normalizationStatus: 'ready' },
    });

    expect(wrapper.get('.normalization-status').text()).toContain('2.5');
    await wrapper.get('.normalization-heading .btn').trigger('click');
    expect(wrapper.emitted('reset-normalization')).toEqual([[]]);
  });

  it('renders silent and error normalization statuses', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 }, normalizationStatus: 'silent' },
    });
    expect(wrapper.get('.normalization-status').text()).toBeTruthy();

    await wrapper.setProps({ normalizationStatus: 'error', normalizationError: 'Unable to decode audio.' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to decode audio.');
  });
});
