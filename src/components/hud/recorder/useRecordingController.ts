import { computed, ref } from 'vue';
import { capture } from '../../../api/capture';
import {
  BrowserCameraRecorder,
  isCameraUnavailableError,
  type CameraAppearance,
  type CameraPlacement,
} from '../../../api/camera-recorder';
import { BrowserMicrophoneRecorder } from '../../../api/microphone-recorder';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import { useDeviceToggles } from './useDeviceToggles';
import type {
  RecordingConfiguration,
  RecordingPhase,
  RecordingSessionResult,
  RecordingStartFailure,
  RecordingStartStage,
  StartupSidecarState,
} from './recording-types';

type Recorder = BrowserCameraRecorder | BrowserMicrophoneRecorder | BrowserSystemAudioRecorder;
type SidecarKind = 'camera' | 'microphone' | 'systemAudio';

const inactiveCamera = 'off';
const inactiveMicrophone = 'no-audio';
const DEFAULT_CAMERA_PLACEMENT: CameraPlacement = { x: 0.72, y: 0.72, width: 0.24, height: 0.24 };

export function useRecordingController(
  onComplete: (session: RecordingSessionResult) => void,
  onStartupFailure?: (failure: RecordingStartFailure) => void,
) {
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
  let nativeStarted = false;
  let cancelling = false;
  const sidecarStates: Record<SidecarKind, StartupSidecarState> = {
    camera: 'disabled',
    microphone: 'disabled',
    systemAudio: 'disabled',
  };

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
    return { appearance, placement: { ...DEFAULT_CAMERA_PLACEMENT } };
  };

  const deviceToggles = useDeviceToggles({
    getConfiguration: () => configuration,
    setConfigurationCameraId: (id) => {
      if (configuration) configuration.cameraId = id;
    },
    setConfigurationMicrophoneId: (id) => {
      if (configuration) configuration.microphoneId = id;
    },
    getSessionId: () => sessionId,
    getSessionTimelineStartedAt: () => sessionTimelineStartedAt,
    getCamera: () => camera,
    setCamera: (recorder) => {
      camera = recorder;
    },
    getMicrophone: () => microphone,
    setMicrophone: (recorder) => {
      microphone = recorder;
    },
    getSystemAudio: () => systemAudio,
    setSystemAudio: (recorder) => {
      systemAudio = recorder;
    },
    setCameraEnabled: (enabled) => {
      cameraEnabled.value = enabled;
    },
    setMicrophoneEnabled: (enabled) => {
      microphoneEnabled.value = enabled;
    },
    setSystemAudioEnabled: (enabled) => {
      systemAudioEnabled.value = enabled;
    },
    setError: (message) => {
      error.value = message;
    },
    cameraMetadata,
  });

  const isActive = computed(
    () =>
      phase.value === 'countdown' ||
      phase.value === 'starting' ||
      phase.value === 'recording' ||
      phase.value === 'paused',
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
  const stopRecorderStrict = async (recorder: Recorder | null, endNs?: number) => {
    await recorder?.stop(endNs);
  };

  const prepareSources = async () => {
    if (!configuration) return;
    if (configuration.cameraId !== inactiveCamera) {
      try {
        camera = await BrowserCameraRecorder.request(configuration.cameraId);
        sidecarStates.camera = 'prepared';
      } catch (reason) {
        sidecarStates.camera = 'failed';
        if (!isCameraUnavailableError(reason)) throw reason;
        configuration.cameraId = inactiveCamera;
        sidecarStates.camera = 'disabled';
        error.value = 'Camera is unavailable. Recording will continue without camera.';
      }
    }
    if (configuration.microphoneId !== inactiveMicrophone) {
      try {
        microphone = await BrowserMicrophoneRecorder.request(configuration.microphoneId);
        sidecarStates.microphone = 'prepared';
      } catch (reason) {
        sidecarStates.microphone = 'failed';
        throw reason;
      }
    }
    if (configuration.systemAudio) {
      try {
        systemAudio = await BrowserSystemAudioRecorder.request();
        sidecarStates.systemAudio = 'prepared';
      } catch (reason) {
        sidecarStates.systemAudio = 'failed';
        throw reason;
      }
    }
    cameraEnabled.value = Boolean(camera);
    microphoneEnabled.value = Boolean(microphone);
    systemAudioEnabled.value = Boolean(systemAudio);
  };

  const startSidecars = async () => {
    if (!sessionId) return;
    const { appearance, placement } = await cameraMetadata();
    const results = await Promise.allSettled([
      camera?.start(sessionId, appearance, placement, sessionTimelineStartedAt),
      microphone?.start(sessionId),
      systemAudio?.start(sessionId),
    ]);
    const mark = (recorder: Recorder | null, kind: SidecarKind, result: PromiseSettledResult<void>) => {
      if (!recorder) return;
      sidecarStates[kind] = result.status === 'fulfilled' ? 'started' : 'failed';
    };
    mark(camera, 'camera', results[0]);
    mark(microphone, 'microphone', results[1]);
    mark(systemAudio, 'systemAudio', results[2]);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
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

  const startupFailure = (generation: number, stage: RecordingStartStage, reason: unknown): RecordingStartFailure => ({
    stage,
    message: reason instanceof Error ? reason.message : String(reason),
    nativePrepared: preparedGeneration === generation,
    nativeStarted,
    camera: sidecarStates.camera,
    microphone: sidecarStates.microphone,
    systemAudio: sidecarStates.systemAudio,
  });

  const terminateStartup = async (generation: number, failure: RecordingStartFailure) => {
    if (generation !== recordingGeneration) return;
    const cleanupErrors: string[] = [];
    const runCleanup = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (reason) {
        cleanupErrors.push(reason instanceof Error ? reason.message : String(reason));
      }
    };
    // Break any self-reference so resetState does not await the very operation
    // that is currently failing.
    pendingNativeStart = null;
    const wasNativeStarted = nativeStarted;
    const wasNativePrepared = preparedGeneration === generation;
    const nativeSessionId = sessionId;
    await runCleanup(() => stopRecorderStrict(camera));
    await runCleanup(() => stopRecorderStrict(microphone));
    await runCleanup(() => stopRecorderStrict(systemAudio));
    if (wasNativeStarted) await runCleanup(() => capture.discardRecording(nativeSessionId ?? undefined));
    else if (wasNativePrepared) await runCleanup(() => capture.cancelPreparedRecording());
    preparedGeneration = null;
    capture.setTeleprompterSession(null);
    if (cleanupErrors.length > 0) failure.cleanupErrors = cleanupErrors;
    error.value = failure.message;
    await resetState(true);
    onStartupFailure?.(failure);
  };

  const performStartup = async (generation: number) => {
    if (!configuration) return;
    let stage: RecordingStartStage = 'prepare-native';
    try {
      const prepared = prewarm ? await prewarm : false;
      if (!prepared || generation !== recordingGeneration) return;
      stage = 'start-native';
      await capture.setCountdown(null);
      recorderHoverOnlyActive.value = configuration.recordingBarVisibility === 'hover-only';
      await capture.prepareRecordingSurface();
      const session = await capture.startPreparedRecording();
      // The native track creates the session timeline only once its start gate
      // is released. Sidecars must use that same epoch, otherwise native startup
      // latency is added to their final duration.
      sessionTimelineStartedAt = performance.now();
      if (generation !== recordingGeneration) {
        await capture.stop().catch(() => undefined);
        return;
      }
      nativeStarted = true;
      preparedGeneration = null;
      if (!session.sessionId) throw new Error('The capture session did not provide an identifier.');
      sessionId = session.sessionId;
      projectId = session.projectId ?? null;
      if (projectId) capture.setTeleprompterSession({ projectId, sessionId });
      stage = 'start-sidecars';
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
    } catch (reason) {
      if (generation !== recordingGeneration) return;
      await terminateStartup(generation, startupFailure(generation, stage, reason));
    }
  };

  const launchNativeStartup = (generation: number) => {
    const operation = performStartup(generation).catch(() => undefined);
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
    preparedGeneration = null;
    nativeStarted = false;
    sidecarStates.camera = next.cameraId === inactiveCamera ? 'disabled' : 'failed';
    sidecarStates.microphone = next.microphoneId === inactiveMicrophone ? 'disabled' : 'failed';
    sidecarStates.systemAudio = next.systemAudio ? 'failed' : 'disabled';
    let stage: RecordingStartStage = 'prepare-sources';
    try {
      await prepareSources();
      if (generation !== recordingGeneration) return;
      if (next.region && next.regionOverlay)
        capture.showScreenRegionOverlay({ ...next.regionOverlay, region: next.region });
      secondsRemaining.value = Math.max(0, next.countdownSeconds);
      phase.value = 'countdown';
      stage = 'prepare-native';
      prewarm = prewarmNativeRecording(generation);
      if (!(await prewarm) || generation !== recordingGeneration) return;
      if (secondsRemaining.value === 0) {
        phase.value = 'starting';
        void launchNativeStartup(generation);
        return;
      }
      void capture.setCountdown(secondsRemaining.value);
      countdown = window.setInterval(() => {
        secondsRemaining.value = Math.max(0, secondsRemaining.value - 1);
        if (secondsRemaining.value > 0) {
          void capture.setCountdown(secondsRemaining.value);
          return;
        }
        clearCountdown();
        // The countdown is a visual gate, not part of the recording. Hide it
        // at the zero boundary before waiting on IPC/native start.
        void capture.setCountdown(null);
        phase.value = 'starting';
        void launchNativeStartup(generation);
      }, 1000);
    } catch (reason) {
      if (generation !== recordingGeneration) return;
      await terminateStartup(generation, startupFailure(generation, stage, reason));
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
    nativeStarted = false;
    cameraEnabled.value = false;
    microphoneEnabled.value = false;
    systemAudioEnabled.value = false;
    recorderHoverOnlyActive.value = false;
    elapsedTenths.value = 0;
    sidecarStates.camera = 'disabled';
    sidecarStates.microphone = 'disabled';
    sidecarStates.systemAudio = 'disabled';
    // Cancel a prepared native recording without waiting for a blocked start.
    if (preparedGeneration !== null) {
      preparedGeneration = null;
      void capture.cancelPreparedRecording().catch(() => undefined);
    }
    pendingNativeStart = null;
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
    if (phase.value === 'countdown' || phase.value === 'starting') return cancel();
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
    toggleCamera: deviceToggles.toggleCamera,
    toggleMicrophone: deviceToggles.toggleMicrophone,
    toggleSystemAudio: deviceToggles.toggleSystemAudio,
  };
}
