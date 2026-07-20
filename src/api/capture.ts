import type { DesktopCaptureApi } from './types/capture-api'

declare global {
  interface Window {
    capture?: DesktopCaptureApi
  }
}

const resolveCaptureApi = (): DesktopCaptureApi => {
  if (typeof window === 'undefined' || !window.capture) {
    throw new Error('Capture API indisponible : le preload Electron n’a pas exposé window.capture.')
  }

  return window.capture
}

export const capture = resolveCaptureApi()
