<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import type { QuickSnipAutoClose } from '~/api/types/quick-snip';

const props = withDefaults(defineProps<{ countdown: QuickSnipAutoClose; paused?: boolean }>(), { paused: false });
const fill = ref<HTMLDivElement | null>(null);
let animation: Animation | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let motion: MediaQueryList | null = null;
const stop = () => {
  animation?.cancel();
  animation = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
};
const draw = () => {
  stop();
  if (!fill.value) return;
  const { deadlineMs, durationMs, remainingMs } = props.countdown;
  const remaining = Math.max(0, Math.min(durationMs, deadlineMs === null ? remainingMs : deadlineMs - Date.now()));
  const transform = `scaleX(${durationMs > 0 ? remaining / durationMs : 0})`;
  fill.value.style.transform = transform;
  if (props.paused || deadlineMs === null || remaining === 0) return;
  if (motion?.matches) {
    timer = setTimeout(draw, Math.min(1_000, remaining));
    return;
  }
  animation = fill.value.animate([{ transform }, { transform: 'scaleX(0)' }], {
    duration: remaining,
    easing: 'linear',
    fill: 'forwards',
  });
};
watch(
  [
    () => props.countdown.durationMs,
    () => props.countdown.deadlineMs,
    () => (props.countdown.deadlineMs === null ? props.countdown.remainingMs : null),
    () => props.paused,
  ],
  draw,
  { flush: 'post' },
);
onMounted(() => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', draw);
  draw();
});
onBeforeUnmount(() => {
  motion?.removeEventListener('change', draw);
  stop();
});
</script>

<template>
  <div class="close-countdown" aria-hidden="true">
    <div ref="fill" class="countdown-fill"><ProgressBar :value="100" /></div>
  </div>
</template>

<style scoped>
.close-countdown {
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-bg-surface-hover);
}
.countdown-fill {
  transform-origin: left center;
}
</style>
