import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => undefined),
}))
vi.mock('~/api/capture', () => ({ capture }))

import SettingsPanel from './SettingsPanel.vue'

const Button = {
  inheritAttrs: true,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
}
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' }
const Select = {
  emits: ['update:modelValue'],
  template: '<button class="language-select" @click="$emit(\'update:modelValue\', \'fr\')">Select</button>',
}
const UpdateControls = { template: '<div class="update-controls-stub">Updates</div>' }

describe('SettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    capture.getPreferences.mockResolvedValue({ theme: 'light' })
    capture.updatePreferences.mockResolvedValue({ theme: 'light' })
    vi.clearAllMocks()
    capture.getPreferences.mockResolvedValue({ theme: 'light' })
    capture.updatePreferences.mockResolvedValue({ theme: 'light' })
  })

  it('changes theme and locale through the stores', async () => {
    const wrapper = mount(SettingsPanel, { global: { stubs: { Button, ButtonGroup, Select, UpdateControls } } })
    const themeButtons = wrapper.findAll('.theme-button-group button')
    expect(themeButtons).toHaveLength(3)
    await themeButtons[1].trigger('click')
    await themeButtons[2].trigger('click')
    await wrapper.get('.language-select').trigger('click')

    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ theme: 'system' })
    expect(localStorage.getItem('locale')).toBe('fr')
  })

  it('renders the update controls section', () => {
    const wrapper = mount(SettingsPanel, { global: { stubs: { Button, ButtonGroup, Select, UpdateControls } } })
    expect(wrapper.find('.update-controls-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Theme')
  })
})
