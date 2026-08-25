<script setup lang="ts">
import { computed } from 'vue';
import type { ColorClip } from '~/media/shared/composition-types';

const props = defineProps<{ clip: ColorClip }>();
const previewStyle = computed(() => {
  if (props.clip.fill.kind === 'color') return { background: props.clip.fill.color };
  const gradient = props.clip.fill.gradient;
  const stops = gradient.stops
    .map(
      (stop) =>
        `${stop.color}${Math.round(stop.alpha * 255)
          .toString(16)
          .padStart(2, '0')} ${stop.position * 100}%`,
    )
    .join(', ');
  return {
    background:
      gradient.type === 'radial'
        ? `radial-gradient(circle, ${stops})`
        : `linear-gradient(${gradient.angle}deg, ${stops})`,
  };
});
</script>

<template>
  <span class="color-preview" :style="previewStyle" aria-hidden="true" />
</template>

<style scoped>
.color-preview {
  position: absolute;
  inset: 0;
}
</style>
