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
const stubs = { Select: { props: ['modelValue'], template: '<button class="select">{{ modelValue }}</button>' }, WindowSelect: { template: '<button class="window-select" />' }, ProjectPicker: { template: '<div class="project-picker-stub" />' }, HudPreferences: { template: '<div class="preferences-stub"><button @click="$emit(\'close\')">Return</button></div>' }, CameraPreviewOverlay: { template: '<div class="camera-preview-stub" />' } }
const ready = async () => { await flushPromises(); await Promise.resolve() }

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
    Object.values(capture).forEach((mock) => mock.mockReset()); Object.values(browserCameraMock).forEach((mock) => mock.mockReset()); Object.values(browserMicrophoneMock).forEach((mock) => mock.mockReset()); Object.values(browserSystemAudioMock).forEach((mock) => mock.mockReset()); browserSystemAudioMock.systemAudioSource.mockReturnValue({ id: 'system-audio:chromium:desktop-loopback', kind: 'system-audio', label: 'System audio', isDefault: true }); browserCameraMock.listBrowserCameras.mockResolvedValue([{ id: 'camera:chromium:device-1', kind: 'camera', label: 'Cam', isDefault: true }]); browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([{ id: 'microphone:chromium:device-1', kind: 'microphone', label: 'Mic', isDefault: true }]); browserCameraMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); browserMicrophoneMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); browserSystemAudioMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() }); capture.discover.mockResolvedValue(catalog); capture.getSources.mockResolvedValue([{ id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null }])
  })
  afterEach(() => vi.useRealTimers())
  it('discovers defaults and starts a screen recording with selected sources', async () => {
    capture.startRecording.mockResolvedValue({ state: 'recording', sessionId: '019f84dd-4d9d-7f61-ac30-5da50169ecbc' }); const wrapper = mount(HUD, { global: { stubs } }); await ready(); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready()
    expect(capture.startRecording).toHaveBeenCalledWith(expect.objectContaining({ screenKind: 'display', screenId: 'display:1', microphoneId: null, cameraId: 'camera:chromium:device-1', systemAudio: false, targetFps: 60 })); expect(browserCameraMock.request).toHaveBeenCalledWith('camera:chromium:device-1'); expect(browserMicrophoneMock.request).toHaveBeenCalledWith('microphone:chromium:device-1'); expect(wrapper.emitted('start-recording')).toEqual([[{ state: 'recording', sessionId: '019f84dd-4d9d-7f61-ac30-5da50169ecbc' }]])
  })
  it('shows actionable errors when discovery or recording fails', async () => {
    capture.discover.mockRejectedValueOnce(new Error('permission denied')); const wrapper = mount(HUD, { global: { stubs } }); await ready(); expect(wrapper.get('[role=alert]').text()).toContain('permission denied'); capture.startRecording.mockRejectedValueOnce(new Error('disk full')); const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording')); await record?.trigger('click'); await ready(); expect(wrapper.get('[role=alert]').text()).toContain('disk full')
  })
  it('switches views and delegates window controls safely', async () => {
    const wrapper = mount(HUD, { global: { stubs } }); await ready(); await wrapper.get('[aria-label="Preferences"]').trigger('click'); expect(wrapper.find('.preferences-stub').exists()).toBe(true); await wrapper.get('.preferences-stub button').trigger('click'); await wrapper.get('.project-btn').trigger('click'); expect(wrapper.find('.project-picker-stub').exists()).toBe(true); await wrapper.get('[aria-label="Close"]').trigger('click'); expect(capture.close).toHaveBeenCalledOnce()
  })
})
