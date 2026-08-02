import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecordingController } from '../useRecordingController'
import type { RecordingConfiguration } from '../recording-types'

const { capture } = vi.hoisted(() => ({
  capture: {
    setCountdown: vi.fn(),
    hideScreenRegionOverlay: vi.fn(),
    showScreenRegionOverlay: vi.fn(),
    prepareRecording: vi.fn(),
    startPreparedRecording: vi.fn(),
    cancelPreparedRecording: vi.fn(),
    discardRecording: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setTeleprompterSession: vi.fn(),
  },
}))

vi.mock('../../../../api/capture', () => ({ capture }))

const configuration = (overrides: Partial<RecordingConfiguration> = {}): RecordingConfiguration => ({
  screenKind: 'display', screenId: 'display:1', cameraId: 'off', microphoneId: 'no-audio',
  systemAudio: false, targetFps: 60, countdownSeconds: 0, recordingBarVisibility: 'always', ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  capture.prepareRecording.mockResolvedValue(undefined)
  capture.startPreparedRecording.mockResolvedValue({ state: 'recording', sessionId: 'session-1', projectId: 'project-1' })
  capture.cancelPreparedRecording.mockResolvedValue(undefined)
  capture.discardRecording.mockResolvedValue(undefined)
  capture.stop.mockResolvedValue({ state: 'completed', sessionId: 'session-1' })
  capture.pause.mockResolvedValue(undefined)
  capture.resume.mockResolvedValue(undefined)
})

afterEach(() => vi.useRealTimers())

describe('useRecordingController native flow', () => {
  it('passes native source selections to prepare and controls one native session', async () => {
    const complete = vi.fn()
    const controller = useRecordingController(complete)
    await controller.start(configuration({ cameraId: 'camera:nokhwa:0', microphoneId: 'microphone:cpal:default', systemAudio: true }))

    expect(capture.prepareRecording).toHaveBeenCalledWith(expect.objectContaining({
      cameraId: 'camera:nokhwa:0', microphoneId: 'microphone:cpal:default', systemAudio: true,
    }))
    expect(capture.startPreparedRecording).toHaveBeenCalledOnce()
    expect(controller.phase.value).toBe('recording')
    expect(controller.cameraEnabled.value).toBe(true)
    expect(controller.microphoneEnabled.value).toBe(true)
    expect(controller.systemAudioEnabled.value).toBe(true)

    await controller.togglePause()
    await controller.togglePause()
    await controller.stop()

    expect(capture.pause).toHaveBeenCalledOnce()
    expect(capture.resume).toHaveBeenCalledOnce()
    expect(capture.stop).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }))
    expect(controller.phase.value).toBe('idle')
  })

  it('waits for the native prewarm while counting down', async () => {
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration({ countdownSeconds: 2 }))
    expect(controller.phase.value).toBe('countdown')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(controller.secondsRemaining.value).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(controller.phase.value).toBe('recording')
    expect(capture.setCountdown).toHaveBeenCalledWith(0)
  })

  it('reports native stop failures', async () => {
    const failedStop = useRecordingController(vi.fn())
    await failedStop.start(configuration())
    capture.stop.mockRejectedValueOnce(new Error('native stop failed'))
    await failedStop.stop()
    expect(failedStop.phase.value).toBe('recording')
    expect(failedStop.error.value).toBe('native stop failed')
  })

  it('does not mutate native tracks after start', async () => {
    const controller = useRecordingController(vi.fn())
    await controller.start(configuration())
    await controller.toggleCamera()
    await controller.toggleMicrophone()
    await controller.toggleSystemAudio()
    expect(controller.error.value).toBe('System audio must be selected before recording starts.')
    expect(capture.prepareRecording).toHaveBeenCalledOnce()
  })
})
