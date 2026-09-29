import { createRoot } from 'solid-js'
import { vi } from 'vitest'
import type { ApplicationServices } from '@argui/host'
import { BeamApi } from '../../src/solid/shared/beamApi'
import type { BeamPreferences, CaptureRequest, RecordingStatus } from '../../src/solid/shared/beamTypes'
import { useCaptureSession } from '../../src/solid/hud/useCaptureSession'

export const request: CaptureRequest = {
  mode: 'recorder', sourceMode: 'display', sourceId: 'x11:monitor:0',
  cameraId: null, microphoneId: 'mic', systemAudioId: null,
}
export const armed: RecordingStatus = { state: 'armed', sessionId: 'session', projectId: 'project' }
export const flush = async () => { for (let step = 0; step < 100; step++) await Promise.resolve() }
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export function captureFixture(countdownSeconds = 0) {
  const responses = new Map<string, () => Promise<unknown>>()
  const call = vi.fn(async (_service: string, method: string, _payload?: unknown) => {
    if (responses.has(method)) return responses.get(method)!()
    if (method === 'preferences') return preferences
    return armed
  })
  const services = {
    call,
    getMonitors: vi.fn(async () => [{ name: 'main', x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1, primary: true }]),
    getWindowInfo: vi.fn(async (_window?: string) => ({ visible: true, x: 0, y: 0, width: 560, height: 284, scaleFactor: 1,
      capabilities: { backend: 'x11' as string, absolutePosition: true } })),
    showWindow: vi.fn(async (_window: string) => undefined),
    setWindowSize: vi.fn(async () => undefined),
    setWindowPosition: vi.fn(async () => undefined),
    setWindowLevel: vi.fn(async () => undefined),
  }
  const api = new BeamApi(services as unknown as ApplicationServices)
  const preferences: BeamPreferences = { theme: 'dark', locale: 'en', captureMode: 'recorder',
    hudWindow: { width: 680, height: 252 }, shortcuts: {}, devices: {}, countdownSeconds }
  let dispose!: () => void
  const capture = createRoot(cleanup => { dispose = cleanup; return useCaptureSession(api, () => preferences) })
  return { capture, services, responses, preferences, dispose, calls: (method: string) => call.mock.calls.filter(item => item[1] === method) }
}
