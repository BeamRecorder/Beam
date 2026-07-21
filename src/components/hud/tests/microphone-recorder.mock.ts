import { vi } from 'vitest'

export const browserMicrophoneMock = {
  listBrowserMicrophones: vi.fn(),
  request: vi.fn(),
  recordMicrophoneFailure: vi.fn(),
}

export const BrowserMicrophoneRecorder = { request: browserMicrophoneMock.request }
export const listBrowserMicrophones = browserMicrophoneMock.listBrowserMicrophones
export const recordMicrophoneFailure = browserMicrophoneMock.recordMicrophoneFailure
