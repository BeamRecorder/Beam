import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../api/capture', () => ({ capture: {} }))

import VideoProjectEdition from './VideoProjectEdition.vue'

const ProjectPicker = {
  emits: ['select-project', 'open-project'],
  template: '<div class="project-picker-stub"><button class="select-project" @click="$emit(\'select-project\', { id: \'next\', name: \'Next project\' })">Select</button><button class="open-project" @click="$emit(\'open-project\', { id: \'opened\', name: \'Opened project\' })">Open</button></div>',
}

describe('VideoProjectEdition', () => {
  it('opens the picker, emits selection and closes the menu', async () => {
    const wrapper = mount(VideoProjectEdition, {
      props: { project: { id: 'current', name: 'Current project' }, isSaving: true },
      global: { stubs: { ProjectPicker } },
    })

    expect(wrapper.get('.project-title').text()).toBe('Current project')
    expect(wrapper.get('.save-spinner').classes()).toContain('is-visible')
    await wrapper.get('.project-name-button').trigger('click')
    expect(wrapper.find('.project-picker-stub').exists()).toBe(true)
    await wrapper.get('.select-project').trigger('click')
    expect(wrapper.emitted('open-project')).toEqual([[{ id: 'next', name: 'Next project' }]])
    expect(wrapper.find('.project-picker-stub').exists()).toBe(false)
  })

  it('closes on Escape or an outside pointer and ignores dialog/popover clicks', async () => {
    const wrapper = mount(VideoProjectEdition, { global: { stubs: { ProjectPicker } } })
    await wrapper.get('.project-name-button').trigger('click')
    const panel = wrapper.get('.project-menu-panel').element
    const popoverContent = document.createElement('div')
    popoverContent.className = 'popover-content'
    panel.appendChild(popoverContent)
    popoverContent.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-menu-panel').exists()).toBe(false)

    await wrapper.get('.project-name-button').trigger('click')
    const dialog = document.createElement('div')
    dialog.className = 'dialog-overlay'
    document.body.appendChild(dialog)
    dialog.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true)
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-menu-panel').exists()).toBe(false)
    dialog.remove()
    outside.remove()
  })

  it('uses the untitled fallback when no project is supplied', () => {
    const wrapper = mount(VideoProjectEdition, { global: { stubs: { ProjectPicker } } })
    expect(wrapper.get('.project-title').text()).toBe('Untitled project')
  })
})
