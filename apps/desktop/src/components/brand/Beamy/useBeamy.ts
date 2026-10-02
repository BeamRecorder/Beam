import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { createBeamyMotion, beamyIsAnimated, BEAMY_CELEBRATION_SECONDS, BEAMY_SETTLE_SECONDS } from './beamy-motion';
import type { BeamyPhase } from './beamy-types';

export function useBeamy(
  phase: Readonly<Ref<BeamyPhase>>,
  active: Readonly<Ref<boolean>>,
  cycleOffset: Readonly<Ref<number>>,
) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = ref(media.matches);
  let elapsed = 0;
  let sample = createBeamyMotion(phase.value, cycleOffset.value);
  const motion = shallowRef(sample(elapsed, reducedMotion.value));
  let transition = motion.value.shape;
  let settling = false;
  let raf = 0;
  let last: number | null = null;
  let lastDraw = -Infinity;

  const draw = () => {
    motion.value = sample(
      elapsed,
      reducedMotion.value,
      transition,
      settling && active.value ? elapsed / BEAMY_SETTLE_SECONDS : 1,
    );
    if (elapsed >= BEAMY_SETTLE_SECONDS) settling = false;
  };
  const shouldAnimate = () =>
    active.value &&
    !document.hidden &&
    !reducedMotion.value &&
    (settling || beamyIsAnimated(phase.value, elapsed, reducedMotion.value));
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
    if (reducedMotion.value && phase.value === 'completed') elapsed = BEAMY_CELEBRATION_SECONDS;
    draw();
    if (shouldAnimate()) raf = requestAnimationFrame(tick);
  };
  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion.value = event.matches;
    synchronize();
  };
  watch([phase, cycleOffset], () => {
    transition = motion.value.shape;
    elapsed = 0;
    sample = createBeamyMotion(phase.value, cycleOffset.value);
    settling = transition.some((radius, index) => Math.abs(radius - sample(0).shape[index]!) > 0.00001);
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
