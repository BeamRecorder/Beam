import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Slider from './Slider.vue'

describe('Slider', () => {
  it('renders bounds and its normalized fill', () => {
    const wrapper = mount(Slider, { props: { modelValue: 25, min: 0, max: 50, step: 5 } })
    expect(wrapper.get('input').attributes()).toMatchObject({ min: '0', max: '50', step: '5' })
    expect(wrapper.get('input').attributes('style')).toContain('50%')
  })
  it('emits a numeric value from user input', async () => {
    const wrapper = mount(Slider, { props: { modelValue: 0 } })
    await wrapper.get('input').setValue('42')
    expect(wrapper.emitted('update:modelValue')).toEqual([[42]])
  })
  it('does not emit input while disabled or when range is invalid', async () => {
    const disabled = mount(Slider, { props: { modelValue: 1, disabled: true } })
    await disabled.get('input').setValue('2')
    expect(disabled.emitted()).not.toHaveProperty('update:modelValue')
    const invalid = mount(Slider, { props: { modelValue: 1, min: 3, max: 3 } })
    expect(invalid.get('input').attributes('style')).toContain('0%')
  })
})
