import { computed, onBeforeUnmount, watch, type Ref } from "vue";
import { activeClipsAt, sourceTimeAt } from "../composition/engine/clip-engine";
import { isAudioClip, type ClipComposition } from "../composition/composition-types";

const FADE_OUT_MS = 36;
const RESYNC_THRESHOLD_SECONDS = 0.16;

type PreviewAudio = {
  element: HTMLAudioElement;
  source: string;
};

export function useCompositionAudio(input: {
  composition: Ref<ClipComposition>;
  currentTime: Ref<number>;
  isPlaying: Ref<boolean>;
  volume: Ref<number>;
}) {
  const media = new Map<string, PreviewAudio>();
  const fadeFrames = new Map<string, number>();
  const audioClips = computed(() => input.composition.value.clips.filter(isAudioClip));

  const cancelFade = (id: string) => {
    const frame = fadeFrames.get(id);
    if (frame !== undefined) cancelAnimationFrame(frame);
    fadeFrames.delete(id);
  };

  const stop = (id: string, element: HTMLAudioElement) => {
    cancelFade(id);
    element.pause();
    element.removeAttribute("src");
    element.load();
  };

  const fadePause = (id: string, element: HTMLAudioElement) => {
    if (element.paused || fadeFrames.has(id)) return;
    const startedAt = performance.now();
    const initialVolume = element.volume;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / FADE_OUT_MS);
      element.volume = Math.max(0, initialVolume * (1 - progress));
      if (progress >= 1) {
        element.pause();
        fadeFrames.delete(id);
        return;
      }
      fadeFrames.set(id, requestAnimationFrame(tick));
    };
    fadeFrames.set(id, requestAnimationFrame(tick));
  };

  const reconcile = () => {
    const assets = new Map(input.composition.value.assets.map((asset) => [asset.id, asset]));
    const activeIds = new Set(audioClips.value.map((clip) => clip.id));
    for (const [id, preview] of media) {
      const clip = audioClips.value.find((entry) => entry.id === id);
      const asset = clip ? assets.get(clip.assetId) : null;
      if (activeIds.has(id) && asset?.src === preview.source) continue;
      stop(id, preview.element);
      media.delete(id);
    }
    for (const clip of audioClips.value) {
      const asset = assets.get(clip.assetId);
      if (!asset?.src || media.has(clip.id)) continue;
      const element = new Audio(asset.src);
      element.preload = "auto";
      element.volume = 0;
      element.preservesPitch = true;
      (element as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
      media.set(clip.id, { element, source: asset.src });
    }
  };

  const synchronize = () => {
    const timeMs = input.currentTime.value * 1_000;
    const active = new Set(
      input.isPlaying.value
        ? activeClipsAt(input.composition.value, timeMs).filter(isAudioClip).map((clip) => clip.id)
        : [],
    );
    const activeCount = Math.max(1, active.size);

    for (const clip of audioClips.value) {
      const element = media.get(clip.id)?.element;
      if (!element) continue;
      const sourceMs = sourceTimeAt(clip, timeMs);
      const sourceSeconds = sourceMs === null ? -1 : sourceMs / 1_000;
      const insideMedia = sourceSeconds >= 0
        && (!Number.isFinite(element.duration) || sourceSeconds < element.duration);
      const shouldPlay = active.has(clip.id) && insideMedia;

      if (!shouldPlay) {
        fadePause(clip.id, element);
        continue;
      }

      cancelFade(clip.id);
      const targetVolume = Math.max(
        0,
        Math.min(1, input.volume.value / 100 * clip.volume / 100 / activeCount),
      );
      element.volume += (targetVolume - element.volume) * 0.35;
      if (Math.abs(element.playbackRate - clip.playbackRate) > 0.001) {
        element.playbackRate = clip.playbackRate;
      }

      const drift = Math.abs(element.currentTime - sourceSeconds);
      if (element.paused) {
        element.currentTime = sourceSeconds;
        element.volume = targetVolume;
        void element.play().catch(() => undefined);
      } else if (!element.seeking && drift > RESYNC_THRESHOLD_SECONDS) {
        element.currentTime = sourceSeconds;
      }
    }
  };

  watch(
    [audioClips, () => input.composition.value.assets.map((asset) => `${asset.id}:${asset.src}`).join("|")],
    reconcile,
    { immediate: true, deep: true },
  );
  watch(
    [input.currentTime, input.isPlaying, input.volume, audioClips],
    synchronize,
    { immediate: true, deep: true, flush: "post" },
  );
  onBeforeUnmount(() => {
    for (const [id, preview] of media) stop(id, preview.element);
    media.clear();
  });

  return { audioClips };
}
