import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  BRAND_JINGLE_SECONDS,
  RESTING_WORDMARK,
  blendBrandLetters,
  chooseBrandJingle,
  sampleBrandJingle,
} from './brand-motion';
import type { BrandJingle } from './brand-types';

export function useBrandJingle() {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  const playing = ref(false);
  const letters = shallowRef(RESTING_WORDMARK);
  let jingle: BrandJingle | null = null;
  let transition = RESTING_WORDMARK;
  let frame = 0;
  let elapsed = 0;
  let previous: number | null = null;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    playing.value = false;
    letters.value = RESTING_WORDMARK;
    previous = null;
  };
  const tick = (time: number) => {
    elapsed += previous === null ? 0 : Math.max(0, Math.min(time - previous, 100)) / 1000;
    previous = time;
    if (elapsed >= BRAND_JINGLE_SECONDS) {
      stop();
      return;
    }
    letters.value = blendBrandLetters(transition, sampleBrandJingle(jingle!, elapsed), elapsed / 0.18);
    frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (reducedMotion || document.hidden) return;
    cancelAnimationFrame(frame);
    transition = letters.value;
    jingle = chooseBrandJingle(jingle);
    elapsed = 0;
    previous = null;
    playing.value = true;
    frame = requestAnimationFrame(tick);
  };
  const motionChanged = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches;
    if (reducedMotion) stop();
  };
  const visibilityChanged = () => {
    if (document.hidden) stop();
  };
  onMounted(() => {
    media.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
  });
  onBeforeUnmount(() => {
    stop();
    media.removeEventListener('change', motionChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
  });
  return { playing, letters, play };
}
