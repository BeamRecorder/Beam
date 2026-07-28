import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  getCameraOverlayState: vi.fn().mockResolvedValue(null),
  setCountdown: vi.fn(),
  prepareRecording: vi.fn().mockResolvedValue({ state: 'armed' }),
  startPreparedRecording: vi.fn(),
  cancelPreparedRecording: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue({ state: 'completed' }),
  pause: vi.fn(),
  resume: vi.fn(),
}))

vi.mock('../../../api/capture', () => ({ capture }))
vi.mock('../../../api/camera-recorder', () => ({ BrowserCameraRecorder: { request: vi.fn() } }))
vi.mock('../../../api/microphone-recorder', () => ({ BrowserMicrophoneRecorder: { request: vi.fn() } }))
vi.mock('../../../api/system-audio-recorder', () => ({ BrowserSystemAudioRecorder: { request: vi.fn() } }))

import { useRecordingController } from './useRecordingController'
import type { RecordingConfiguration } from './recording-types'

const configuration = (countdownSeconds: number): RecordingConfiguration => ({
  screenKind: 'display',
  screenId: 'display:1',
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  targetFps: 60,
  countdownSeconds,
  recordingBarVisibility: 'always',
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

describe('useRecordingController cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(capture).forEach((mock) => mock.mockClear())
    capture.getCameraOverlayState.mockResolvedValue(null)
    capture.stop.mockResolvedValue({ state: 'completed' })
  })

  afterEach(() => vi.useRealTimers())

  it('stops a native session that resolves after Stop during the countdown', async () => {
    const started = deferred<{ state: string; sessionId: string }>()
    capture.startPreparedRecording.mockReturnValue(started.promise)
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration(1))
    await vi.advanceTimersByTimeAsync(1_000)
    const cancellation = controller.cancel()
    started.resolve({ state: 'recording', sessionId: 'session-1' })
    await cancellation
    expect(capture.stop).toHaveBeenCalledOnce()
    expect(controller.phase.value).toBe('idle')
  })

  it('does not start native capture when cancelled before prewarming completes', async () => {
    const controller = useRecordingController(vi.fn())
    const starting = controller.start(configuration(0))
    await Promise.resolve()
    const cancellation = controller.cancel()
    await Promise.all([starting, cancellation])
    expect(capture.startPreparedRecording).not.toHaveBeenCalled()
    expect(capture.stop).not.toHaveBeenCalled()
    expect(controller.phase.value).toBe('idle')
  })

  it('starts only after the pre-warmed session is armed', async () => {
    const started = deferred<{ state: string; sessionId: string }>()
    capture.startPreparedRecording.mockReturnValue(started.promise)
    const controller = useRecordingController(vi.fn())
    const starting = controller.start(configuration(0))
    await vi.advanceTimersByTimeAsync(0)
    expect(capture.startPreparedRecording).toHaveBeenCalledOnce()
    started.resolve({ state: 'recording', sessionId: 'session-3' })
    await starting
    expect(controller.phase.value).toBe('recording')
  })
})
