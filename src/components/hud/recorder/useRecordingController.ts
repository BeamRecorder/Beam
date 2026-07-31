import { computed, ref } from 'vue'
import { capture } from '../../../api/capture'
import { BrowserCameraRecorder, type CameraAppearance, type CameraPlacement } from '../../../api/camera-recorder'
import { BrowserMicrophoneRecorder } from '../../../api/microphone-recorder'
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder'
import type { RecordingConfiguration, RecordingPhase, RecordingSessionResult } from './recording-types'

type Recorder = BrowserCameraRecorder | BrowserMicrophoneRecorder | BrowserSystemAudioRecorder

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
  let camera: BrowserCameraRecorder | null = null
  let microphone: BrowserMicrophoneRecorder | null = null
  let systemAudio: BrowserSystemAudioRecorder | null = null
  let sessionTimelineStartedAt = 0
  let recordingGeneration = 0
  let pendingNativeStart: Promise<void> | null = null
  let prewarm: Promise<boolean> | null = null
  let preparedGeneration: number | null = null
  let cancelling = false

  const cameraMetadata = async (): Promise<{ appearance?: CameraAppearance; placement?: CameraPlacement }> => {
    const overlay = await capture.getCameraOverlayState()
    const appearance: CameraAppearance | undefined = overlay && ['none', 'sm', 'md', 'lg'].includes(overlay.shadowSize) && ['none', 'sm', 'md', 'lg', 'full'].includes(overlay.cornerRadius)
      ? { shadowSize: overlay.shadowSize as CameraAppearance['shadowSize'], cornerRadius: overlay.cornerRadius as CameraAppearance['cornerRadius'] }
      : undefined
    const placement = overlay?.placement
    const hasValidPlacement = placement && [placement.x, placement.y, placement.width, placement.height].every(Number.isFinite) && placement.width > 0 && placement.height > 0
    return { appearance, ...(hasValidPlacement ? { placement } : {}) }
  }

  const isActive = computed(() => phase.value === 'countdown' || phase.value === 'recording' || phase.value === 'paused')
  const clearCountdown = () => { if (countdown !== null) window.clearInterval(countdown); countdown = null }
  const clearTimer = () => { if (timer !== null) window.clearInterval(timer); timer = null }
  const stopRecorder = async (recorder: Recorder | null) => { await recorder?.stop().catch(() => undefined) }

  const prepareSources = async () => {
    if (!configuration) return
    if (configuration.cameraId !== inactiveCamera) camera = await BrowserCameraRecorder.request(configuration.cameraId)
    if (configuration.microphoneId !== inactiveMicrophone) microphone = await BrowserMicrophoneRecorder.request(configuration.microphoneId)
    if (configuration.systemAudio) systemAudio = await BrowserSystemAudioRecorder.request()
    cameraEnabled.value = Boolean(camera)
    microphoneEnabled.value = Boolean(microphone)
    systemAudioEnabled.value = Boolean(systemAudio)
  }

  const startSidecars = async () => {
    if (!sessionId) return
    const { appearance, placement } = await cameraMetadata()
    await Promise.all([camera?.start(sessionId, appearance, placement, sessionTimelineStartedAt), microphone?.start(sessionId), systemAudio?.start(sessionId)])
  }

  const prewarmNativeRecording = async (generation: number) => {
    if (!configuration) return false
    await capture.prepareRecording({ screenKind: configuration.screenKind, screenId: configuration.screenId, cameraId: null, microphoneId: null, systemAudio: false, cursor: true, targetFps: configuration.targetFps, region: configuration.region })
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
    sessionTimelineStartedAt = performance.now()
    const session = await capture.startPreparedRecording()
    preparedGeneration = null
    if (generation !== recordingGeneration) {
      await capture.stop().catch(() => undefined)
      return
    }
    if (!session.sessionId) throw new Error('The capture session did not provide an identifier.')
    sessionId = session.sessionId
    await startSidecars()
    if (generation !== recordingGeneration) {
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
      await capture.stop().catch(() => undefined)
      return
    }
    elapsedTenths.value = 0
    timer = window.setInterval(() => { elapsedTenths.value += 1 }, 100)
    phase.value = 'recording'
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
    configuration = next
    try {
      await prepareSources()
      if (next.region && next.regionOverlay) capture.showScreenRegionOverlay({ ...next.regionOverlay, region: next.region })
      secondsRemaining.value = Math.max(0, next.countdownSeconds)
      phase.value = 'countdown'
      capture.setCountdown(secondsRemaining.value)
      prewarm = prewarmNativeRecording(generation)
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

  const resetState = async (sidecarsAlreadyStopped = false) => {
    recordingGeneration += 1
    clearCountdown()
    capture.setCountdown(null)
    capture.hideScreenRegionOverlay()
    clearTimer()
    if (!sidecarsAlreadyStopped) await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
    camera = null; microphone = null; systemAudio = null; sessionId = null; sessionTimelineStartedAt = 0
    cameraEnabled.value = false; microphoneEnabled.value = false; systemAudioEnabled.value = false
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
    const nativeSessionId = sessionId
    try {
      if (nativeRecording) phase.value = 'finalizing'
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
      if (nativeRecording) await capture.discardRecording(nativeSessionId ?? undefined)
      await resetState(true)
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
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
      const session = await capture.stop()
      capture.hideScreenRegionOverlay()
      await resetState(true)
      onComplete(session)
    } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason); phase.value = 'recording' }
  }

  const togglePause = async () => {
    if (!sessionId) return
    if (phase.value === 'recording') { await Promise.all([capture.pause(), camera?.pause(), microphone?.pause()]); clearTimer(); phase.value = 'paused' }
    else if (phase.value === 'paused') { await Promise.all([capture.resume(), camera?.resume(sessionId), microphone?.resume(sessionId)]); timer = window.setInterval(() => { elapsedTenths.value += 1 }, 100); phase.value = 'recording' }
  }
  const toggleCamera = async () => { if (!configuration || !sessionId) return; if (camera) { await stopRecorder(camera); camera = null; cameraEnabled.value = false } else { const { appearance, placement } = await cameraMetadata(); camera = await BrowserCameraRecorder.request(configuration.cameraId); await camera.start(sessionId, appearance, placement, sessionTimelineStartedAt); cameraEnabled.value = true } }
  const toggleMicrophone = async () => { if (!configuration || !sessionId) return; if (microphone) { await stopRecorder(microphone); microphone = null; microphoneEnabled.value = false } else { microphone = await BrowserMicrophoneRecorder.request(configuration.microphoneId); await microphone.start(sessionId); microphoneEnabled.value = true } }
  const toggleSystemAudio = async () => { if (!sessionId) return; if (systemAudio) { await stopRecorder(systemAudio); systemAudio = null; systemAudioEnabled.value = false } else { systemAudio = await BrowserSystemAudioRecorder.request(); await systemAudio.start(sessionId); systemAudioEnabled.value = true } }
  const recordingTime = computed(() => {
    const wholeSeconds = Math.floor(elapsedTenths.value / 10)
    return `${Math.floor(wholeSeconds / 60).toString().padStart(2, '0')}:${(wholeSeconds % 60).toString().padStart(2, '0')}.${elapsedTenths.value % 10}`
  })
  return { phase, secondsRemaining, recordingTime, cameraEnabled, microphoneEnabled, systemAudioEnabled, error, start, stop, cancel, togglePause, toggleCamera, toggleMicrophone, toggleSystemAudio }
}
