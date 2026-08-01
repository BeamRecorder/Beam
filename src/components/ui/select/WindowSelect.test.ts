import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WindowSelect from './WindowSelect.vue'

const options = [
  { id: 'window-1', name: 'Editor', thumbnail: '/window.png', appIcon: '/icon.png' },
  { id: 'window-2', name: 'Browser', thumbnail: '/browser.png', appIcon: null },
]

describe('WindowSelect', () => {
  it('renders the selected window and emits a new selection', async () => {
    const wrapper = mount(WindowSelect, { attachTo: document.body, props: { modelValue: 'window-1', options } })
    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('/window.png')
    expect(wrapper.find('.trigger-app-icon').exists()).toBe(true)
    await wrapper.get('.select-trigger').trigger('click')
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(2)
    const second = document.body.querySelectorAll<HTMLElement>('.select-option')[1]
    second.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['window-2']])
  })

  it('shows the empty state and honors disabled triggers', async () => {
    const wrapper = mount(WindowSelect, { props: { modelValue: null, options: [], disabled: true, placeholder: 'No window' } })
    expect(wrapper.get('.select-label').text()).toBe('No window')
    await wrapper.get('.select-trigger').trigger('click')
    expect(wrapper.find('.select-trigger').classes()).not.toContain('is-open')

    await wrapper.setProps({ disabled: false })
    await wrapper.get('.select-trigger').trigger('click')
    expect(document.body.querySelector('.options-empty')?.textContent).toContain('No windows detected')
    wrapper.unmount()
  })
})
