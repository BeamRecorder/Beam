import { vi } from 'vitest'

export const browserSystemAudioMock = {
  request: vi.fn(),
  recordSystemAudioFailure: vi.fn(),
  systemAudioSource: vi.fn(() => ({
    id: 'system-audio:chromium:desktop-loopback',
    kind: 'system-audio',
    label: 'System audio',
    isDefault: true,
  })),
}

export const BrowserSystemAudioRecorder = { request: browserSystemAudioMock.request }
export const recordSystemAudioFailure = browserSystemAudioMock.recordSystemAudioFailure
export const systemAudioSource = browserSystemAudioMock.systemAudioSource
