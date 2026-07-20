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
    #f1f5f9 25%,
    #e2e8f0 37%,
    #f1f5f9 63%
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
    #f1f5f9 10%,
    #e2e8f0 60%,
    #f1f5f9 90%
  );
  background-position: center;
  animation: shimmer-radial 2s infinite ease-in-out;
}
</style>
