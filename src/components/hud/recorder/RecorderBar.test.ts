import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
    setRecorderTooltip: vi.fn(),
    dragStart: vi.fn(),
    drag: vi.fn(),
    dragEnd: vi.fn(),
  },
}))

vi.mock('../../../api/capture', () => ({ capture }))

import RecorderBar from './RecorderBar.vue'

const settings = {
  schemaVersion: 2,
  theme: 'dark' as const,
  recordingBar: { visibility: 'always' as const },
  devices: {},
  shortcuts: { 'hud.playPause': { keys: 'Ctrl+P', scope: 'global' as const, category: 'recording' } },
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
}

const Tooltip = { template: '<div class="tooltip-stub"><slot /><slot name="content" /></div>' }
const KeyboardChip = { props: ['shortcut'], template: '<kbd>{{ shortcut }}</kbd>' }

const props = {
  phase: 'recording' as const,
  secondsRemaining: 0,
  recordingTime: '00:12.3',
  cameraEnabled: true,
  microphoneEnabled: true,
  systemAudioEnabled: true,
  visibility: 'always' as const,
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  capture.getPreferences.mockResolvedValue(settings)
  capture.onPreferencesChanged.mockReturnValue(vi.fn())
  capture.setRecorderTooltip.mockResolvedValue('right')
  Object.defineProperty(window, 'capture', { configurable: true, value: capture })
})

describe('RecorderBar', () => {
  it('renders recording controls, uses preferences, and emits every action', async () => {
    const wrapper = mount(RecorderBar, { props, global: { stubs: { Tooltip, KeyboardChip } } })
    await vi.waitFor(() => expect(wrapper.get('.recorder-bar').classes()).toContain('tooltip-right'))
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3')
    expect(wrapper.findAll('.control')).toHaveLength(6)
    expect(wrapper.find('kbd').text()).toBe('Ctrl+P')

    const controls = wrapper.findAll('.control')
    await controls[0].trigger('click')
    await controls[1].trigger('click')
    await controls[2].trigger('click')
    await controls[3].trigger('click')
    await controls[4].trigger('click')
    await controls[5].trigger('click')

    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(wrapper.emitted('microphone')).toHaveLength(1)
    expect(wrapper.emitted('camera')).toHaveLength(1)
    expect(wrapper.emitted('systemAudio')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(capture.getPreferences).toHaveBeenCalledOnce()
    await wrapper.get('.recorder-bar').trigger('mouseenter')
    await wrapper.get('.recorder-bar').trigger('mouseleave')
    wrapper.unmount()
    expect(capture.setRecorderTooltip).toHaveBeenNthCalledWith(1, true)
    expect(capture.setRecorderTooltip).toHaveBeenLastCalledWith(false)
})

  it('renders countdown and finalizing states with the right disabled controls', async () => {
    const wrapper = mount(RecorderBar, { props: { ...props, phase: 'countdown', visibility: 'auto-fade' }, global: { stubs: { Tooltip, KeyboardChip } } })
    await Promise.resolve()
    expect(wrapper.get('.recorder-bar').classes()).toContain('auto-fade')
    expect(wrapper.get('.recording-time').text()).toContain('Ready')
    const controls = wrapper.findAll('.control')
    expect(controls[0].attributes('disabled')).toBeDefined()
    expect(controls[2].attributes('disabled')).toBeDefined()
    expect(controls[3].attributes('disabled')).toBeDefined()
    expect(controls[4].attributes('disabled')).toBeDefined()

    await wrapper.setProps({ phase: 'paused' })
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3')
    expect(wrapper.get('.control').attributes('aria-label')).toContain('Resume')
    await wrapper.setProps({ phase: 'finalizing' })
    expect(wrapper.findAll('.control')[5].attributes('disabled')).toBeDefined()
    wrapper.unmount()
})

  it('starts, moves and releases a drag only from permitted pointer input', async () => {
    const wrapper = mount(RecorderBar, { props, global: { stubs: { Tooltip, KeyboardChip } } })
    const bar = wrapper.get('.recorder-bar')
    const setPointerCapture = vi.fn()
    const hasPointerCapture = vi.fn(() => true)
    const releasePointerCapture = vi.fn()
    Object.defineProperty(bar.element, 'setPointerCapture', { value: setPointerCapture })
    Object.defineProperty(bar.element, 'hasPointerCapture', { value: hasPointerCapture })
    Object.defineProperty(bar.element, 'releasePointerCapture', { value: releasePointerCapture })

    await bar.trigger('pointerdown', { button: 2, pointerId: 1 })
    expect(capture.dragStart).not.toHaveBeenCalled()
    await bar.trigger('pointerdown', { button: 0, pointerId: 2 })
    expect(capture.dragStart).toHaveBeenCalledOnce()
    expect(setPointerCapture).toHaveBeenCalledWith(2)
    expect(bar.classes()).toContain('dragging')
    window.dispatchEvent(new Event('pointermove'))
    expect(capture.drag).toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(capture.dragEnd).toHaveBeenCalledOnce()
    expect(releasePointerCapture).toHaveBeenCalledWith(2)
    expect(bar.classes()).not.toContain('dragging')
    wrapper.unmount()
})
})
