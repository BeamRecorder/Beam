import { computed, ref } from 'vue'
import { capture } from '../../../api/capture'
import { BrowserCameraRecorder } from '../../../api/camera-recorder'
import { BrowserMicrophoneRecorder } from '../../../api/microphone-recorder'
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder'
import type { RecordingConfiguration, RecordingPhase, RecordingSessionResult } from './recording-types'

type Recorder = BrowserCameraRecorder | BrowserMicrophoneRecorder | BrowserSystemAudioRecorder

const inactiveCamera = 'off'
const inactiveMicrophone = 'no-audio'

export function useRecordingController(onComplete: (session: RecordingSessionResult) => void) {
  const phase = ref<RecordingPhase>('idle')
  const secondsRemaining = ref(0)
  const cameraEnabled = ref(false)
  const microphoneEnabled = ref(false)
  const systemAudioEnabled = ref(false)
  const error = ref('')
  let configuration: RecordingConfiguration | null = null
  let countdown: number | null = null
  let sessionId: string | null = null
  let camera: BrowserCameraRecorder | null = null
  let microphone: BrowserMicrophoneRecorder | null = null
  let systemAudio: BrowserSystemAudioRecorder | null = null

  const isActive = computed(() => phase.value === 'countdown' || phase.value === 'recording' || phase.value === 'paused')
  const clearCountdown = () => { if (countdown !== null) window.clearInterval(countdown); countdown = null }
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
    await Promise.all([camera?.start(sessionId), microphone?.start(sessionId), systemAudio?.start(sessionId)])
  }

  const beginNativeRecording = async () => {
    if (!configuration) return
    const session = await capture.startRecording({ screenKind: configuration.screenKind, screenId: configuration.screenId, cameraId: null, microphoneId: null, systemAudio: false, cursor: true, targetFps: configuration.targetFps })
    if (!session.sessionId) throw new Error('The capture session did not provide an identifier.')
    sessionId = session.sessionId
    await startSidecars()
    phase.value = 'recording'
  }

  const start = async (next: RecordingConfiguration) => {
    if (isActive.value) return
    error.value = ''
    configuration = next
    try {
      await prepareSources()
      secondsRemaining.value = Math.max(0, next.countdownSeconds)
      phase.value = 'countdown'
      if (secondsRemaining.value === 0) return await beginNativeRecording()
      countdown = window.setInterval(() => {
        secondsRemaining.value -= 1
        if (secondsRemaining.value > 0) return
        clearCountdown()
        void beginNativeRecording().catch((reason: unknown) => { error.value = reason instanceof Error ? reason.message : String(reason); void cancel() })
      }, 1000)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      await cancel()
    }
  }

  const cancel = async () => {
    clearCountdown()
    await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
    camera = null; microphone = null; systemAudio = null; sessionId = null
    cameraEnabled.value = false; microphoneEnabled.value = false; systemAudioEnabled.value = false
    phase.value = 'idle'
  }

  const stop = async () => {
    if (phase.value === 'countdown') return cancel()
    if (phase.value !== 'recording' && phase.value !== 'paused') return
    phase.value = 'finalizing'
    try {
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)])
      const session = await capture.stop()
      await cancel()
      onComplete(session)
    } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason); phase.value = 'recording' }
  }

  const togglePause = async () => {
    if (!sessionId) return
    if (phase.value === 'recording') { await Promise.all([capture.pause(), camera?.pause(), microphone?.pause()]); phase.value = 'paused' }
    else if (phase.value === 'paused') { await Promise.all([capture.resume(), camera?.resume(sessionId), microphone?.resume(sessionId)]); phase.value = 'recording' }
  }
  const toggleCamera = async () => { if (!configuration || !sessionId) return; if (camera) { await stopRecorder(camera); camera = null; cameraEnabled.value = false } else { camera = await BrowserCameraRecorder.request(configuration.cameraId); await camera.start(sessionId); cameraEnabled.value = true } }
  const toggleMicrophone = async () => { if (!configuration || !sessionId) return; if (microphone) { await stopRecorder(microphone); microphone = null; microphoneEnabled.value = false } else { microphone = await BrowserMicrophoneRecorder.request(configuration.microphoneId); await microphone.start(sessionId); microphoneEnabled.value = true } }
  const toggleSystemAudio = async () => { if (!sessionId) return; if (systemAudio) { await stopRecorder(systemAudio); systemAudio = null; systemAudioEnabled.value = false } else { systemAudio = await BrowserSystemAudioRecorder.request(); await systemAudio.start(sessionId); systemAudioEnabled.value = true } }
  return { phase, secondsRemaining, cameraEnabled, microphoneEnabled, systemAudioEnabled, error, start, stop, cancel, togglePause, toggleCamera, toggleMicrophone, toggleSystemAudio }
}
