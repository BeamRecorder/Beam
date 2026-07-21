import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BigSlider from './BigSlider.vue'

describe('BigSlider', () => {
  it('renders a formatted value and calculated fill', () => { const wrapper = mount(BigSlider, { props: { modelValue: .5, label: 'Zoom', formatValue: (value) => `${value * 100}%` } }); expect(wrapper.text()).toContain('50%'); expect(wrapper.attributes('style')).toContain('50%') })
  it('emits numeric changes and interaction boundaries', async () => { const wrapper = mount(BigSlider, { props: { modelValue: 0, label: 'Zoom' } }); const input = wrapper.get('input'); (input.element as HTMLInputElement).value = '.75'; await input.trigger('input'); await input.trigger('pointerdown'); await input.trigger('change'); expect(wrapper.emitted('update:modelValue')).toEqual([[.75]]); expect(wrapper.emitted('interaction-start')).toHaveLength(1); expect(wrapper.emitted('interaction-end')).toHaveLength(1) })
  it('handles a zero range without an invalid percentage', () => { const wrapper = mount(BigSlider, { props: { modelValue: 1, min: 1, max: 1, label: 'Fixed' } }); expect(wrapper.attributes('style')).toContain('0%') })
})
