import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Button from './Button.vue'

describe('Button', () => {
  it('renders its semantic type, content and visual variants', () => {
    const wrapper = mount(Button, { props: { type: 'submit', variant: 'danger', size: 'lg', block: true }, slots: { default: 'Delete' } })
    expect(wrapper.get('button').attributes('type')).toBe('submit'); expect(wrapper.text()).toContain('Delete'); expect(wrapper.classes()).toContain('btn-block'); expect(wrapper.get('button').classes()).toContain('btn-danger')
  })
  it('emits clicks when it is enabled', async () => {
    const wrapper = mount(Button, { slots: { default: 'Export' } }); await wrapper.get('button').trigger('click'); expect(wrapper.emitted('click')).toHaveLength(1)
  })
  it('does not emit clicks while disabled or loading', async () => {
    for (const props of [{ disabled: true }, { loading: true }]) {
      const wrapper = mount(Button, { props: props as never }); await wrapper.get('button').trigger('click'); expect(wrapper.emitted('click')).toBeUndefined(); expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    }
  })
})
