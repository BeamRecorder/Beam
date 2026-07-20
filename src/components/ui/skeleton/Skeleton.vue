<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'linear' | 'radial'
    width?: string
    height?: string
    radius?: string
  }>(),
  {
    variant: 'linear',
    width: '100%',
    height: '20px',
    radius: 'var(--radius-sm)',
  }
)

const skeletonStyle = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.radius,
}))
</script>

<template>
  <div 
    class="skeleton" 
    :class="`shimmer-${variant}`" 
    :style="skeletonStyle"
  ></div>
</template>

<style scoped>
.skeleton {
  display: block;
}

/* Linear Shimmer (Left to Right) */
@keyframes shimmer-linear {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.shimmer-linear {
  background: linear-gradient(
    90deg,
    var(--color-bg-surface) 25%,
    var(--color-bg-surface-hover) 37%,
    var(--color-bg-surface) 63%
  );
  background-size: 200% 100%;
  animation: shimmer-linear 1.5s infinite linear;
}

/* Radial Shimmer (Expanding) */
@keyframes shimmer-radial {
  0% {
    background-size: 100% 100%;
    opacity: 0.6;
  }
  50% {
    background-size: 150% 150%;
    opacity: 1;
  }
  100% {
    background-size: 100% 100%;
    opacity: 0.6;
  }
}

.shimmer-radial {
  background: radial-gradient(
    circle,
    var(--color-bg-surface) 10%,
    var(--color-bg-surface-hover) 60%,
    var(--color-bg-surface) 90%
  );
  background-position: center;
  animation: shimmer-radial 2s infinite ease-in-out;
}
</style>
