import { computed, ref } from 'vue'
import { capture } from '../../../api/capture'
import type { RecordingConfiguration, RecordingPhase, RecordingSessionResult } from './recording-types'

const inactiveCamera = 'off'
const inactiveMicrophone = 'no-audio'
const fixedSourcesMessage = 'Camera and audio sources are fixed for the current native recording. Stop the recording to change them.'

export function useRecordingController(onComplete: (session: RecordingSessionResult) => void) {
  const phase = ref<RecordingPhase>('idle')
  const secondsRemaining = ref(0)
  const elapsedTenths = ref(0)
  const cameraEnabled = ref(false)
  const microphoneEnabled = ref(false)
  const systemAudioEnabled = ref(false)
  const error = ref('')

  let configuration: RecordingConfiguration | null = null
  let countdown: number | null = null
  let timer: number | null = null
  let sessionId: string | null = null
  let projectId: string | null = null
  let recordingGeneration = 0
  let preparedGeneration: number | null = null
  let pendingNativeStart: Promise<void> | null = null
  let recordingStartedAt = 0
  let elapsedBeforeResume = 0
  let cancelling = false

  const isActive = computed(() => phase.value === 'countdown' || phase.value === 'recording' || phase.value === 'paused')

  const clearCountdown = () => {
    if (countdown !== null) window.clearInterval(countdown)
    countdown = null
  }

  const clearTimer = () => {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  const updateElapsed = () => {
    if (phase.value !== 'recording') return
    const elapsed = elapsedBeforeResume + performance.now() - recordingStartedAt
    elapsedTenths.value = Math.max(0, Math.floor(elapsed / 100))
  }

  const startTimer = () => {
    recordingStartedAt = performance.now()
    updateElapsed()
    timer = window.setInterval(updateElapsed, 50)
  }

  const stopTimer = () => {
    if (phase.value === 'recording') {
      elapsedBeforeResume += Math.max(0, performance.now() - recordingStartedAt)
      elapsedTenths.value = Math.max(0, Math.floor(elapsedBeforeResume / 100))
    }
    clearTimer()
  }

  const resetState = () => {
    clearCountdown()
    clearTimer()
    capture.setCountdown(null)
    capture.hideScreenRegionOverlay()
    configuration = null
    sessionId = null
    projectId = null
    preparedGeneration = null
    pendingNativeStart = null
    recordingStartedAt = 0
    elapsedBeforeResume = 0
    elapsedTenths.value = 0
    secondsRemaining.value = 0
    cameraEnabled.value = false
    microphoneEnabled.value = false
    systemAudioEnabled.value = false
    phase.value = 'idle'
  }

  const nativeOptions = (next: RecordingConfiguration) => ({
    screenKind: next.screenKind,
    screenId: next.screenId,
    cameraId: next.cameraId === inactiveCamera ? null : next.cameraId,
    microphoneId: next.microphoneId === inactiveMicrophone ? null : next.microphoneId,
    systemAudio: next.systemAudio,
    cursor: true,
    targetFps: next.targetFps,
    region: next.region,
    failurePolicy: 'fail-fast' as const,
  })

  const prepareNativeRecording = async (generation: number) => {
    if (!configuration) return false
    await capture.prepareRecording(nativeOptions(configuration))
    if (generation !== recordingGeneration) {
      await capture.cancelPreparedRecording().catch(() => undefined)
      return false
    }
    preparedGeneration = generation
    return true
  }

  const beginNativeRecording = async (generation: number) => {
    if (!configuration || generation !== recordingGeneration || preparedGeneration !== generation) return
    capture.setCountdown(null)
    const session = await capture.startPreparedRecording()
    preparedGeneration = null
    if (generation !== recordingGeneration) {
      await capture.discardRecording(session.sessionId ?? undefined).catch(() => undefined)
      return
    }
    if (!session.sessionId) throw new Error('The native capture session did not provide an identifier.')
    sessionId = session.sessionId
    projectId = session.projectId ?? null
    if (projectId) capture.setTeleprompterSession({ projectId, sessionId })
    elapsedBeforeResume = 0
    elapsedTenths.value = 0
    phase.value = 'recording'
    startTimer()
  }

  const launchNativeRecording = (generation: number) => {
    const operation = beginNativeRecording(generation)
    pendingNativeStart = operation
    void operation.finally(() => {
      if (pendingNativeStart === operation) pendingNativeStart = null
    })
    return operation
  }

  const start = async (next: RecordingConfiguration) => {
    if (isActive.value || pendingNativeStart) return
    error.value = ''
    const generation = ++recordingGeneration
    configuration = { ...next }
    cameraEnabled.value = next.cameraId !== inactiveCamera
    microphoneEnabled.value = next.microphoneId !== inactiveMicrophone
    systemAudioEnabled.value = next.systemAudio

    try {
      if (next.region && next.regionOverlay) {
        capture.showScreenRegionOverlay({ ...next.regionOverlay, region: next.region })
      }
      secondsRemaining.value = Math.max(0, next.countdownSeconds)
      phase.value = 'countdown'
      if (!await prepareNativeRecording(generation) || generation !== recordingGeneration) return
      if (secondsRemaining.value === 0) {
        await launchNativeRecording(generation)
        return
      }
      capture.setCountdown(secondsRemaining.value)
      const deadline = performance.now() + secondsRemaining.value * 1000
      countdown = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
        if (remaining === secondsRemaining.value) return
        secondsRemaining.value = remaining
        if (remaining > 0) {
          capture.setCountdown(remaining)
          return
        }
        clearCountdown()
        capture.setCountdown(null)
        const operation = launchNativeRecording(generation)
        void operation.catch((reason: unknown) => {
          error.value = reason instanceof Error ? reason.message : String(reason)
          void cancel()
        })
      }, 50)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      await cancel()
    }
  }

  const cancel = async () => {
    if (cancelling) return
    cancelling = true
    const activeSessionId = sessionId
    const hadPreparedSession = preparedGeneration !== null
    ++recordingGeneration
    clearCountdown()
    clearTimer()
    capture.setCountdown(null)
    try {
      if (activeSessionId) {
        phase.value = 'finalizing'
        await capture.discardRecording(activeSessionId)
      } else if (hadPreparedSession) {
        await capture.cancelPreparedRecording()
      }
      capture.setTeleprompterSession(null)
      resetState()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      phase.value = activeSessionId ? 'recording' : 'idle'
      if (activeSessionId) startTimer()
    } finally {
      cancelling = false
    }
  }

  const stop = async () => {
    if (phase.value === 'countdown') {
      await cancel()
      return
    }
    if (phase.value !== 'recording' && phase.value !== 'paused') return
    const previousPhase = phase.value
    if (previousPhase === 'recording') stopTimer()
    phase.value = 'finalizing'
    try {
      const session = await capture.stop()
      capture.setTeleprompterSession(null)
      resetState()
      onComplete(session)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      phase.value = previousPhase
      if (previousPhase === 'recording') startTimer()
    }
  }

  const togglePause = async () => {
    if (!sessionId) return
    if (phase.value === 'recording') {
      stopTimer()
      await capture.pause()
      phase.value = 'paused'
      return
    }
    if (phase.value === 'paused') {
      await capture.resume()
      phase.value = 'recording'
      startTimer()
    }
  }

  const rejectLiveSourceChange = () => {
    error.value = fixedSourcesMessage
  }

  const toggleCamera = async () => rejectLiveSourceChange()
  const toggleMicrophone = async () => rejectLiveSourceChange()
  const toggleSystemAudio = async () => rejectLiveSourceChange()

  const recordingTime = computed(() => {
    const wholeSeconds = Math.floor(elapsedTenths.value / 10)
    return `${Math.floor(wholeSeconds / 60).toString().padStart(2, '0')}:${(wholeSeconds % 60).toString().padStart(2, '0')}.${elapsedTenths.value % 10}`
  })

  return {
    phase,
    secondsRemaining,
    recordingTime,
    cameraEnabled,
    microphoneEnabled,
    systemAudioEnabled,
    error,
    start,
    stop,
    cancel,
    togglePause,
    toggleCamera,
    toggleMicrophone,
    toggleSystemAudio,
  }
}
