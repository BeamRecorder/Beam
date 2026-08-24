import { computed, ref } from 'vue';
import { capture } from '../../../api/capture';
import { BrowserCameraRecorder, isCameraUnavailableError } from '../../../api/camera-recorder';
import { BrowserMicrophoneRecorder } from '../../../api/microphone-recorder';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import { useDeviceToggles } from './useDeviceToggles';
import { useRecordingHealth } from './useRecordingHealth';
import { useNativeSystemAudioLevel } from './useNativeSystemAudioLevel';
import { recordingCameraMetadata } from './recording-camera-metadata';
import { formatRecordingTime, isRecordingActivePhase } from './recording-types';
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
type SidecarStates = Record<SidecarKind, StartupSidecarState>;
const inactiveCamera = 'off';
const inactiveMicrophone = 'no-audio';
export function useRecordingController(
  onComplete: (session: RecordingSessionResult) => void,
  onStartupFailure?: (failure: RecordingStartFailure) => void,
) {
  const nativeSystemAudio = capture.platform === 'linux';
  const phase = ref<RecordingPhase>('idle');
  const secondsRemaining = ref(0);
  const elapsedTenths = ref(0);
  const cameraEnabled = ref(false);
  const microphoneEnabled = ref(false);
  const systemAudioEnabled = ref(false);
  const {
    level: systemAudioLevel,
    refresh: refreshSystemAudioLevel,
    reset: resetSystemAudioLevel,
  } = useNativeSystemAudioLevel(systemAudioEnabled, phase);
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
  let nativeCleanupBlocked = false;
  const sidecarStates = { camera: 'disabled', microphone: 'disabled', systemAudio: 'disabled' } as SidecarStates;
  const recordingHealth = useRecordingHealth(phase, error, () => systemAudio, cancel, stop);
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
    registerSystemAudioRecorder: recordingHealth.registerSystemAudioRecorder,
    setCameraEnabled: (enabled) => {
      cameraEnabled.value = enabled;
    },
    setMicrophoneEnabled: (enabled) => {
      microphoneEnabled.value = enabled;
    },
    setSystemAudioEnabled: (enabled) => {
      systemAudioEnabled.value = enabled;
    },
    canToggleSystemAudio: () => !nativeSystemAudio,
    setError: (message) => {
      error.value = message;
    },
    cameraMetadata: recordingCameraMetadata,
  });
  const isActive = computed(() => isRecordingActivePhase(phase.value));
  const cleanupStaleNativeStart = async (session: { sessionId?: string | null }) => {
    try {
      await capture.discardRecording(session.sessionId ?? undefined);
    } catch (reason) {
      nativeCleanupBlocked = true;
      const detail = reason instanceof Error ? reason.message : String(reason);
      error.value = `The cancelled recording could not be cleaned up safely: ${detail}. Restart Beam before recording again.`;
    }
  };
  const clearCountdown = () => {
    if (countdown !== null) window.clearInterval(countdown);
    countdown = null;
  };
  const clearTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const startTimer = () => {
    timer = window.setInterval(() => {
      elapsedTenths.value += 1;
      if (elapsedTenths.value % 2 === 0) void refreshSystemAudioLevel();
    }, 100);
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
    if (configuration.systemAudio && !nativeSystemAudio) {
      try {
        systemAudio = await BrowserSystemAudioRecorder.request();
        recordingHealth.registerSystemAudioRecorder(systemAudio);
        sidecarStates.systemAudio = 'prepared';
      } catch (reason) {
        sidecarStates.systemAudio = 'failed';
        throw reason;
      }
    }
    cameraEnabled.value = Boolean(camera);
    microphoneEnabled.value = Boolean(microphone);
    systemAudioEnabled.value = Boolean(systemAudio) || (nativeSystemAudio && configuration.systemAudio);
  };

  const startSidecars = async () => {
    if (!sessionId) return;
    const { appearance, placement } = await recordingCameraMetadata();
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
      systemAudio: configuration.systemAudio,
      cursor: true,
      recordInteractions: configuration.recordInteractions === true,
      targetFps: configuration.targetFps,
      region: configuration.region,
    });
    if (nativeSystemAudio && configuration.systemAudio) sidecarStates.systemAudio = 'prepared';
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
    const wasNativeStarted = nativeStarted;
    const wasNativePrepared = preparedGeneration === generation;
    const nativeSessionId = sessionId;
    await runCleanup(() => stopRecorderStrict(camera));
    await runCleanup(() => stopRecorderStrict(microphone));
    await runCleanup(() => stopRecorderStrict(systemAudio));
    if (wasNativeStarted || wasNativePrepared) {
      const before = cleanupErrors.length;
      await runCleanup(() => capture.discardRecording(nativeSessionId ?? undefined));
      nativeCleanupBlocked ||= cleanupErrors.length > before;
    }
    preparedGeneration = null;
    capture.setTeleprompterSession(null);
    if (cleanupErrors.length > 0) failure.cleanupErrors = cleanupErrors;
    error.value = failure.message;
    await resetState(true);
    if (nativeCleanupBlocked)
      error.value = `${failure.message} Native cleanup is unresolved; restart Beam before recording again.`;
    onStartupFailure?.(failure);
  };

  const performStartup = async (generation: number) => {
    if (!configuration) return;
    let stage: RecordingStartStage = 'prepare-native';
    let ownsPreparedSession = false;
    try {
      if (preparedGeneration !== generation || generation !== recordingGeneration) return;
      ownsPreparedSession = true;
      stage = 'start-native';
      await capture.setCountdown(null);
      recorderHoverOnlyActive.value = configuration.recordingBarVisibility === 'hover-only';
      await capture.prepareRecordingSurface();
      const session = await capture.startPreparedRecording();
      ownsPreparedSession = false;
      sessionTimelineStartedAt = performance.now();
      if (generation !== recordingGeneration) {
        await cleanupStaleNativeStart(session);
        return;
      }
      nativeStarted = true;
      if (nativeSystemAudio && configuration.systemAudio) sidecarStates.systemAudio = 'started';
      preparedGeneration = null;
      if (!session.sessionId) throw new Error('The capture session did not provide an identifier.');
      sessionId = session.sessionId;
      projectId = session.projectId ?? null;
      if (configuration.region && configuration.regionOverlay)
        capture.showScreenRegionOverlay({ ...configuration.regionOverlay, region: configuration.region });
      if (projectId) capture.setTeleprompterSession({ projectId, sessionId });
      stage = 'start-sidecars';
      await startSidecars();
      if (generation !== recordingGeneration) {
        await Promise.all([stopRecorder(camera), stopRecorder(microphone), stopRecorder(systemAudio)]);
        await cleanupStaleNativeStart(session);
        return;
      }
      elapsedTenths.value = 0;
      startTimer();
      phase.value = 'recording';
    } catch (reason) {
      if (generation !== recordingGeneration) {
        // Release a stale prepared session once its single-threaded native start returns.
        if (ownsPreparedSession) await capture.cancelPreparedRecording().catch(() => undefined);
        return;
      }
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
    if (nativeCleanupBlocked) {
      error.value ||= 'Native recording cleanup is unresolved. Restart Beam before recording again.';
      return;
    }
    if (isActive.value || pendingNativeStart || prewarm) {
      if (!isActive.value) error.value = 'The previous recording is still being cleaned up. Please try again.';
      return;
    }
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
      secondsRemaining.value = Math.max(0, next.countdownSeconds);
      phase.value = 'countdown';
      recordingHealth.start();
      stage = 'prepare-native';
      const preparation = prewarmNativeRecording(generation);
      prewarm = preparation;
      let prepared = false;
      try {
        prepared = await preparation;
      } finally {
        if (prewarm === preparation) prewarm = null;
      }
      if (!prepared || generation !== recordingGeneration) return;
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
    recordingHealth.reset();
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
    resetSystemAudioLevel();
    recorderHoverOnlyActive.value = false;
    elapsedTenths.value = 0;
    sidecarStates.camera = 'disabled';
    sidecarStates.microphone = 'disabled';
    sidecarStates.systemAudio = 'disabled';
    if (preparedGeneration !== null) {
      preparedGeneration = null;
      if (!pendingNativeStart) await capture.cancelPreparedRecording().catch(() => undefined);
    }
    phase.value = 'idle';
  };

  async function cancel() {
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
  }

  async function stop() {
    if (phase.value === 'countdown' || phase.value === 'starting') return cancel();
    if (phase.value !== 'recording' && phase.value !== 'paused') return;
    const wasRecording = phase.value === 'recording';
    phase.value = 'finalizing';
    clearTimer();
    try {
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
        startTimer();
      }
    }
  }

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
      resetSystemAudioLevel();
    } else if (phase.value === 'paused') {
      await Promise.all([
        capture.resume(),
        camera?.resume(sessionId),
        microphone?.resume(sessionId),
        systemAudio?.resume(sessionId),
      ]);
      startTimer();
      phase.value = 'recording';
    }
  };

  const recordingTime = computed(() => formatRecordingTime(elapsedTenths.value));
  return {
    phase,
    secondsRemaining,
    recordingTime,
    cameraEnabled,
    microphoneEnabled,
    systemAudioEnabled,
    systemAudioLevel,
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
