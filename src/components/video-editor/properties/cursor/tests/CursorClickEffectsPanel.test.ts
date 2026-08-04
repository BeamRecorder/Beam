import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CursorClickEffectsPanel from './CursorClickEffectsPanel.vue'

const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="effect-slider" @click="$emit(\'update:modelValue\', 55)">Slider</button>',
}
const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="effect-switch" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
}
const ColorInput = {
  emits: ['update:modelValue'],
  template: '<button class="effect-color" @click="$emit(\'update:modelValue\', \'#abcdef\')">Color</button>',
}

const effects = {
  left: { springEnabled: true, springIntensity: 25, rippleEnabled: true, rippleSize: 30, rippleColor: '#111111' },
  right: { springEnabled: false, springIntensity: 40, rippleEnabled: false, rippleSize: 35, rippleColor: '#222222' },
}

describe('CursorClickEffectsPanel', () => {
  it('renders per-button spring and ripple controls and emits patches', async () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: { modelValue: effects },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    })
    expect(wrapper.findAll('.click-card')).toHaveLength(2)
    expect(wrapper.findAll('.effect-slider')).toHaveLength(2)
    expect(wrapper.findAll('.effect-color')).toHaveLength(1)
    await wrapper.find('.effect-color').trigger('click')
    await wrapper.findAll('.effect-switch')[0].trigger('click')
    await wrapper.find('.effect-slider').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3)
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toMatchObject({ left: { rippleColor: '#abcdef' } })
  })

  it('does not render optional controls when effects are disabled', () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: {
        modelValue: { left: { ...effects.left, springEnabled: false, rippleEnabled: false }, right: effects.right },
      },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    })
    expect(wrapper.findAll('.effect-slider')).toHaveLength(0)
    expect(wrapper.findAll('.effect-color')).toHaveLength(0)
  })
})
