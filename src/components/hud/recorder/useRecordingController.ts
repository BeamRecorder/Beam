import { computed, ref } from 'vue'
import { capture } from '../../../api/capture'
import type { RecordingConfiguration, RecordingPhase, RecordingSessionResult } from './recording-types'

const inactiveCamera = 'off'
const inactiveMicrophone = 'no-audio'

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
  let pendingNativeStart: Promise<void> | null = null
  let prewarm: Promise<boolean> | null = null
  let preparedGeneration: number | null = null
  let cancelling = false

  const isActive = computed(() => phase.value === 'countdown' || phase.value === 'recording' || phase.value === 'paused')
  const clearCountdown = () => { if (countdown !== null) window.clearInterval(countdown); countdown = null }
  const clearTimer = () => { if (timer !== null) window.clearInterval(timer); timer = null }

  const prepareNativeRecording = async (generation: number) => {
    if (!configuration) return false
    await capture.prepareRecording({
      screenKind: configuration.screenKind,
      screenId: configuration.screenId,
      cameraId: configuration.cameraId === inactiveCamera ? null : configuration.cameraId,
      microphoneId: configuration.microphoneId === inactiveMicrophone ? null : configuration.microphoneId,
      systemAudio: configuration.systemAudio,
      cursor: true,
      targetFps: configuration.targetFps,
      region: configuration.region,
    })
    if (generation !== recordingGeneration) {
      await capture.cancelPreparedRecording().catch(() => undefined)
      return false
    }
    preparedGeneration = generation
    return true
  }

  const beginNativeRecording = async (generation: number) => {
    if (!configuration || generation !== recordingGeneration) return
    if (!prewarm || !await prewarm || generation !== recordingGeneration) return
    capture.setCountdown(null)
    const session = await capture.startPreparedRecording()
    preparedGeneration = null
    if (generation !== recordingGeneration) {
      await capture.discardRecording(session.sessionId ?? undefined).catch(() => undefined)
      return
    }
    if (!session.sessionId) throw new Error('The capture session did not provide an identifier.')
    sessionId = session.sessionId
    projectId = session.projectId ?? null
    if (projectId) capture.setTeleprompterSession({ projectId, sessionId })
    elapsedTenths.value = 0
    timer = window.setInterval(() => { elapsedTenths.value += 1 }, 100)
    phase.value = 'recording'
  }

  const launchNativeRecording = (generation: number) => {
    const operation = beginNativeRecording(generation)
    pendingNativeStart = operation
    void operation.finally(() => { if (pendingNativeStart === operation) pendingNativeStart = null })
    return operation
  }

  const start = async (next: RecordingConfiguration) => {
    if (isActive.value || pendingNativeStart) return
    error.value = ''
    const generation = ++recordingGeneration
    configuration = next
    cameraEnabled.value = next.cameraId !== inactiveCamera
    microphoneEnabled.value = next.microphoneId !== inactiveMicrophone
    systemAudioEnabled.value = next.systemAudio
    try {
      if (next.region && next.regionOverlay) capture.showScreenRegionOverlay({ ...next.regionOverlay, region: next.region })
      secondsRemaining.value = Math.max(0, next.countdownSeconds)
      phase.value = 'countdown'
      capture.setCountdown(secondsRemaining.value)
      prewarm = prepareNativeRecording(generation)
      void prewarm.catch((reason: unknown) => { error.value = reason instanceof Error ? reason.message : String(reason); void cancel() })
      if (secondsRemaining.value === 0) return await launchNativeRecording(generation)
      countdown = window.setInterval(() => {
        secondsRemaining.value -= 1
        capture.setCountdown(secondsRemaining.value)
        if (secondsRemaining.value > 0) return
        clearCountdown()
        const operation = launchNativeRecording(generation)
        void operation.catch((reason: unknown) => { error.value = reason instanceof Error ? reason.message : String(reason); void cancel() })
      }, 1000)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      await cancel()
    }
  }

  const resetState = async () => {
    recordingGeneration += 1
    clearCountdown()
    capture.setCountdown(null)
    capture.hideScreenRegionOverlay()
    clearTimer()
    sessionId = null
    projectId = null
    configuration = null
    cameraEnabled.value = false
    microphoneEnabled.value = false
    systemAudioEnabled.value = false
    elapsedTenths.value = 0
    phase.value = 'idle'
    const pending = pendingNativeStart
    const armed = prewarm
    if (pending) await pending.catch(() => undefined)
    if (armed) await armed.catch(() => undefined)
    if (preparedGeneration !== null) {
      preparedGeneration = null
      await capture.cancelPreparedRecording().catch(() => undefined)
    }
    prewarm = null
  }

  const cancel = async () => {
    if (cancelling) return
    cancelling = true
    const nativeRecording = sessionId !== null
    try {
      if (nativeRecording) phase.value = 'finalizing'
      if (nativeRecording) await capture.discardRecording(sessionId ?? undefined)
      capture.setTeleprompterSession(null)
      await resetState()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      if (nativeRecording) phase.value = 'recording'
    } finally {
      cancelling = false
    }
  }

  const stop = async () => {
    if (phase.value === 'countdown') return cancel()
    if (phase.value !== 'recording' && phase.value !== 'paused') return
    phase.value = 'finalizing'
    try {
      const session = await capture.stop()
      await resetState()
      onComplete(session)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      phase.value = 'recording'
    }
  }

  const togglePause = async () => {
    if (!sessionId) return
    try {
      if (phase.value === 'recording') { await capture.pause(); clearTimer(); phase.value = 'paused' }
      else if (phase.value === 'paused') { await capture.resume(); timer = window.setInterval(() => { elapsedTenths.value += 1 }, 100); phase.value = 'recording' }
    } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
  }

  const unsupportedWhileRecording = (label: string) => {
    error.value = `${label} must be selected before recording starts.`
  }
  const toggleCamera = async () => unsupportedWhileRecording('Camera')
  const toggleMicrophone = async () => unsupportedWhileRecording('Microphone')
  const toggleSystemAudio = async () => unsupportedWhileRecording('System audio')

  const recordingTime = computed(() => {
    const wholeSeconds = Math.floor(elapsedTenths.value / 10)
    return `${Math.floor(wholeSeconds / 60).toString().padStart(2, '0')}:${(wholeSeconds % 60).toString().padStart(2, '0')}.${elapsedTenths.value % 10}`
  })

  return { phase, secondsRemaining, recordingTime, cameraEnabled, microphoneEnabled, systemAudioEnabled, error, start, stop, cancel, togglePause, toggleCamera, toggleMicrophone, toggleSystemAudio }
}
