import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  setCountdown: vi.fn(),
  hideScreenRegionOverlay: vi.fn(),
  showScreenRegionOverlay: vi.fn(),
  prepareRecording: vi.fn().mockResolvedValue({ state: 'armed' }),
  startPreparedRecording: vi.fn(),
  cancelPreparedRecording: vi.fn().mockResolvedValue(undefined),
  discardRecording: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue({ state: 'completed' }),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  setTeleprompterSession: vi.fn(),
}))

vi.mock('../../../api/capture', () => ({ capture }))

import { useRecordingController } from './useRecordingController'
import type { RecordingConfiguration } from './recording-types'

const configuration = (
  countdownSeconds: number,
  overrides: Partial<RecordingConfiguration> = {},
): RecordingConfiguration => ({
  screenKind: 'display',
  screenId: 'display:1',
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  targetFps: 60,
  countdownSeconds,
  recordingBarVisibility: 'always',
  ...overrides,
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useRecordingController native lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(capture).forEach((mock) => mock.mockClear())
    capture.prepareRecording.mockResolvedValue({ state: 'armed' })
    capture.cancelPreparedRecording.mockResolvedValue(undefined)
    capture.discardRecording.mockResolvedValue(undefined)
    capture.stop.mockResolvedValue({ state: 'completed', sessionId: 'session-complete' })
    capture.pause.mockResolvedValue(undefined)
    capture.resume.mockResolvedValue(undefined)
  })

  afterEach(() => vi.useRealTimers())

  it('passes every selected device directly to native preparation', async () => {
    capture.startPreparedRecording.mockResolvedValue({ state: 'recording', sessionId: 'session-native' })
    const controller = useRecordingController(vi.fn())

    await controller.start(configuration(0, {
      cameraId: 'camera:nokhwa:0',
      microphoneId: 'microphone:cpal:device-1',
      systemAudio: true,
    }))

    expect(capture.prepareRecording).toHaveBeenCalledWith(expect.objectContaining({
      cameraId: 'camera:nokhwa:0',
      microphoneId: 'microphone:cpal:device-1',
      systemAudio: true,
      failurePolicy: 'fail-fast',
    }))
    expect(controller.phase.value).toBe('recording')
  })

  it('discards a native session that crosses countdown cancellation', async () => {
    const started = deferred<{ state: string; sessionId: string }>()
    capture.startPreparedRecording.mockReturnValue(started.promise)
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration(1))
    await vi.advanceTimersByTimeAsync(1_000)

    const cancellation = controller.cancel()
    started.resolve({ state: 'recording', sessionId: 'session-late' })
    await cancellation

    expect(capture.cancelPreparedRecording).not.toHaveBeenCalled()
    expect(capture.discardRecording).toHaveBeenCalledWith('session-late')
    expect(controller.phase.value).toBe('idle')
  })

  it('cancels an armed session before start was sent', async () => {
    capture.startPreparedRecording.mockResolvedValue({ state: 'recording', sessionId: 'unused' })
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration(5))

    await controller.cancel()

    expect(capture.startPreparedRecording).not.toHaveBeenCalled()
    expect(capture.cancelPreparedRecording).toHaveBeenCalledOnce()
    expect(controller.phase.value).toBe('idle')
  })

  it('discards an immediate start cancelled while its response is pending', async () => {
    const started = deferred<{ state: string; sessionId: string }>()
    capture.startPreparedRecording.mockReturnValue(started.promise)
    const controller = useRecordingController(vi.fn())
    const starting = controller.start(configuration(0))
    await Promise.resolve()

    const cancellation = controller.cancel()
    started.resolve({ state: 'recording', sessionId: 'session-immediate' })
    await Promise.all([starting, cancellation])

    expect(capture.discardRecording).toHaveBeenCalledWith('session-immediate')
    expect(controller.phase.value).toBe('idle')
  })

  it('stops through the single native stop command', async () => {
    const completed = vi.fn()
    capture.startPreparedRecording.mockResolvedValue({ state: 'recording', sessionId: 'session-stop' })
    const controller = useRecordingController(completed)
    await controller.start(configuration(0))

    await controller.stop()

    expect(capture.stop).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-complete' }))
    expect(controller.phase.value).toBe('idle')
  })

  it('restores the running timer when native pause fails', async () => {
    capture.startPreparedRecording.mockResolvedValue({ state: 'recording', sessionId: 'session-pause' })
    capture.pause.mockRejectedValueOnce(new Error('pause failed'))
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration(0))

    await controller.togglePause()
    await vi.advanceTimersByTimeAsync(200)

    expect(controller.phase.value).toBe('recording')
    expect(controller.error.value).toContain('pause failed')
    expect(controller.recordingTime.value).not.toBe('00:00.0')
  })

  it('synchronizes the active project and session with the teleprompter', async () => {
    const context = {
      projectId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
    }
    capture.startPreparedRecording.mockResolvedValue({ state: 'recording', ...context })
    const controller = useRecordingController(vi.fn())

    await controller.start(configuration(0))

    expect(capture.setTeleprompterSession).toHaveBeenCalledWith(context)
    await controller.cancel()
    expect(capture.setTeleprompterSession).toHaveBeenLastCalledWith(null)
  })
})
