import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureMock as capture } from './capture.mock'
import { browserCameraMock } from './camera-recorder.mock'
import { browserMicrophoneMock } from './microphone-recorder.mock'
import { browserSystemAudioMock } from './system-audio-recorder.mock'

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }))
vi.mock('../../../api/camera-recorder', async () => {
  const camera = await import('./camera-recorder.mock')
  return { BrowserCameraRecorder: camera.BrowserCameraRecorder, listBrowserCameras: camera.listBrowserCameras }
})
vi.mock('../../../api/microphone-recorder', async () => {
  const microphone = await import('./microphone-recorder.mock')
  return { BrowserMicrophoneRecorder: microphone.BrowserMicrophoneRecorder, listBrowserMicrophones: microphone.listBrowserMicrophones, recordMicrophoneFailure: microphone.recordMicrophoneFailure }
})
vi.mock('../../../api/system-audio-recorder', async () => {
  const systemAudio = await import('./system-audio-recorder.mock')
  return { BrowserSystemAudioRecorder: systemAudio.BrowserSystemAudioRecorder, recordSystemAudioFailure: systemAudio.recordSystemAudioFailure, systemAudioSource: systemAudio.systemAudioSource }
})
vi.mock('../TopbarHUD.vue', () => ({ default: { template: '<header><button aria-label="Preferences" @click="$emit(\'open-settings\')"/><button aria-label="Close" @click="$emit(\'close\')"/></header>' } }))
import HUD from '../HUD.vue'

const catalog = { sources: [{ id: 'display:1', kind: 'display', label: 'Display', isDefault: true }], capabilities: { systemAudio: true } }
const stubs = {
  Select: {
    props: ['modelValue', 'options'],
    template: '<div class="select"><button class="select-control" @click="$emit(\'toggle\', true)">{{ modelValue }}</button><button v-for="option in options" :key="option.value" class="select-option" @click="$emit(\'update:modelValue\', option.value)">{{ option.label }}</button></div>',
  },
  WindowSelect: {
    props: ['modelValue', 'options'],
    template: '<div class="window-select"><button class="window-select-control" @click="$emit(\'toggle\', true)">{{ modelValue }}</button><button v-for="option in options" :key="option.id" class="window-option" @click="$emit(\'update:modelValue\', option.id)">{{ option.name }}</button></div>',
  },
  ProjectPicker: { template: '<div class="project-picker-stub" />' },
  HudPreferences: { template: '<div class="preferences-stub"><button @click="$emit(\'close\')">Return</button></div>' },
  CameraPreviewOverlay: { template: '<div class="camera-preview-stub" />' },
}
const ready = async () => { await flushPromises(); await Promise.resolve() }
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

