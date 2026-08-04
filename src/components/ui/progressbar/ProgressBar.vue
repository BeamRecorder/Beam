<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value?: number; // Value between 0 and 100 or 0 and 1
    max?: number;
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
  <div class="progress-bar-container">
    <div class="progress-bar-fill" :style="{ width: `${percentage}%` }"></div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  position: relative;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary, #3b82f6);
  transition: width 0.1s linear;
}
</style>
