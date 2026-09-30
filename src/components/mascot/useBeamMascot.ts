import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { createMascotMotion, mascotIsAnimated, MASCOT_CELEBRATION_SECONDS } from './mascot-motion';
import type { MascotPhase } from './mascot-types';

export function useBeamMascot(phase: Readonly<Ref<MascotPhase>>, active: Readonly<Ref<boolean>>) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = ref(media.matches);
  let elapsed = 0;
  let sample = createMascotMotion(phase.value);
  const motion = shallowRef(sample(elapsed, reducedMotion.value));
  let raf = 0;
  let last: number | null = null;
  let lastDraw = -Infinity;

  const draw = () => {
    motion.value = sample(elapsed, reducedMotion.value);
  };
  const shouldAnimate = () =>
    active.value && !document.hidden && mascotIsAnimated(phase.value, elapsed, reducedMotion.value);
  const tick = (ms: number) => {
    elapsed += last === null ? 0 : Math.min(Math.max(0, ms - last) / 1000, 0.1);
    last = ms;
    // Small UI artwork needs at most 30 SVG updates per second.
    if (ms - lastDraw >= 1000 / 30 || !shouldAnimate()) {
      draw();
      lastDraw = ms;
    }
    if (shouldAnimate()) raf = requestAnimationFrame(tick);
  };
  const synchronize = () => {
    cancelAnimationFrame(raf);
    last = null;
    lastDraw = -Infinity;
    if (reducedMotion.value && phase.value === 'completed') elapsed = MASCOT_CELEBRATION_SECONDS;
    draw();
    if (shouldAnimate()) raf = requestAnimationFrame(tick);
  };
  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion.value = event.matches;
    synchronize();
  };
  watch(phase, () => {
    elapsed = 0;
    sample = createMascotMotion(phase.value);
    synchronize();
  });
  watch(active, synchronize);
  onMounted(() => {
    media.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', synchronize);
    synchronize();
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf);
    media.removeEventListener('change', onMotionChange);
    document.removeEventListener('visibilitychange', synchronize);
  });
  return { motion };
}
