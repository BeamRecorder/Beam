import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => undefined),
  setWindowMode: vi.fn(),
  showHud: vi.fn(),
  getUpdateState: vi.fn(() => Promise.resolve({ currentVersion: '1.2.3' })),
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
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    capture.getPreferences.mockResolvedValue({ theme: 'light' })
    capture.updatePreferences.mockResolvedValue({ theme: 'light' })
    vi.clearAllMocks()
    capture.getPreferences.mockResolvedValue({ theme: 'light' })
    capture.updatePreferences.mockResolvedValue({ theme: 'light' })
    capture.getUpdateState.mockResolvedValue({ currentVersion: '1.2.3' })
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

  it('toggles dev mode and reveals the framed recorder options', async () => {
    const wrapper = mount(SettingsPanel, { global: { stubs: { Button, ButtonGroup, Select, UpdateControls } } })
    expect(wrapper.find('.dev-frame').exists()).toBe(false)

    const switchBtn = wrapper.get('.dev-switch')
    await switchBtn.trigger('click')

    expect(wrapper.find('.dev-frame').exists()).toBe(true)
    expect(localStorage.getItem('dev_mode_enabled')).toBe('true')

    const devButtons = wrapper.findAll('.dev-action-btn')
    expect(devButtons).toHaveLength(2)

    await devButtons[0].trigger('click')

    expect(wrapper.emitted('back-to-hud')).toBeTruthy()
    expect(wrapper.emitted('open-recorder')).toBeTruthy()
    expect(capture.setWindowMode).toHaveBeenCalledWith('hud')
    expect(capture.showHud).toHaveBeenCalled()
  })

  it('copies system information to clipboard when clicking copy button', async () => {
    const wrapper = mount(SettingsPanel, { global: { stubs: { Button, ButtonGroup, Select, UpdateControls } } })
    await wrapper.get('.dev-switch').trigger('click')

    const copyBtn = wrapper.findAll('.dev-action-btn')[1]
    await copyBtn.trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('App Version: 1.2.3'),
    )
  })
})


