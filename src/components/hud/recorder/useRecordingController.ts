import { computed, ref } from 'vue';
import { capture } from '../../../api/capture';
import { CaptureSelectionCancelled, prepareNativeRecording } from './recording-native-preparation';
import { formatRecordingTime, isRecordingActivePhase } from './recording-types';
import type {
  RecordingConfiguration,
  RecordingPhase,
  RecordingSessionResult,
  RecordingStartFailure,
} from './recording-types';

export function useRecordingController(
  onComplete: (session: RecordingSessionResult) => void,
  onStartupFailure?: (failure: RecordingStartFailure) => void,
  onStartupCancelled?: () => void,
) {
  const phase = ref<RecordingPhase>('idle');
  const secondsRemaining = ref(0);
  const elapsedTenths = ref(0);
  const cameraEnabled = ref(false);
  const microphoneEnabled = ref(false);
  const systemAudioEnabled = ref(false);
  const systemAudioLevel = ref(0);
  const recorderHoverOnlyActive = ref(false);
  const error = ref('');
  const recordingTime = computed(() => formatRecordingTime(elapsedTenths.value));
  let generation = 0;
  let preparing = false;
  let pendingStart: Promise<void> | null = null;
  let sessionId: string | null = null;
  let countdown: number | null = null;
  let timer: number | null = null;
  let polling = false;
  let pollingTicks = 0;
  let cleanupBlocked = false;
  const clearTimers = () => {
    if (timer !== null) window.clearInterval(timer);
    if (countdown !== null) window.clearInterval(countdown);
    timer = null;
    countdown = null;
  };
  const reset = async () => {
    clearTimers();
    await capture.setCountdown(null);
    capture.hideScreenRegionOverlay();
    capture.setTeleprompterSession(null);
    sessionId = null;
    cameraEnabled.value = false;
    microphoneEnabled.value = false;
    systemAudioEnabled.value = false;
    systemAudioLevel.value = 0;
    recorderHoverOnlyActive.value = false;
    elapsedTenths.value = 0;
    phase.value = 'idle';
  };
  const poll = async () => {
    if (polling || !sessionId) return;
    polling = true;
    const current = generation;
    try {
      const status = await capture.status();
      if (current !== generation) return;
      const tracks = status.manifest?.tracks || [];
      const active = (kind: string) =>
        tracks.some((track) => track.kind === kind && ['recording', 'paused', 'preparing'].includes(track.status));
      cameraEnabled.value = active('camera');
      microphoneEnabled.value = active('microphone');
      systemAudioEnabled.value = active('system-audio');
      systemAudioLevel.value = status.systemAudioLevel ?? 0;
      const failed = tracks.filter((track) => ['failed', 'interrupted'].includes(track.status));
      if (failed.length)
        error.value = failed.map((track) => `${track.kind}: ${track.terminationReason || track.status}`).join('\n');
      if (status.error) error.value = status.error;
      if (['failed', 'interrupted'].includes(status.state)) {
        clearTimers();
        await reset();
        if (status.manifestPath) onComplete(status);
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      polling = false;
    }
  };
  const startTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (phase.value === 'recording') elapsedTenths.value += 1;
      if (++pollingTicks % 3 === 0) void poll();
    }, 100);
  };
  const cleanup = async (id?: string) => {
    try {
      await capture.discardRecording(id);
    } catch (reason) {
      cleanupBlocked = true;
      throw reason;
    }
  };
  const start = async (configuration: RecordingConfiguration) => {
    if (cleanupBlocked || preparing || pendingStart || phase.value !== 'idle') return;
    const current = ++generation;
    error.value = '';
    preparing = true;
    phase.value = 'countdown';
    let prepared = false;
    let started = false;
    const fail = async (reason: unknown) => {
      const failure: RecordingStartFailure = {
        stage: prepared ? 'start-native' : 'prepare-native',
        message: reason instanceof Error ? reason.message : String(reason),
        nativePrepared: prepared,
        nativeStarted: started,
        camera: configuration.cameraId === 'off' ? 'disabled' : 'failed',
        microphone: configuration.microphoneId === 'no-audio' ? 'disabled' : 'failed',
        systemAudio: configuration.systemAudio ? 'failed' : 'disabled',
      };
      if (prepared) {
        try {
          await cleanup(sessionId ?? undefined);
        } catch (cleanupError) {
          failure.cleanupErrors = [String(cleanupError)];
        }
      }
      if (current !== generation) return;
      await reset();
      if (reason instanceof CaptureSelectionCancelled) {
        onStartupCancelled?.();
        return;
      }
      error.value = failure.message;
      onStartupFailure?.(failure);
    };
    const begin = async () => {
      if (current !== generation) return;
      phase.value = 'starting';
      try {
        await capture.setCountdown(null);
        await capture.prepareRecordingSurface();
        const session = await capture.startPreparedRecording();
        started = true;
        if (current !== generation) {
          await cleanup(session.sessionId ?? undefined);
          return;
        }
        sessionId = session.sessionId ?? null;
        if (!sessionId) throw new Error('The native recording did not provide a session identifier.');
        if (session.projectId) capture.setTeleprompterSession({ projectId: session.projectId, sessionId });
        if (capture.platform !== 'linux' && configuration.region && configuration.regionOverlay)
          capture.showScreenRegionOverlay({ ...configuration.regionOverlay, region: configuration.region });
        recorderHoverOnlyActive.value = configuration.recordingBarVisibility === 'hover-only';
        phase.value = 'recording';
        startTimer();
        await poll();
      } catch (reason) {
        await fail(reason);
      }
    };
    const launch = () => {
      const operation = begin();
      pendingStart = operation;
      void operation.finally(() => {
        if (pendingStart === operation) pendingStart = null;
      });
    };
    try {
      const session = await prepareNativeRecording(configuration);
      prepared = true;
      if (current !== generation) {
        await cleanup(session.sessionId ?? undefined);
        return;
      }
      sessionId = session.sessionId ?? null;
      secondsRemaining.value = Math.max(0, configuration.countdownSeconds);
      if (!secondsRemaining.value) {
        launch();
        return;
      }
      await capture.setCountdown(secondsRemaining.value);
      countdown = window.setInterval(() => {
        secondsRemaining.value -= 1;
        if (secondsRemaining.value > 0) void capture.setCountdown(secondsRemaining.value);
        else {
          if (countdown !== null) window.clearInterval(countdown);
          countdown = null;
          launch();
        }
      }, 1000);
    } catch (reason) {
      await fail(reason);
    } finally {
      preparing = false;
    }
  };
  const cancel = async () => {
    if (phase.value === 'finalizing') return;
    generation += 1;
    const id = sessionId;
    phase.value = 'finalizing';
    clearTimers();
    try {
      // In-flight prepare/start owns its cleanup when the generation changes.
      if (id && !pendingStart) await cleanup(id);
      await reset();
    } catch (reason) {
      error.value = String(reason);
      phase.value = 'idle';
    }
  };
  const stop = async () => {
    if (['countdown', 'starting'].includes(phase.value)) return cancel();
    if (!['recording', 'paused'].includes(phase.value)) return;
    const previousPhase = phase.value;
    phase.value = 'finalizing';
    clearTimers();
    try {
      const session = await capture.stop();
      generation += 1;
      await reset();
      onComplete(session);
    } catch (reason) {
      error.value = String(reason);
      try {
        const status = await capture.status();
        if (['completed', 'failed', 'interrupted', 'idle'].includes(status.state)) {
          generation += 1;
          await reset();
          if (status.manifestPath) onComplete(status);
          return;
        }
        phase.value = status.state === 'paused' ? 'paused' : previousPhase;
      } catch {
        phase.value = previousPhase;
      }
      startTimer();
    }
  };
  const togglePause = async () => {
    if (!sessionId) return;
    try {
      if (phase.value === 'recording') {
        await capture.pause();
        phase.value = 'paused';
        systemAudioLevel.value = 0;
      } else if (phase.value === 'paused') {
        await capture.resume();
        phase.value = 'recording';
      }
    } catch (reason) {
      error.value = String(reason);
    }
  };
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
    isActive: computed(() => isRecordingActivePhase(phase.value)),
  };
}
