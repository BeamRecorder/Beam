<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
const props = defineProps<{ width: number; height: number; live?: boolean }>();
const offsets = ref<Record<string, number>>({});
let frame: number | null = null;
const digits = computed(() =>
  [props.width, props.height].map((value) => String(Math.round(value)).split('').map(Number)),
);
let lastTime: number | null = null;
const tick = (time: number) => {
  const decay = Math.exp(-Math.min(32, lastTime === null ? 16 : time - lastTime) / 22);
  lastTime = time;
  let moving = false;
  for (const key of Object.keys(offsets.value)) {
    const next = offsets.value[key]! * decay;
    offsets.value[key] = Math.abs(next) < 0.005 ? 0 : next;
    moving ||= offsets.value[key] !== 0;
  }
  frame = moving ? requestAnimationFrame(tick) : null;
  if (!moving) lastTime = null;
};
watch(
  () => [props.width, props.height, props.live] as const,
  ([width, height, live], [oldWidth, oldHeight]) => {
    if (live || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (frame !== null) cancelAnimationFrame(frame);
      offsets.value = {};
      frame = null;
      lastTime = null;
      return;
    }
    const target = [width, height];
    const previous = [oldWidth, oldHeight];
    let changed = false;
    // Real dimensions update immediately; one RAF clock only settles the changed reels.
    digits.value.forEach((number, row) =>
      number.forEach((digit, column) => {
        const place = number.length - column - 1;
        const oldDigit = Math.floor(previous[row]! / 10 ** place) % 10;
        if (digit !== oldDigit) {
          offsets.value[`${row}:${place}`] = target[row]! >= previous[row]! ? -0.24 : 0.24;
          changed = true;
        }
      }),
    );
    if (changed && frame === null) frame = requestAnimationFrame(tick);
  },
);
onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame);
});
</script>

<template>
  <span class="region-size" :aria-label="`${width} × ${height}`" role="status">
    <template v-for="(number, index) in digits" :key="index">
      <span v-if="index" class="separator" aria-hidden="true">×</span>
      <span v-for="(digit, place) in number" :key="number.length - place" class="digit" aria-hidden="true">
        <span
          class="reel"
          :style="{
            transform: `translateY(${-(digit + 1 + (offsets[`${index}:${number.length - place - 1}`] ?? 0)) * 1.25}em)`,
          }"
        >
          <span v-for="n in 12" :key="n">{{ (n + 8) % 10 }}</span>
        </span>
      </span>
    </template>
    <span class="unit" aria-hidden="true">px</span>
  </span>
</template>

<style scoped>
.region-size {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  gap: 1px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-primary);
  font: 600 13px var(--font-sans);
  font-variant-numeric: tabular-nums;
  box-shadow: var(--shadow-sm);
}
.digit {
  display: inline-block;
  height: 1.25em;
  width: 0.65em;
  overflow: hidden;
}
.reel {
  display: flex;
  flex-direction: column;
  will-change: transform;
}
.reel > span {
  height: 1.25em;
  line-height: 1.25em;
  flex-shrink: 0;
}
.separator {
  margin: 0 5px;
  color: var(--text-muted);
}
.unit {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: 11px;
}
</style>
