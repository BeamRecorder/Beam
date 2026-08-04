import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  status: vi.fn(),
  getCameraOverlayState: vi.fn(),
  onCameraOverlayState: vi.fn(),
  onCameraOverlayHover: vi.fn(),
}))
vi.mock('../../../api/capture', () => ({ capture }))
vi.mock('../../../stores/theme', () => ({ useThemeStore: () => ({ theme: 'dark' }) }))

import CameraOverlayApp from './CameraOverlayApp.vue'

const CameraPreviewOverlay = {
  props: ['cameraId', 'isRecording', 'isHovered'],
  template: '<div class="camera-preview-stub">{{ cameraId }}</div>',
}

describe('CameraOverlayApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capture.status.mockResolvedValue({ state: 'recording' })
    capture.getCameraOverlayState.mockResolvedValue({ cameraId: 'camera:front' })
    capture.onCameraOverlayState.mockReturnValue(() => undefined)
    capture.onCameraOverlayHover.mockReturnValue(() => undefined)
  })

  it('loads state and tracks recording state', async () => {
    let stateListener!: (state: { cameraId: string }) => void
    let hoverListener!: (hovered: boolean) => void
    const stopState = vi.fn()
    const stopHover = vi.fn()
    capture.onCameraOverlayState.mockImplementation((listener) => {
      stateListener = listener
      return stopState
    })
    capture.onCameraOverlayHover.mockImplementation((listener) => {
      hoverListener = listener
      return stopHover
    })
    const wrapper = mount(CameraOverlayApp, { global: { stubs: { CameraPreviewOverlay } } })
    await vi.waitFor(() => expect(capture.status).toHaveBeenCalled())
    stateListener({ cameraId: 'camera:back' })
    hoverListener(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('camera:back')
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
