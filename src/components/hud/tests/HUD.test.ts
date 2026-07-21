import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureMock as capture } from './capture.mock'

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }))
vi.mock('../TopbarHUD.vue', () => ({ default: { template: '<header><button aria-label="Preferences" @click="$emit(\'open-settings\')"/><button aria-label="Close" @click="$emit(\'close\')"/></header>' } }))
import HUD from '../HUD.vue'

const catalog = { sources: [{ id: 'display:1', kind: 'display', label: 'Display', isDefault: true }, { id: 'microphone:1', kind: 'microphone', label: 'Mic', isDefault: true }, { id: 'camera:1', kind: 'camera', label: 'Cam', isDefault: true }], capabilities: { systemAudio: true } }
const stubs = { Select: { props: ['modelValue'], template: '<button class="select">{{ modelValue }}</button>' }, WindowSelect: { template: '<button class="window-select" />' }, ProjectPicker: { template: '<div class="project-picker-stub" />' }, HudPreferences: { template: '<div class="preferences-stub"><button @click="$emit(\'close\')">Return</button></div>' } }
const ready = async () => { await flushPromises(); await Promise.resolve() }

describe('HUD', () => {
  beforeEach(() => { vi.useFakeTimers(); Object.values(capture).forEach((mock) => mock.mockReset()); capture.discover.mockResolvedValue(catalog); capture.getSources.mockResolvedValue([{ id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null }]) })
  afterEach(() => vi.useRealTimers())
  it('discovers defaults and starts a screen recording with selected sources', async () => {
    capture.startRecording.mockResolvedValue({ state: 'recording' }); const wrapper = mount(HUD, { global: { stubs } }); await ready(); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready()
    expect(capture.startRecording).toHaveBeenCalledWith(expect.objectContaining({ screenKind: 'display', screenId: 'display:1', microphoneId: 'microphone:1', cameraId: 'camera:1', systemAudio: true, targetFps: 60 })); expect(wrapper.emitted('start-recording')).toEqual([[{ state: 'recording' }]])
  })
  it('shows actionable errors when discovery or recording fails', async () => {
    capture.discover.mockRejectedValueOnce(new Error('permission denied')); const wrapper = mount(HUD, { global: { stubs } }); await ready(); expect(wrapper.get('[role=alert]').text()).toContain('permission denied'); capture.startRecording.mockRejectedValueOnce(new Error('disk full')); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready(); expect(wrapper.get('[role=alert]').text()).toContain('disk full')
  })
  it('switches views and delegates window controls safely', async () => {
    const wrapper = mount(HUD, { global: { stubs } }); await ready(); await wrapper.get('[aria-label="Preferences"]').trigger('click'); expect(wrapper.find('.preferences-stub').exists()).toBe(true); await wrapper.get('.preferences-stub button').trigger('click'); await wrapper.get('.project-btn').trigger('click'); expect(wrapper.find('.project-picker-stub').exists()).toBe(true); await wrapper.get('[aria-label="Close"]').trigger('click'); expect(capture.close).toHaveBeenCalledOnce()
  })
})
