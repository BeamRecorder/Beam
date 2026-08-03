import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AudioPanel from './AudioPanel.vue'

const BigSlider = {
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="big-slider" :data-label="label" @click="$emit(\'update:modelValue\', 42)">{{ label }}: {{ modelValue }}</button>',
}

const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="audio-switch" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue }}</button>',
}

describe('AudioPanel', () => {
  it('emits global, device and volume changes', async () => {
    const wrapper = mount(AudioPanel, {
      props: { volume: 80, isSystemAudioEnabled: true, isMicAudioEnabled: true, systemVolume: 60, micVolume: 40 },
      global: { stubs: { BigSlider, Switch } },
    })

    const sliders = wrapper.findAll('.big-slider')
    expect(sliders).toHaveLength(3)
    await sliders[0].trigger('click')
    await sliders[1].trigger('click')
    await sliders[2].trigger('click')
    await wrapper.findAll('.audio-switch')[0].trigger('click')
    await wrapper.findAll('.audio-switch')[1].trigger('click')

    expect(wrapper.emitted('update:volume')).toEqual([[42]])
    expect(wrapper.emitted('update:systemVolume')).toEqual([[42]])
    expect(wrapper.emitted('update:micVolume')).toEqual([[42]])
    expect(wrapper.emitted('update:isSystemAudioEnabled')).toEqual([[false]])
    expect(wrapper.emitted('update:isMicAudioEnabled')).toEqual([[false]])
  })

  it('uses default device volumes and hides disabled tracks', () => {
    const wrapper = mount(AudioPanel, {
      props: { volume: 100, isSystemAudioEnabled: false, isMicAudioEnabled: false },
      global: { stubs: { BigSlider, Switch } },
    })

    expect(wrapper.findAll('.big-slider')).toHaveLength(1)
    expect(wrapper.text()).toContain('Global Volume')
  })
})
