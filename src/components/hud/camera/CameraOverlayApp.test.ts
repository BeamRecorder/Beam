import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  status: vi.fn(),
  getCameraOverlayState: vi.fn(),
  onCameraOverlayState: vi.fn(),
  onCameraOverlayHover: vi.fn(),
  configureCameraOverlay: vi.fn(),
}))
vi.mock('../../../api/capture', () => ({ capture }))
vi.mock('../../../stores/theme', () => ({ useThemeStore: () => ({ theme: 'dark' }) }))

import CameraOverlayApp from './CameraOverlayApp.vue'

const CameraPreviewOverlay = {
  emits: ['update:shadowSize', 'update:cornerRadius'],
  template: '<div class="camera-preview-stub"><button class="shadow-size" @click="$emit(\'update:shadowSize\', \'lg\')">Shadow</button><button class="corner-radius" @click="$emit(\'update:cornerRadius\', \'full\')">Corner</button></div>',
}

describe('CameraOverlayApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capture.status.mockResolvedValue({ state: 'recording' })
    capture.getCameraOverlayState.mockResolvedValue({ cameraId: 'camera:front', shadowSize: 'sm', cornerRadius: 'full' })
    capture.onCameraOverlayState.mockReturnValue(() => undefined)
    capture.onCameraOverlayHover.mockReturnValue(() => undefined)
  })

  it('loads state, tracks recording and forwards appearance updates', async () => {
    let stateListener!: (state: { cameraId: string; shadowSize: string; cornerRadius: string }) => void
    let hoverListener!: (hovered: boolean) => void
    const stopState = vi.fn()
    const stopHover = vi.fn()
    capture.onCameraOverlayState.mockImplementation((listener) => { stateListener = listener; return stopState })
    capture.onCameraOverlayHover.mockImplementation((listener) => { hoverListener = listener; return stopHover })
    const wrapper = mount(CameraOverlayApp, { global: { stubs: { CameraPreviewOverlay } } })
    await vi.waitFor(() => expect(capture.status).toHaveBeenCalled())
    stateListener({ cameraId: 'camera:back', shadowSize: 'md', cornerRadius: 'md' })
    hoverListener(true)
    await wrapper.vm.$nextTick()
    await wrapper.get('.shadow-size').trigger('click')
    await wrapper.get('.corner-radius').trigger('click')
    expect(capture.configureCameraOverlay).toHaveBeenNthCalledWith(1, { cameraId: 'camera:back', shadowSize: 'lg', cornerRadius: 'md' })
    expect(capture.configureCameraOverlay).toHaveBeenNthCalledWith(2, { cameraId: 'camera:back', shadowSize: 'md', cornerRadius: 'full' })
    wrapper.unmount()
    expect(stopState).toHaveBeenCalledOnce()
    expect(stopHover).toHaveBeenCalledOnce()
  })

  it('clears recording state when the native status call fails', async () => {
    capture.status.mockRejectedValue(new Error('status unavailable'))
    capture.getCameraOverlayState.mockResolvedValue(null)
    const wrapper = mount(CameraOverlayApp, { global: { stubs: { CameraPreviewOverlay } } })
    await vi.waitFor(() => expect(capture.status).toHaveBeenCalled())
    wrapper.unmount()
  })
})
