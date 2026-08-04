import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ColorPicker from '../ColorPicker.vue'

const Custom = {
  template:
    '<button class="custom" @click="$emit(\'update:model-value\', \'#112233\')" @pointerdown="$emit(\'drag-start\')" @pointerup="$emit(\'drag-end\')" />',
}
describe('ColorPicker', () => {
  it('renders the default label and relays inline picker events', async () => {
    const wrapper = mount(ColorPicker, {
      props: { inline: true, modelValue: '#ff0000' },
      global: { stubs: { ColorPickerCustom: Custom } },
    })
    const custom = wrapper.get('.custom')
    await custom.trigger('click')
    await custom.trigger('pointerdown')
    await custom.trigger('pointerup')
    expect(wrapper.find('.color-picker-label').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([['#112233']])
    expect(wrapper.emitted('drag-start')).toHaveLength(1)
    expect(wrapper.emitted('drag-end')).toHaveLength(1)
  })
  it('does not relay colors from a disabled picker but retains its reason', async () => {
    const wrapper = mount(ColorPicker, {
      props: {
        inline: true,
        disabled: true,
        disabledReason: 'Locked',
        disabledReasonKey: 'recording',
      },
      global: { stubs: { ColorPickerCustom: Custom } },
    })
    await wrapper.get('.custom').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.attributes('title')).toBe('Locked')
    expect(wrapper.attributes('data-disabled-reason-key')).toBe('recording')
  })
  it('uses uppercase text input and emits alpha in trigger mode', async () => {
    const Popover = {
      template: '<div><slot name="trigger" :isOpen="false" /><slot :close="() => {}" /></div>',
    }
    const wrapper = mount(ColorPicker, {
      props: { modelValue: '#aabbcc' },
      global: {
        stubs: {
          Popover,
          ColorPickerCustom: {
            template: '<button @click="$emit(\'update:alpha\', .5)" />',
          },
        },
      },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('input').element.value).toBe('#AABBCC')
    expect(wrapper.emitted('update:alpha')).toEqual([[0.5]])
  })
})
