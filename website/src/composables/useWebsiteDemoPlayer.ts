import { onScopeDispose, ref } from 'vue';
import { MediaPlaybackEngine, type PlaybackState } from '~/media/playback';
import type { ClipComposition, MediaError } from '~/media/shared';

export function useWebsiteDemoPlayer() {
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackState = ref<PlaybackState>('idle');
  const playbackError = ref<MediaError | null>(null);
  const frameVersion = ref(0);
  let engine: MediaPlaybackEngine | null = null;
  let activeLoad: Promise<void> | null = null;
  let desiredPlaying = false;
  let loadGeneration = 0;
  let disposed = false;

  const ensureEngine = () => {
    if (disposed) throw new Error('Website demo player is disposed.');
    if (engine) return engine;
    engine = new MediaPlaybackEngine();
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
    engine.on('error', (error) => {
      playbackError.value = error;
    });
    return engine;
  };

  const loadComposition = (composition: ClipComposition) => {
    const task = (async () => {
      const generation = ++loadGeneration;
      const previousTime = currentTime.value;
      duration.value = composition.clips.reduce(
        (end, clip) => Math.max(end, (clip.timelineStartMs + clip.timelineDurationMs) / 1_000),
        0,
      );
      playbackError.value = null;
      frameVersion.value += 1;
      const playback = ensureEngine();
      await playback.loadComposition(composition);
      if (disposed || generation !== loadGeneration || playback !== engine) return;
      if (previousTime > 0) await playback.seek(Math.min(previousTime, duration.value), 'seek');
      if (desiredPlaying) await playback.play(currentTime.value);
    })();
    activeLoad = task;
    return task.finally(() => {
      if (activeLoad === task) activeLoad = null;
    });
  };

  const setPlaying = async (playing: boolean) => {
    desiredPlaying = playing;
    if (playing && activeLoad) {
      await activeLoad;
      return;
    }
    const playback = ensureEngine();
    if (playing) await playback.play(currentTime.value);
    else playback.pause();
  };

  const seek = async (time: number, mode: 'seek' | 'scrub' = 'seek') => {
    if (!Number.isFinite(time)) throw new RangeError('Playback time must be finite.');
    const target = Math.max(0, Math.min(time, duration.value));
    currentTime.value = target;
    return ensureEngine().seek(target, mode);
  };

  onScopeDispose(() => {
    disposed = true;
    loadGeneration += 1;
    const playback = engine;
    engine = null;
    playback?.dispose();
  });

  return {
    isPlaying,
    currentTime,
    duration,
    playbackState,
    playbackError,
    frameVersion,
    loadComposition,
    setPlaying,
    seek,
    frameFor: (clipId: string) => engine?.frameFor(clipId) ?? null,
  };
}
