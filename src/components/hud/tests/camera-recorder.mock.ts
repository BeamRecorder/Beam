import { vi } from 'vitest'

export const browserCameraMock = {
  listBrowserCameras: vi.fn(),
  request: vi.fn(),
}

export const BrowserCameraRecorder = { request: browserCameraMock.request }
export const listBrowserCameras = browserCameraMock.listBrowserCameras
