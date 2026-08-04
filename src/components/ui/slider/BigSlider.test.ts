import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BigSlider from './BigSlider.vue'

const Input = {
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'keydown', 'blur'],
  template:
    '<input :id="$attrs.id" :type="$attrs.type" :min="$attrs.min" :max="$attrs.max" :step="$attrs.step" :class="$attrs.class" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" @blur="$emit(\'blur\', $event)" />',
}

describe('BigSlider', () => {
  it('updates the range and reports interaction boundaries', async () => {
    const wrapper = mount(BigSlider, {
      props: {
        modelValue: 50,
        min: 0,
        max: 100,
        label: 'Opacity',
        defaultValue: 25,
        formatValue: (value: number) => `${value}%`,
      },
      global: { stubs: { Input } },
    })
    expect(wrapper.get('.big-slider-value').text()).toBe('50%')
    await wrapper.get('.big-slider-input').setValue('80')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([80])
    await wrapper.get('.big-slider-input').trigger('pointerdown')
    await wrapper.get('.big-slider-input').trigger('change')
    expect(wrapper.emitted('interaction-start')).toHaveLength(1)
    expect(wrapper.emitted('interaction-end')).toHaveLength(1)
  })

  it('edits, clamps and resets a changed value', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 50, min: 0, max: 100, label: 'Opacity', defaultValue: 25 },
      global: { stubs: { Input } },
    })
    await wrapper.get('.big-slider-value').trigger('click')
    expect(wrapper.find('.slider-inline-input').exists()).toBe(true)
    await wrapper.get('.slider-inline-input').setValue('150')
    await wrapper.get('.slider-inline-input').trigger('keydown.enter')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([100])
    expect(wrapper.find('.slider-reset-btn').exists()).toBe(true)
    await wrapper.get('.slider-reset-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([25])
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('falls back to the current value for invalid direct input and ends interaction on unmount', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 12, min: 0, max: 20, label: 'Value' },
      global: { stubs: { Input } },
    })
    await wrapper.get('.big-slider-value').trigger('click')
    await wrapper.get('.slider-inline-input').setValue('invalid')
    await wrapper.get('.slider-inline-input').trigger('blur')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([12])
    await wrapper.get('.big-slider-input').trigger('pointerdown')
    wrapper.unmount()
    expect(wrapper.emitted('interaction-end')).toHaveLength(1)
  })
})
