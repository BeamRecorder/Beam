import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Check } from '@lucide/vue'
import PopoverMenuButton from './PopoverMenuButton.vue'

describe('PopoverMenuButton', () => {
  it('opens, renders item states and emits the selected item', async () => {
    const wrapper = mount(PopoverMenuButton, {
      attachTo: document.body,
      props: {
        label: 'Quality',
        ariaLabel: 'Select quality',
        icon: Check,
        transparent: true,
        items: [
          { id: 'high', label: 'High', active: true, icon: Check },
          { id: 'low', label: 'Low', disabled: true },
        ],
      },
    })
    await wrapper.get('.menu-button').trigger('click')
    expect(wrapper.get('.menu-button').classes()).toContain('is-open')
    expect(wrapper.get('.menu-button').classes()).toContain('transparent')
    expect(wrapper.get('.menu-button').attributes('aria-label')).toBe('Select quality')
    expect(document.body.querySelectorAll('.menu-item')).toHaveLength(2)
    expect(document.body.querySelector('.menu-item.active')).not.toBeNull()
    await document.body.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.click()
    expect(wrapper.emitted('select')).toEqual([['high']])
    wrapper.unmount()
  })

  it('supports disabled trigger and label fallback', () => {
    const wrapper = mount(PopoverMenuButton, { props: { label: 'Mode', items: [], disabled: true } })
    expect(wrapper.get('.menu-button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.menu-button').attributes('aria-label')).toBe('Mode')
  })
})