describe('HUD', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
        configurable: true,
      })
    } else {
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue({ getTracks: () => [] } as any)
    }
    Object.values(capture).forEach((mock) => mock.mockReset()); Object.values(browserCameraMock).forEach((mock) => mock.mockReset()); Object.values(browserMicrophoneMock).forEach((mock) => mock.mockReset()); Object.values(browserSystemAudioMock).forEach((mock) => mock.mockReset()); capture.getPreferences.mockResolvedValue({ schemaVersion: 2, theme: 'system', recordingBar: { visibility: 'always' }, devices: { cameraId: 'camera:chromium:device-1', micId: 'microphone:chromium:device-1', systemAudioMode: 'off' }, shortcuts: {}, backgroundPresets: { colors: [], gradients: [] }, extras: {} }); capture.onPreferenceShortcut.mockReturnValue(() => undefined); capture.onCameraOverlayState.mockReturnValue(() => undefined); capture.onCameraOverlayHover.mockReturnValue(() => undefined); capture.onCameraShadow.mockReturnValue(() => undefined); browserSystemAudioMock.systemAudioSource.mockReturnValue({ id: 'system-audio:chromium:desktop-loopback', kind: 'system-audio', label: 'System audio', isDefault: true }); browserCameraMock.listBrowserCameras.mockResolvedValue([{ id: 'camera:chromium:device-1', kind: 'camera', label: 'Cam', isDefault: true }]); browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([{ id: 'microphone:chromium:device-1', kind: 'microphone', label: 'Mic', isDefault: true }]); browserCameraMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); browserMicrophoneMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); browserSystemAudioMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); capture.discover.mockResolvedValue(catalog); capture.getSources.mockResolvedValue([{ id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null }])
  })
  afterEach(() => {
    vi.useRealTimers()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete (navigator as { clipboard?: Clipboard }).clipboard
    if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand)
    else delete (document as { execCommand?: typeof document.execCommand }).execCommand
  })
  it('discovers defaults and starts a screen recording with selected sources', async () => {
    capture.startRecording.mockResolvedValue({ state: 'recording', sessionId: '019f84dd-4d9d-7f61-ac30-5da50169ecbc' }); const wrapper = mount(HUD, { global: { stubs } }); await ready(); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready()
    expect(capture.startRecording).not.toHaveBeenCalled(); expect(browserCameraMock.request).not.toHaveBeenCalled(); expect(browserMicrophoneMock.request).not.toHaveBeenCalled(); expect(wrapper.emitted('start-recording')).toEqual([[expect.objectContaining({ screenKind: 'display', screenId: 'display:1', microphoneId: 'microphone:chromium:device-1', cameraId: 'camera:chromium:device-1', systemAudio: false, targetFps: 60 })]])
  })
  it('shows actionable errors when discovery or recording fails', async () => {
    capture.discover.mockRejectedValueOnce(new Error('permission denied')); const wrapper = mount(HUD, { global: { stubs } }); await ready(); expect(wrapper.get('[role=alert]').text()).toContain('permission denied'); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready(); expect(wrapper.emitted('start-recording')).toHaveLength(1); expect(wrapper.get('[role=alert]').text()).toContain('permission denied')
  })
  it('switches views and delegates window controls safely', async () => {
    const wrapper = mount(HUD, { global: { stubs } }); await ready(); await wrapper.get('[aria-label="Preferences"]').trigger('click'); expect(wrapper.find('.preferences-stub').exists()).toBe(true); await wrapper.get('.preferences-stub button').trigger('click'); await wrapper.get('.project-btn').trigger('click'); expect(wrapper.find('.project-picker-stub').exists()).toBe(true); await wrapper.get('[aria-label="Close"]').trigger('click'); expect(capture.close).toHaveBeenCalledOnce()
  })

  it('switches to window capture, handles device choices and preference shortcuts', async () => {
    capture.getSources.mockImplementation(async (types: string[]) => types[0] === 'window'
      ? [{ id: 'window:123', name: 'Editor window', thumbnail: 'thumb', appIcon: null }]
      : [{ id: 'display:preview', name: 'Display', thumbnail: 'thumb', displayId: 'display:1', displayBounds: { x: 0, y: 0, width: 1920, height: 1080 } }])
    capture.discover.mockResolvedValue({
      sources: [
        { id: 'display:1', kind: 'display', label: 'Display', isDefault: true },
        { id: 'window:7b', kind: 'window', label: 'Editor' },
      ],
      capabilities: { systemAudio: true },
    })
    const wrapper = mount(HUD, { global: { stubs } }); await ready()
    await wrapper.findAll('button').find((button) => button.text() === 'Window')?.trigger('click')
    await ready()
    expect(wrapper.find('.window-select').exists()).toBe(true)
    await wrapper.findAll('.window-option')[0]!.trigger('click')
    await wrapper.findAll('.select-option').find((button) => button.text() === 'System audio')?.trigger('click')
    await wrapper.findAll('.select-option').find((button) => button.text() === 'Mic')?.trigger('click')
    await wrapper.findAll('.select-option').find((button) => button.text() === 'Cam')?.trigger('click')
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!
    await record.trigger('click')
    expect(wrapper.emitted('start-recording')).toContainEqual([expect.objectContaining({ screenKind: 'window', screenId: 'window:7b', systemAudio: true, cameraId: 'camera:chromium:device-1', microphoneId: 'microphone:chromium:device-1' })])
    const shortcut = capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined
    shortcut?.('ignored.action')
    shortcut?.('hud.startStopRecording')
    await ready()
    expect(wrapper.emitted('start-recording')).toHaveLength(2)
    await wrapper.find('.select-control').trigger('click')
    expect(capture.setSize).toHaveBeenCalled()
  })

  it('selects and confirms a screen region, persists it, and handles region errors', async () => {
    capture.getPreferences.mockResolvedValue({ schemaVersion: 2, theme: 'system', recordingBar: { visibility: 'always' }, devices: {}, shortcuts: {}, backgroundPresets: { colors: [], gradients: [] }, extras: { screenRegion: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } } })
    capture.getSources.mockResolvedValue([{ id: 'display:preview', name: 'Display', thumbnail: 'thumb', displayId: 'display:1', displayBounds: { x: 10, y: 20, width: 1920, height: 1080 } }])
    capture.selectScreenRegion.mockResolvedValue({ x: 0.2, y: 0.25, width: 0.4, height: 0.3 })
    const wrapper = mount(HUD, { global: { stubs } }); await ready()
    const regionButton = wrapper.get('[aria-label="Select an area of the screen"]')
    await regionButton.trigger('click')
    vi.advanceTimersByTime(180)
    await ready()
    expect(capture.setWindowVisible).toHaveBeenNthCalledWith(1, false)
    expect(capture.selectScreenRegion).toHaveBeenCalledWith({ bounds: { x: 10, y: 20, width: 1920, height: 1080 }, region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } })
    expect(capture.updatePreferences).toHaveBeenCalledWith({ extras: { screenRegion: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 } } })
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true)
    expect(wrapper.find('[aria-label="Screen area selected"]').exists()).toBe(true)
    vi.advanceTimersByTime(700)
    capture.selectScreenRegion.mockRejectedValueOnce(new Error('region denied'))
    await wrapper.get('[aria-label="Screen area selected"]').trigger('click')
    vi.advanceTimersByTime(180)
    await ready()
    expect(wrapper.get('[role="alert"]').text()).toContain('region denied')
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true)
  })

  it('copies discovery errors through the clipboard fallback and clears copied state', async () => {
    capture.discover.mockRejectedValueOnce(new Error('discover failed'))
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const wrapper = mount(HUD, { global: { stubs } }); await ready()
    await wrapper.get('.capture-error-copy').trigger('click')
    await ready()
    expect(writeText).toHaveBeenCalledWith('discover failed')
    expect(wrapper.get('.capture-error-copy').text()).toContain('Copied')
    vi.advanceTimersByTime(2_000)
    await ready()
    expect(wrapper.get('.capture-error-copy').text()).toContain('Copy error')
  })

  it('stops an active session and reports the stop event', async () => {
    capture.stop.mockResolvedValue({ state: 'stopped', sessionId: 'session-1' })
    const wrapper = mount(HUD, { global: { stubs } }); await ready()
    ;(wrapper.vm as any).$.setupState.isRecording = true
    await wrapper.vm.$nextTick()
    const record = wrapper.findAll('button').find((button) => button.text().includes('Stop ('))!
    await record.trigger('click')
    await ready()
    expect(capture.stop).toHaveBeenCalledOnce()
    expect(wrapper.emitted('stop-recording')).toEqual([[{ state: 'stopped', sessionId: 'session-1' }]])
  })
})
