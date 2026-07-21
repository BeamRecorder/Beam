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
  background-color: var(--color-bg-surface-hover);
  position: relative;
  overflow: hidden;
}

/* Hardware accelerated sliding shimmer */
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.06) 20%,
    rgba(255, 255, 255, 0.12) 60%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: shimmer-slide 1.6s infinite ease-in-out;
}

:root:not(.dark) .skeleton::after {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(0, 0, 0, 0.03) 20%,
    rgba(0, 0, 0, 0.06) 60%,
    rgba(255, 255, 255, 0) 100%
  );
}

@keyframes shimmer-slide {
  100% {
    transform: translateX(100%);
  }
}
</style>
