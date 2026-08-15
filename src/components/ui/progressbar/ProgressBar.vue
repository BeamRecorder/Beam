<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value?: number; // Value between 0 and 100 or 0 and 1
    max?: number;
    indeterminate?: boolean;
  }>(),
  {
    value: 0,
    max: 100,
  },
);

const percentage = computed(() => {
  const maxVal = props.max || 100;
  const val = props.value || 0;
  return Math.min(100, Math.max(0, (val / maxVal) * 100));
});
</script>

<template>
  <div class="progress-bar-container" :class="{ indeterminate: props.indeterminate }">
    <div class="progress-bar-fill" :style="{ width: `${percentage}%` }"></div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  width: 100%;
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
  position: relative;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: inherit;
  transition: width 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress-bar-container.indeterminate .progress-bar-fill {
  width: 35% !important;
  animation: progress-indeterminate 1.1s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(330%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-bar-container.indeterminate .progress-bar-fill {
    animation-duration: 2.2s;
  }
}
</style>
