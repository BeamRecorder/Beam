import { computed, onBeforeUnmount, reactive, ref, type Ref } from 'vue';
import { capture } from '~/api/capture';
import { listBrowserMicrophones } from '~/api/microphone-recorder';
import { ProjectVoiceoverRecorder } from '~/api/project-voiceover-recorder';
import { inspectMedia, mediaSourceDescriptor, type DroppedMediaInspection, type MediaAsset } from '~/media/shared';
import type { VoiceoverDraft, VoiceoverPhase, VoiceoverRecorderState } from './voiceover-types';

const MAX_LIVE_BARS = 2_400;
const WAVEFORM_INTERVAL_MS = 50;

export function useEditorVoiceover(options: {
  projectId: () => string | null;
  currentTime: Ref<number>;
  duration: Ref<number>;
  projectVolume: Ref<number>;
  setPlaying: (playing: boolean) => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  insert: (asset: MediaAsset, inspection: DroppedMediaInspection, startMs: number) => string;
  normalize: (clipId: string) => Promise<void>;
  onCommit: () => void;
}) {
  const isOpen = ref(false);
  const phase = ref<VoiceoverPhase>('idle');
  const microphones = ref<Awaited<ReturnType<typeof listBrowserMicrophones>>>([]);
  const selectedMicrophoneId = ref<string | null>(null);
  const countdownSeconds = ref(3);
  const countdownRemaining = ref(0);
  const monitorProjectAudio = ref(false);
  const draft = ref<VoiceoverDraft | null>(null);
  const previewBars = ref<number[]>([]);
  const error = ref<string | null>(null);
  const elapsedMs = ref(0);
  let recorder: ProjectVoiceoverRecorder | null = null;
  let recorderGeneration = 0;
  let animationFrame = 0;
  let lastWaveformAt = 0;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let countdownResolve: (() => void) | null = null;
  let countdownGeneration = 0;
  let recordingStartedAt = 0;
  let recordedBeforePauseMs = 0;
  let playbackStoppedAtEnd = false;
  let previousProjectVolume: number | null = null;

  const elapsedLabel = computed(() => {
    const seconds = Math.floor(elapsedMs.value / 1_000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });
  const state = reactive<VoiceoverRecorderState>({
    get phase() {
      return phase.value;
    },
    get microphones() {
      return microphones.value;
    },
    get selectedMicrophoneId() {
      return selectedMicrophoneId.value;
    },
    get countdownSeconds() {
      return countdownSeconds.value;
    },
    get countdownRemaining() {
      return countdownRemaining.value;
    },
    get monitorProjectAudio() {
      return monitorProjectAudio.value;
    },
    get elapsedLabel() {
      return elapsedLabel.value;
    },
    get previewBars() {
      return previewBars.value;
    },
    get draft() {
      return draft.value;
    },
    get error() {
      return error.value;
    },
  });

  const open = async () => {
    if (isOpen.value) return;
    isOpen.value = true;
    error.value = null;
    phase.value = 'preparing';
    await options.setPlaying(false);
    try {
      const [available, preferences] = await Promise.all([listBrowserMicrophones(), capture.getPreferences()]);
      microphones.value = available;
      const preferred = preferences.devices.micId;
      countdownSeconds.value = preferences.voiceover?.countdownSeconds ?? 3;
      monitorProjectAudio.value = preferences.voiceover?.monitorProjectAudio ?? false;
      selectedMicrophoneId.value = available.some((item) => item.id === preferred)
        ? (preferred ?? null)
        : (available.find((item) => item.isDefault)?.id ?? available[0]?.id ?? null);
      if (!selectedMicrophoneId.value) throw new Error('No microphone is available.');
      await prepareMicrophone(selectedMicrophoneId.value);
    } catch (reason) {
      fail(reason);
    }
  };

  const prepareMicrophone = async (sourceId: string) => {
    const generation = ++recorderGeneration;
    recorder?.releasePreview();
    recorder = null;
    phase.value = 'preparing';
    error.value = null;
    const next = await ProjectVoiceoverRecorder.request(sourceId);
    if (generation !== recorderGeneration || !isOpen.value) {
      next.releasePreview();
      return;
    }
    next.onFatal((reason) => void handleFatal(reason));
    recorder = next;
    selectedMicrophoneId.value = sourceId;
    await capture.updatePreferences({ devices: { micId: sourceId } });
    phase.value = 'idle';
    startWaveformLoop();
  };

  const selectMicrophone = async (sourceId: string) => {
    if (!['idle', 'error'].includes(phase.value) || (sourceId === selectedMicrophoneId.value && recorder)) return;
    try {
      await prepareMicrophone(sourceId);
    } catch (reason) {
      fail(reason);
    }
  };

  const start = async () => {
    const projectId = options.projectId();
    if (!projectId || !recorder || phase.value !== 'idle') return;
    await options.setPlaying(false);
    const startMs = Math.max(0, Math.round(options.currentTime.value * 1_000));
    draft.value = { startMs, durationMs: 0, bars: [] };
    elapsedMs.value = 0;
    recordedBeforePauseMs = 0;
    playbackStoppedAtEnd = false;
    error.value = null;
    try {
      const generation = await runCountdown();
      if (generation !== countdownGeneration) return;
      if (!draft.value || !recorder) return;
      await recorder.start(projectId);
      recordingStartedAt = performance.now();
      phase.value = 'recording';
      applyMonitoring();
      await options.seek(startMs / 1_000);
      if (startMs < options.duration.value * 1_000) await options.setPlaying(true);
    } catch (reason) {
      await handleFatal(reason);
    }
  };

  const pause = async () => {
    if (phase.value !== 'recording' || !recorder) return;
    recordedBeforePauseMs = currentElapsedMs();
    elapsedMs.value = recordedBeforePauseMs;
    recorder.pause();
    await options.setPlaying(false);
    phase.value = 'paused';
  };

  const resume = async () => {
    if (phase.value !== 'paused' || !recorder) return;
    try {
      const generation = await runCountdown();
      if (generation !== countdownGeneration) return;
      if (!recorder || !draft.value) return;
      recorder.resume();
      recordingStartedAt = performance.now();
      phase.value = 'recording';
      if (!playbackStoppedAtEnd) await options.setPlaying(true);
    } catch (reason) {
      await handleFatal(reason);
    }
  };

  const stop = async () => {
    if (!recorder || !draft.value || !['recording', 'paused'].includes(phase.value)) return;
    if (phase.value === 'recording') recordedBeforePauseMs = currentElapsedMs();
    elapsedMs.value = recordedBeforePauseMs;
    phase.value = 'finalizing';
    await options.setPlaying(false);
    restoreMonitoring();
    const completedDraft = draft.value;
    try {
      const asset = await recorder.stop('Voice-over');
      recorder = null;
      const inspected = await inspectMedia(mediaSourceDescriptor(asset));
      const audioTrack = inspected.metadata.audioTracks[0];
      const inspection: DroppedMediaInspection = {
        kind: 'audio',
        durationMs: Math.round(inspected.metadata.durationSeconds * 1_000),
        width: null,
        height: null,
        hasAudio: inspected.capabilities.hasAudio,
        canDecodeAudio: audioTrack?.canDecode ?? false,
        audioCodec: audioTrack?.codec ?? null,
      };
      const clipId = options.insert(asset, inspection, completedDraft.startMs);
      draft.value = null;
      phase.value = 'idle';
      isOpen.value = false;
      options.onCommit();
      await options.normalize(clipId);
    } catch (reason) {
      fail(reason);
    }
  };

  const discard = async () => {
    cancelCountdown();
    await options.setPlaying(false);
    restoreMonitoring();
    const active = recorder;
    recorder = null;
    await active?.discard();
    draft.value = null;
    elapsedMs.value = 0;
    previewBars.value = [];
    phase.value = 'idle';
    error.value = null;
    isOpen.value = false;
    window.cancelAnimationFrame(animationFrame);
  };

  const updateCountdown = (seconds: number) => {
    if (!['idle', 'error'].includes(phase.value) || ![0, 3, 5, 10].includes(seconds)) return;
    countdownSeconds.value = seconds;
    void capture.updatePreferences({
      voiceover: { countdownSeconds: seconds as 0 | 3 | 5 | 10 },
    });
  };

  const toggleMonitoring = () => {
    monitorProjectAudio.value = !monitorProjectAudio.value;
    void capture.updatePreferences({
      voiceover: { monitorProjectAudio: monitorProjectAudio.value },
    });
    if (previousProjectVolume !== null)
      options.projectVolume.value = monitorProjectAudio.value ? previousProjectVolume : 0;
  };

  const runCountdown = () => {
    cancelCountdown();
    const generation = ++countdownGeneration;
    return new Promise<number>((resolve) => {
      countdownRemaining.value = countdownSeconds.value;
      if (countdownRemaining.value === 0) {
        resolve(generation);
        return;
      }
      phase.value = 'countdown';
      countdownResolve = () => resolve(generation);
      countdownTimer = setInterval(() => {
        countdownRemaining.value = Math.max(0, countdownRemaining.value - 1);
        if (countdownRemaining.value > 0) return;
        cancelCountdown(true);
      }, 1_000);
    });
  };

  const cancelCountdown = (complete = false) => {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    const resolve = countdownResolve;
    countdownResolve = null;
    resolve?.();
    if (!complete) countdownGeneration += 1;
  };

  const startWaveformLoop = () => {
    window.cancelAnimationFrame(animationFrame);
    const sample = (now: number) => {
      if (!isOpen.value || !recorder) return;
      animationFrame = window.requestAnimationFrame(sample);
      if (now - lastWaveformAt < WAVEFORM_INTERVAL_MS) return;
      lastWaveformAt = now;
      const samples = recorder.sampleWaveform(24);
      let amplitude = 0;
      for (const value of samples) amplitude = Math.max(amplitude, Math.abs(value));
      const bar = Math.max(1, Math.min(32, amplitude * 64));
      previewBars.value = [...previewBars.value.slice(-79), bar];
      if (phase.value !== 'recording' || !draft.value) return;
      elapsedMs.value = currentElapsedMs();
      const bars = appendBoundedBar(draft.value.bars, bar);
      draft.value = {
        ...draft.value,
        durationMs: Math.max(40, elapsedMs.value),
        bars,
      };
      if (!playbackStoppedAtEnd && draft.value.startMs + elapsedMs.value >= options.duration.value * 1_000) {
        playbackStoppedAtEnd = true;
        void options.setPlaying(false).catch(() => undefined);
      }
    };
    animationFrame = window.requestAnimationFrame(sample);
  };

  const currentElapsedMs = () => recordedBeforePauseMs + Math.max(0, performance.now() - recordingStartedAt);

  const applyMonitoring = () => {
    if (previousProjectVolume === null) previousProjectVolume = options.projectVolume.value;
    if (!monitorProjectAudio.value) options.projectVolume.value = 0;
  };
  const restoreMonitoring = () => {
    if (previousProjectVolume !== null) options.projectVolume.value = previousProjectVolume;
    previousProjectVolume = null;
  };
  const handleFatal = async (reason: unknown) => {
    await recorder?.discard();
    recorder = null;
    restoreMonitoring();
    await options.setPlaying(false);
    fail(reason);
  };
  const fail = (reason: unknown) => {
    error.value = reason instanceof Error ? reason.message : String(reason);
    phase.value = 'error';
  };

  onBeforeUnmount(() => {
    cancelCountdown();
    window.cancelAnimationFrame(animationFrame);
    restoreMonitoring();
    void recorder?.discard();
  });

  return {
    discard,
    isOpen,
    open,
    pause,
    resume,
    selectMicrophone,
    start,
    state,
    stop,
    toggleMonitoring,
    updateCountdown,
  };
}

function appendBoundedBar(bars: number[], value: number) {
  const next = [...bars, value];
  if (next.length <= MAX_LIVE_BARS) return next;
  const compacted: number[] = [];
  for (let index = 0; index < next.length; index += 2) compacted.push(Math.max(next[index] ?? 0, next[index + 1] ?? 0));
  return compacted;
}
