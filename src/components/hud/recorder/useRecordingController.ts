import { computed, ref } from 'vue';
import { capture } from '../../../api/capture';
import {
  BrowserCameraRecorder,
  isCameraUnavailableError,
  listBrowserCameras,
  type CameraAppearance,
  type CameraPlacement,
} from '../../../api/camera-recorder';
import { BrowserMicrophoneRecorder, listBrowserMicrophones } from '../../../api/microphone-recorder';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import type { RecordingConfiguration, RecordingPhase, RecordingSessionResult } from './recording-types';

type Recorder = BrowserCameraRecorder | BrowserMicrophoneRecorder | BrowserSystemAudioRecorder;

const inactiveCamera = 'off';
const inactiveMicrophone = 'no-audio';
const DEFAULT_CAMERA_PLACEMENT: CameraPlacement = { x: 0.72, y: 0.72, width: 0.24, height: 0.24 };

export function useRecordingController(onComplete: (session: RecordingSessionResult) => void) {
  const phase = ref<RecordingPhase>('idle');
  const secondsRemaining = ref(0);
  const elapsedTenths = ref(0);
  const cameraEnabled = ref(false);
  const microphoneEnabled = ref(false);
  const systemAudioEnabled = ref(false);
  const recorderHoverOnlyActive = ref(false);
  const error = ref('');
  let configuration: RecordingConfiguration | null = null;
  let countdown: number | null = null;
  let timer: number | null = null;
  let sessionId: string | null = null;
  let projectId: string | null = null;
  let camera: BrowserCameraRecorder | null = null;
  let microphone: BrowserMicrophoneRecorder | null = null;
  let systemAudio: BrowserSystemAudioRecorder | null = null;
  let sessionTimelineStartedAt = 0;
  let recordingGeneration = 0;
  let pendingNativeStart: Promise<void> | null = null;
  let prewarm: Promise<boolean> | null = null;
  let preparedGeneration: number | null = null;
  let cancelling = false;

  const cameraMetadata = async (): Promise<{ appearance?: CameraAppearance; placement?: CameraPlacement }> => {
    const overlay = await capture.getCameraOverlayState();
    const appearance: CameraAppearance | undefined =
      overlay &&
      ['none', 'sm', 'md', 'lg'].includes(overlay.shadowSize) &&
      ['none', 'sm', 'md', 'lg', 'full'].includes(overlay.cornerRadius)
        ? {
            shadowSize: overlay.shadowSize as CameraAppearance['shadowSize'],
            cornerRadius: overlay.cornerRadius as CameraAppearance['cornerRadius'],
          }
        : undefined;
    // The native preview can be moved independently of the recorded canvas.
    // Start every recording from a deterministic, in-frame bottom-right layout;
    // the user can adjust the webcam clip later in the editor.
    return { appearance, placement: { ...DEFAULT_CAMERA_PLACEMENT } };
  };

  const isActive = computed(
    () => phase.value === 'countdown' || phase.value === 'recording' || phase.value === 'paused',
  );
  const clearCountdown = () => {
    if (countdown !== null) window.clearInterval(countdown);
    countdown = null;
  };
  const clearTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const timelineNowNs = () =>
    sessionId !== null
      ? Math.max(0, Math.round((performance.now() - sessionTimelineStartedAt) * 1_000_000))
      : undefined;
  const stopRecorder = async (recorder: Recorder | null, endNs?: number) => {
    await recorder?.stop(endNs).catch(() => undefined);
  };

  const prepareSources = async () => {
    if (!configuration) return;
    if (configuration.cameraId !== inactiveCamera) {
      try {
        camera = await BrowserCameraRecorder.request(configuration.cameraId);
      } catch (reason) {
        if (!isCameraUnavailableError(reason)) throw reason;
        configuration.cameraId = inactiveCamera;
        error.value = 'Camera is unavailable. Recording will continue without camera.';
      }
    }
    if (configuration.microphoneId !== inactiveMicrophone)
      microphone = await BrowserMicrophoneRecorder.request(configuration.microphoneId);
    if (configuration.systemAudio) systemAudio = await BrowserSystemAudioRecorder.request();
    cameraEnabled.value = Boolean(camera);
    microphoneEnabled.value = Boolean(microphone);
    systemAudioEnabled.value = Boolean(systemAudio);
  };

  const startSidecars = async () => {
    if (!sessionId) return;
    const { appearance, placement } = await cameraMetadata();
    await Promise.all([
      camera?.start(sessionId, appearance, placement, sessionTimelineStartedAt),
      microphone?.start(sessionId),
      systemAudio?.start(sessionId),
    ]);
  };

  const prewarmNativeRecording = async (generation: number) => {
    if (!configuration) return false;
    await capture.prepareRecording({
      screenKind: configuration.screenKind,
      screenId: configuration.screenId,
      cameraId: null,
      microphoneId: null,
      systemAudio: false,
      cursor: true,
      recordInteractions: configuration.recordInteractions === true,
      targetFps: configuration.targetFps,
      region: configuration.region,
    });
    if (generation !== recordingGeneration) {
      await capture.cancelPreparedRecording().catch(() => undefined);
      return false;
    }
    preparedGeneration = generation;
    return true;
  };

  const beginNativeRecording = async (generation: number) => {
    if (!configuration || generation !== recordingGeneration) return;
    if (!prewarm || !(await prewarm) || generation !== recordingGeneration) return;
    await capture.setCountdown(null);
    recorderHoverOnlyActive.value = configuration.recordingBarVisibility === 'hover-only';
    await capture.prepareRecordingSurface();
    const session = await capture.startPreparedRecording();
    // The native track creates the session timeline only once its start gate
    // is released. Sidecars must use that same epoch, otherwise native startup
    // latency is added to their final duration.
    sessionTimelineStartedAt = performance.now();
    preparedGeneration = null;
    if (generation !== recordingGeneration) {
      await capture.stop().catch(() => undefined);
      return;
    }
    if (!session.sessionId) throw new Error('The capture session did not provide an identifier.');
    sessionId = session.sessionId;
    projectId = session.projectId ?? null;
    if (projectId) capture.setTeleprompterSession({ projectId, sessionId });
    await startSidecars();
    if (generation !== recordingGeneration) {
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)]);
      await capture.stop().catch(() => undefined);
      return;
    }
    elapsedTenths.value = 0;
    timer = window.setInterval(() => {
      elapsedTenths.value += 1;
    }, 100);
    phase.value = 'recording';
  };

  const launchNativeRecording = (generation: number) => {
    const operation = beginNativeRecording(generation);
    pendingNativeStart = operation;
    void operation.finally(() => {
      if (pendingNativeStart === operation) pendingNativeStart = null;
    });
    return operation;
  };

  const start = async (next: RecordingConfiguration) => {
    if (isActive.value || pendingNativeStart) return;
    error.value = '';
    const generation = ++recordingGeneration;
    configuration = next;
    try {
      await prepareSources();
      if (next.region && next.regionOverlay)
        capture.showScreenRegionOverlay({ ...next.regionOverlay, region: next.region });
      secondsRemaining.value = Math.max(0, next.countdownSeconds);
      phase.value = 'countdown';
      prewarm = prewarmNativeRecording(generation);
      if (!(await prewarm) || generation !== recordingGeneration) return;
      if (secondsRemaining.value === 0) return await launchNativeRecording(generation);
      void capture.setCountdown(secondsRemaining.value);
      countdown = window.setInterval(() => {
        secondsRemaining.value -= 1;
        if (secondsRemaining.value > 0) {
          void capture.setCountdown(secondsRemaining.value);
          return;
        }
        clearCountdown();
        // The countdown is a visual gate, not part of the recording. Hide it
        // at the exact zero boundary before waiting on IPC/native start.
        void capture.setCountdown(null);
        const operation = launchNativeRecording(generation);
        void operation.catch((reason: unknown) => {
          error.value = reason instanceof Error ? reason.message : String(reason);
          void cancel();
        });
      }, 1000);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      await cancel();
    }
  };

  const resetState = async (sidecarsAlreadyStopped = false) => {
    recordingGeneration += 1;
    clearCountdown();
    await capture.setCountdown(null);
    capture.hideScreenRegionOverlay();
    clearTimer();
    if (!sidecarsAlreadyStopped)
      await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)]);
    camera = null;
    microphone = null;
    systemAudio = null;
    sessionId = null;
    projectId = null;
    sessionTimelineStartedAt = 0;
    cameraEnabled.value = false;
    microphoneEnabled.value = false;
    systemAudioEnabled.value = false;
    recorderHoverOnlyActive.value = false;
    elapsedTenths.value = 0;
    const pending = pendingNativeStart;
    const armed = prewarm;
    if (pending) await pending.catch(() => undefined);
    if (armed) await armed.catch(() => undefined);
    if (preparedGeneration !== null) {
      preparedGeneration = null;
      await capture.cancelPreparedRecording().catch(() => undefined);
    }
    prewarm = null;
    phase.value = 'idle';
  };

  const cancel = async () => {
    if (cancelling) return;
    cancelling = true;
    const nativeRecording = sessionId !== null;
    const nativeSessionId = sessionId;
    try {
      if (nativeRecording) phase.value = 'finalizing';
      const stopNs = nativeRecording ? timelineNowNs() : undefined;
      await Promise.all([
        stopRecorder(camera, stopNs),
        stopRecorder(microphone, stopNs),
        stopRecorder(systemAudio, stopNs),
      ]);
      if (nativeRecording) await capture.discardRecording(nativeSessionId ?? undefined);
      capture.setTeleprompterSession(null);
      await resetState(true);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      if (nativeRecording) phase.value = 'recording';
    } finally {
      cancelling = false;
    }
  };

  const stop = async () => {
    if (phase.value === 'countdown') return cancel();
    if (phase.value !== 'recording' && phase.value !== 'paused') return;
    const wasRecording = phase.value === 'recording';
    phase.value = 'finalizing';
    clearTimer();
    try {
      // Stop the native screen clock and request the sidecar recorders to stop
      // at the same moment. Track storage is completed only after all sidecars
      // have flushed their final chunks, so none can be cut off by native stop.
      const stopNs = timelineNowNs();
      const nativeStop = capture.stopNativeRecording();
      const sidecarsStop = Promise.all([
        stopRecorder(camera, stopNs),
        stopRecorder(microphone, stopNs),
        stopRecorder(systemAudio, stopNs),
      ]);
      const results = await Promise.allSettled([nativeStop, sidecarsStop]);
      const nativeResult = results[0];
      const sidecarsResult = results[1];
      if (nativeResult.status === 'rejected') throw nativeResult.reason;
      if (sidecarsResult.status === 'rejected') throw sidecarsResult.reason;
      const session = await capture.completeNativeRecording();
      capture.hideScreenRegionOverlay();
      await resetState(true);
      onComplete(session);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      phase.value = 'recording';
      if (wasRecording && timer === null) {
        timer = window.setInterval(() => {
          elapsedTenths.value += 1;
        }, 100);
      }
    }
  };

  const togglePause = async () => {
    if (!sessionId) return;
    if (phase.value === 'recording') {
      const pauseNs = timelineNowNs();
      await Promise.all([
        capture.pause(),
        camera?.pause(pauseNs),
        microphone?.pause(pauseNs),
        systemAudio?.pause(pauseNs),
      ]);
      clearTimer();
      phase.value = 'paused';
    } else if (phase.value === 'paused') {
      await Promise.all([
        capture.resume(),
        camera?.resume(sessionId),
        microphone?.resume(sessionId),
        systemAudio?.resume(sessionId),
      ]);
      timer = window.setInterval(() => {
        elapsedTenths.value += 1;
      }, 100);
      phase.value = 'recording';
    }
  };
  const resolveCameraSourceId = async () => {
    if (!configuration) return null;
    if (configuration.cameraId !== inactiveCamera) return configuration.cameraId;
    const sources = await listBrowserCameras();
    return (
      sources.find((source) => source.isDefault && source.id !== 'camera:chromium:')?.id ??
      sources.find((source) => source.id !== 'camera:chromium:')?.id ??
      null
    );
  };
  const resolveMicrophoneSourceId = async () => {
    if (!configuration) return null;
    if (configuration.microphoneId !== inactiveMicrophone) return configuration.microphoneId;
    const sources = await listBrowserMicrophones();
    return (
      sources.find((source) => source.isDefault && source.id !== 'microphone:chromium:')?.id ??
      sources.find((source) => source.id !== 'microphone:chromium:')?.id ??
      null
    );
  };
  const setToggleError = (reason: unknown) => {
    error.value = reason instanceof Error ? reason.message : String(reason);
  };
  const toggleCamera = async () => {
    if (!configuration || !sessionId) return;
    if (camera) {
      await stopRecorder(camera);
      camera = null;
      cameraEnabled.value = false;
      return;
    }
    try {
      const sourceId = await resolveCameraSourceId();
      if (!sourceId) throw new Error('No camera is available.');
      const { appearance, placement } = await cameraMetadata();
      const nextCamera = await BrowserCameraRecorder.request(sourceId);
      try {
        await nextCamera.start(sessionId, appearance, placement, sessionTimelineStartedAt);
      } catch (reason) {
        await stopRecorder(nextCamera);
        throw reason;
      }
      camera = nextCamera;
      configuration.cameraId = sourceId;
      cameraEnabled.value = true;
    } catch (reason) {
      if (isCameraUnavailableError(reason)) {
        configuration.cameraId = inactiveCamera;
        error.value = 'Camera is unavailable.';
      } else setToggleError(reason);
    }
  };
  const toggleMicrophone = async () => {
    if (!configuration || !sessionId) return;
    if (microphone) {
      await stopRecorder(microphone);
      microphone = null;
      microphoneEnabled.value = false;
      return;
    }
    try {
      const sourceId = await resolveMicrophoneSourceId();
      if (!sourceId) throw new Error('No microphone is available.');
      const nextMicrophone = await BrowserMicrophoneRecorder.request(sourceId);
      try {
        await nextMicrophone.start(sessionId);
      } catch (reason) {
        await stopRecorder(nextMicrophone);
        throw reason;
      }
      microphone = nextMicrophone;
      configuration.microphoneId = sourceId;
      microphoneEnabled.value = true;
    } catch (reason) {
      setToggleError(reason);
    }
  };
  const toggleSystemAudio = async () => {
    if (!sessionId) return;
    if (systemAudio) {
      await stopRecorder(systemAudio);
      systemAudio = null;
      systemAudioEnabled.value = false;
      return;
    }
    try {
      const nextSystemAudio = await BrowserSystemAudioRecorder.request();
      try {
        await nextSystemAudio.start(sessionId);
      } catch (reason) {
        await stopRecorder(nextSystemAudio);
        throw reason;
      }
      systemAudio = nextSystemAudio;
      systemAudioEnabled.value = true;
    } catch (reason) {
      setToggleError(reason);
    }
  };
  const recordingTime = computed(() => {
    const wholeSeconds = Math.floor(elapsedTenths.value / 10);
    return `${Math.floor(wholeSeconds / 60)
      .toString()
      .padStart(2, '0')}:${(wholeSeconds % 60).toString().padStart(2, '0')}.${elapsedTenths.value % 10}`;
  });
  return {
    phase,
    secondsRemaining,
    recordingTime,
    cameraEnabled,
    microphoneEnabled,
    systemAudioEnabled,
    recorderHoverOnlyActive,
    error,
    start,
    stop,
    cancel,
    togglePause,
    toggleCamera,
    toggleMicrophone,
    toggleSystemAudio,
  };
}
