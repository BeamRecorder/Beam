import { createBrowserPlaybackEngine } from '@beam/runtime/browser';
import { createHtmlPlaybackClock } from '@beam/runtime/html/html-playback-source';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import type {
  MediaPlaybackEngine,
  AudioPlaybackMetrics,
  PlaybackMetrics,
  PlaybackState,
  PreviewQuality,
} from '@beam/runtime/playback/index';
import { compositionDurationMs, type ClipComposition, type MediaError } from '@beam/runtime/shared/index';
import { BACKGROUND_MEDIA, getRandomBackgroundImage, groupBackgroundMedia } from './backgroundCatalog';
import {
  type BackgroundMedia,
  type BackgroundMediaGroup,
  type BackgroundValue,
} from '@beam/engine/shared/background-types';

export function useVideoPlayer(availableBackgrounds: readonly BackgroundMedia[] = BACKGROUND_MEDIA) {
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(70);
  const playbackState = ref<PlaybackState>('idle');
  const playbackError = ref<MediaError | null>(null);
  const frameVersion = ref(0);
  const previewQuality = ref<PreviewQuality>('full');
  const playbackMetrics = ref<PlaybackMetrics | null>(null);
  const audioMetrics = ref<AudioPlaybackMetrics | null>(null);
  let engine: MediaPlaybackEngine | null = null;
  let loadGeneration = 0;
  let playingIntent = false;
  let intentGeneration = 0;
  const previewEpoch = ref(0);
  let disposed = false;
  const ensureEngine = () => {
    if (disposed) throw new Error('Video player is disposed.');
    if (engine) return engine;
    engine = createBrowserPlaybackEngine({
      previewQuality: previewQuality.value,
    });
    engine.on('time', (value) => {
      currentTime.value = value;
    });
    engine.on('frame', () => {
      frameVersion.value += 1;
    });
    engine.on('state', (value) => {
      playbackState.value = value;
      isPlaying.value = value === 'playing';
    });
    engine.on('error', (value) => {
      playingIntent = false;
      playbackError.value = value;
    });
    engine.on('metrics', (value) => {
      playbackMetrics.value = value;
    });
    engine.on('audio-metrics', (value) => {
      audioMetrics.value = value;
    });
    engine.setVolume(volume.value);
    return engine;
  };
  const selectedBackground = ref<BackgroundValue | null>(
    getRandomBackgroundImage(availableBackgrounds) ?? availableBackgrounds[0] ?? null,
  );
  const backgroundBlurPercent = ref(0);
  const importedBackgrounds = ref<BackgroundMedia[]>([]);
  const allBackgrounds = computed(() => [...importedBackgrounds.value, ...availableBackgrounds]);
  const backgroundGroups = computed<BackgroundMediaGroup[]>(() => groupBackgroundMedia(allBackgrounds.value));
  const selectedBackgroundMedia = computed(() => selectedBackground.value);
  const addBackground = (background: BackgroundMedia) => {
    importedBackgrounds.value = [
      background,
      ...importedBackgrounds.value.filter((item) => item.path !== background.path),
    ];
    selectedBackground.value = background;
  };
  const setUserBackgrounds = (backgrounds: BackgroundMedia[]) => {
    importedBackgrounds.value = backgrounds;
    if (
      selectedBackground.value &&
      (selectedBackground.value.kind === 'image' || selectedBackground.value.kind === 'video')
    ) {
      selectedBackground.value =
        allBackgrounds.value.find((item) => item.id === selectedBackground.value?.id) ??
        availableBackgrounds[0] ??
        null;
    }
  };
  const restoreBackgrounds = (backgrounds: BackgroundMedia[], selected: BackgroundValue | string | null) => {
    importedBackgrounds.value = backgrounds;
    selectedBackground.value =
      typeof selected === 'string'
        ? ([...backgrounds, ...availableBackgrounds].find(
            (background) => background.id === selected || background.path === selected,
          ) ??
          availableBackgrounds[0] ??
          null)
        : (selected ?? availableBackgrounds[0] ?? null);
  };
  const loadComposition = async (composition: ClipComposition) => {
    const endLoad = engineMetrics.begin('load');
    try {
      const generation = ++loadGeneration;
      const previousTime = currentTime.value;
      duration.value = compositionDurationMs(composition) / 1_000;
      playbackError.value = null;
      const playback = ensureEngine();
      const targetTime = Math.min(previousTime, duration.value);
      if (playback.canRetimeComposition(composition)) {
        await playback.retimeComposition(composition, targetTime);
      } else {
        // A full reload closes cached frames synchronously. Invalidate Vue
        // consumers before they can render one of those closed bitmaps.
        frameVersion.value += 1;
        await playback.loadComposition(composition, targetTime);
      }
      if (disposed || generation !== loadGeneration || playback !== engine) return;
      if (playingIntent) await playback.play(targetTime);
    } finally {
      endLoad();
    }
  };

  const setPlaying = async (playing: boolean) => {
    const generation = ++intentGeneration;
    previewEpoch.value++;
    playingIntent = playing;
    const playback = ensureEngine();
    try {
      if (playing) await playback.play(currentTime.value);
      else playback.pause();
    } catch (error) {
      if (playing && generation === intentGeneration) playingIntent = false;
      throw error;
    }
  };
  const togglePlay = () => setPlaying(!playingIntent);
  const seek = async (time: number, mode: 'seek' | 'scrub' = 'seek') => {
    if (!Number.isFinite(time)) throw new RangeError('Playback time must be finite.');
    const target = Math.max(0, Math.min(time, duration.value));
    previewEpoch.value++;
    currentTime.value = target;
    return engineMetrics.measureAsync('seek', () => ensureEngine().seek(target, mode));
  };
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError('Playback time must be a non-negative finite number.');
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  };
  const api = {
    htmlClock: createHtmlPlaybackClock(ensureEngine),
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackState,
    playbackError,
    frameVersion,
    previewEpoch,
    previewQuality,
    playbackMetrics,
    audioMetrics,
    engineMetrics: () => engineMetrics.snapshot(),
    resetEngineMetrics: () => {
      engineMetrics.reset();
      engine?.resetEngineMetrics();
    },
    selectedBackground,
    backgroundBlurPercent,
    selectedBackgroundMedia,
    backgroundGroups,
    importedBackgrounds,
    addBackground,
    setUserBackgrounds,
    restoreBackgrounds,
    loadComposition,
    setPlaying,
    togglePlay,
    seek,
    frameFor: (clipId: string) => engine?.frameFor(clipId) ?? null,
    formattedCurrentTime: computed(() => formatTime(currentTime.value)),
    formattedDuration: computed(() => formatTime(duration.value)),
    formatTime,
  };

  watch(volume, (value) => engine?.setVolume(value));
  watch(previewQuality, (value) => {
    void engine?.setPreviewQuality(value).catch((error) => {
      console.error('[Beam media:editor] Failed to update preview quality.', error);
    });
  });
  onScopeDispose(() => {
    disposed = true;
    playingIntent = false;
    loadGeneration += 1;
    const playback = engine;
    engine = null;
    playback?.dispose();
  });
  return api;
}
