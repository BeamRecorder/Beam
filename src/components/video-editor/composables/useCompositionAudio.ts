import { computed, onBeforeUnmount, watch, type Ref } from "vue";
import { activeClipsAt, sourceTimeAt } from "../composition/engine/clip-engine";
import { isAudioClip, type ClipComposition } from "../composition/composition-types";

export function useCompositionAudio(input: {
  composition: Ref<ClipComposition>;
  currentTime: Ref<number>;
  isPlaying: Ref<boolean>;
  volume: Ref<number>;
}) {
  const elements = new Map<string, HTMLAudioElement>();
  const audioClips = computed(() => input.composition.value.clips.filter(isAudioClip));

  const dispose = (element: HTMLAudioElement) => {
    element.pause();
    element.removeAttribute("src");
    element.load();
  };

  const reconcile = () => {
    const assets = new Map(input.composition.value.assets.map((asset) => [asset.id, asset]));
    const activeIds = new Set(audioClips.value.map((clip) => clip.id));
    for (const [id, element] of elements) {
      if (!activeIds.has(id)) { dispose(element); elements.delete(id); }
    }
    for (const clip of audioClips.value) {
      const asset = assets.get(clip.assetId);
      if (!asset?.src || elements.has(clip.id)) continue;
      const element = new Audio(asset.src);
      element.preload = "auto";
      elements.set(clip.id, element);
    }
  };

  const synchronize = () => {
    reconcile();
    const timeMs = input.currentTime.value * 1_000;
    const active = new Set(activeClipsAt(input.composition.value, timeMs).filter(isAudioClip).map((clip) => clip.id));
    const activeCount = Math.max(1, active.size);
    for (const clip of audioClips.value) {
      const element = elements.get(clip.id);
      if (!element) continue;
      const sourceMs = sourceTimeAt(clip, timeMs);
      if (!input.isPlaying.value || !active.has(clip.id) || sourceMs === null) {
        element.pause();
        continue;
      }
      const sourceSeconds = sourceMs / 1_000;
      if (sourceSeconds < 0 || (Number.isFinite(element.duration) && sourceSeconds >= element.duration)) {
        element.pause();
        continue;
      }
      element.volume = Math.max(0, Math.min(1, input.volume.value / 100 * clip.volume / 100 / Math.sqrt(activeCount)));
      element.playbackRate = clip.playbackRate;
      const drift = Math.abs(element.currentTime - sourceSeconds);
      if (element.paused || drift > .5) element.currentTime = sourceSeconds;
      void element.play().catch(() => undefined);
    }
  };

  watch([audioClips, input.currentTime, input.isPlaying, input.volume], synchronize, { immediate: true, deep: true });
  onBeforeUnmount(() => { for (const element of elements.values()) dispose(element); elements.clear(); });
  return { audioClips };
}
