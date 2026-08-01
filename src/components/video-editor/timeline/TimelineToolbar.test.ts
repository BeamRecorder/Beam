import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelineToolbar from './TimelineToolbar.vue'

const PopoverMenuButton = {
  emits: ['select'],
  template: '<button class="add-menu-stub" @click="$emit(\'select\', \'caption\')">Add</button>',
}
const Button = {
  inheritAttrs: true,
  props: ['disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

describe('TimelineToolbar', () => {
  it('formats time, controls playback, adds elements and adjusts zoom', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 65.12, duration: 125.5, isPlaying: false, zoomLevel: 200 },
      global: { stubs: { PopoverMenuButton, Button } },
    })
    expect(wrapper.get('.time-current').text()).toBe('01:05.12')
    expect(wrapper.get('.time-total').text()).toBe('02:05.50')
    await wrapper.get('.add-menu-stub').trigger('click')
    await wrapper.findAll('.nav-controls button')[0].trigger('click')
    await wrapper.findAll('.nav-controls button')[1].trigger('click')
    await wrapper.findAll('.nav-controls button')[2].trigger('click')
    await wrapper.get('.zoom-percent-text').trigger('click')
    await wrapper.findAll('.zoom-controls button')[0].trigger('click')
    await wrapper.findAll('.zoom-controls button')[1].trigger('click')
    await wrapper.get('.zoom-slider').setValue('275')
    expect(wrapper.emitted('add:element')).toEqual([['caption']])
    expect(wrapper.emitted('update:currentTime')).toEqual([[0], [125.5]])
    expect(wrapper.emitted('update:isPlaying')).toEqual([[true]])
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([100])
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([150])
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([250])
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([275])
  })

  it('clamps zoom controls at the supported bounds', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 0, isPlaying: true, zoomLevel: 500 },
      global: { stubs: { PopoverMenuButton, Button } },
    })
    expect(wrapper.findAll('.zoom-controls button')[1].attributes('disabled')).toBeDefined()
    await wrapper.get('.zoom-percent-text').trigger('click')
    expect(wrapper.emitted('update:zoomLevel')).toEqual([[100]])
  })
})
