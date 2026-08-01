import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CanvasToolbar from './CanvasToolbar.vue'

const PopoverMenuButton = {
  emits: ['select'],
  template: '<button class="preset-menu-stub" @click="$emit(\'select\', \'9:16\')">Preset</button>',
}
const Button = {
  inheritAttrs: true,
  props: ['disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

describe('CanvasToolbar', () => {
  it('selects a preset and toggles crop mode', async () => {
    const wrapper = mount(CanvasToolbar, {
      props: { preset: '16:9', canCrop: true, isCropping: false },
      global: { stubs: { PopoverMenuButton, Button } },
    })
    await wrapper.get('.preset-menu-stub').trigger('click')
    await wrapper.get('.crop-button').trigger('click')
    expect(wrapper.emitted('select:preset')).toEqual([['9:16']])
    expect(wrapper.emitted('toggle:crop')).toHaveLength(1)
    expect(wrapper.text()).toContain('Crop')
  })

  it('disables crop when no selected element exists and renders confirmation text while cropping', () => {
    const wrapper = mount(CanvasToolbar, {
      props: { preset: 'custom', canCrop: false, isCropping: true },
      global: { stubs: { PopoverMenuButton, Button } },
    })
    expect(wrapper.get('.crop-button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('OK')
  })
})
