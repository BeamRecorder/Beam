import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({ capture: { configureCameraOverlay: vi.fn() } }))
vi.mock('../../../api/capture', () => ({ capture }))

import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

class FakeTrack {
  stop = vi.fn()
}

const Button = {
  emits: ['click'],
  template: '<button class="button-stub" @click="$emit(\'click\')"><slot /></button>',
}

let getUserMedia: ReturnType<typeof vi.fn>
let track: FakeTrack
let stream: MediaStream

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  track = new FakeTrack()
  stream = { getTracks: () => [track] } as unknown as MediaStream
  getUserMedia = vi.fn().mockResolvedValue(stream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperty(window, 'capture', { configurable: true, value: capture })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete window.capture
})

describe('CameraPreviewOverlay', () => {
  it('loads a camera and cleans up the stream', async () => {
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:front', isHovered: true },
    })
    await vi.runAllTimersAsync()
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { deviceId: { ideal: 'front' } } }))
    expect(wrapper.get('.camera-overlay-container').classes()).toContain('is-hovered')
    expect(wrapper.find('.camera-overlay-skeleton').exists()).toBe(false)

    wrapper.unmount()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  it('does not request the disabled camera and shows hardware errors', async () => {
    const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'off' } })
    await vi.runAllTimersAsync()
    expect(getUserMedia).not.toHaveBeenCalled()

    getUserMedia.mockRejectedValueOnce(new DOMException('Could not start video source', 'NotReadableError'))
    await wrapper.setProps({ cameraId: 'camera:chromium:broken' })
    await vi.waitFor(() => expect(wrapper.find('.camera-overlay-error').exists()).toBe(true))
    expect(capture.configureCameraOverlay).toHaveBeenCalledWith({ cameraId: 'off' })
    wrapper.unmount()
  })

  it('stops a stale stream when the selected camera changes while loading', async () => {
    let resolveRequest!: (value: MediaStream) => void
    const staleTrack = new FakeTrack()
    const staleStream = { getTracks: () => [staleTrack] } as unknown as MediaStream
    getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((resolve) => { resolveRequest = resolve }))
    const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'camera:chromium:first' } })
    await vi.runAllTimersAsync()
    await wrapper.setProps({ cameraId: 'off' })
    resolveRequest(staleStream)
    await Promise.resolve()
    expect(staleTrack.stop).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
