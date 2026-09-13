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
    expect(wrapper.find('.normalization-control').exists()).toBe(true);
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    await wrapper.get('.volume-slider').trigger('click');
    expect(wrapper.emitted('update:volume')).toEqual([[125]]);
  });

  it('emits normalize when the compact switch changes from off to on', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 } },
      global: { stubs: { BigSlider } },
    });

    const normalize = wrapper.get('[role="switch"]');
    await normalize.trigger('click');
    expect(wrapper.emitted('normalize')).toEqual([[]]);
    expect(wrapper.emitted('reset-normalization')).toBeUndefined();
  });

  it('shows analyzing as checked and disabled while normalization is pending', () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: {
        clip: { name: 'Voice track', enabled: true, volume: 80 },
        normalizationStatus: 'analyzing',
      },
    });

    const normalize = wrapper.get('[role="switch"]');
    expect(normalize.attributes('aria-checked')).toBe('true');
    expect(normalize.attributes('disabled')).toBeDefined();
    expect(wrapper.get('.normalization-status').text()).toContain('Analyzing');
  });

  it('emits reset-normalization when an enabled switch changes off', async () => {
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

    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.get('.normalization-status').text()).toContain('2.5');
    await wrapper.get('[role="switch"]').trigger('click');
    expect(wrapper.emitted('reset-normalization')).toEqual([[]]);
    expect(wrapper.emitted('normalize')).toBeUndefined();
  });

  it('renders silent and error normalization statuses', async () => {
    const wrapper = mount(AudioClipPropertiesPanel, {
      props: { clip: { name: 'Voice track', enabled: true, volume: 80 }, normalizationStatus: 'silent' },
    });
    expect(wrapper.get('.normalization-message').text()).toBeTruthy();

    await wrapper.setProps({ normalizationStatus: 'error', normalizationError: 'Unable to decode audio.' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to decode audio.');
  });
});
