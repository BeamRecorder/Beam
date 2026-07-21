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
  background-color: var(--color-bg-element);
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

/* Hardware accelerated sliding shimmer */
.skeleton::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.12) 35%,
    rgba(255, 255, 255, 0.28) 50%,
    rgba(255, 255, 255, 0.12) 65%,
    transparent 100%
  );
  animation: shimmer-slide 1.4s infinite cubic-bezier(0.4, 0, 0.2, 1);
}

:root:not(.dark) .skeleton::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 0, 0, 0.04) 35%,
    rgba(0, 0, 0, 0.1) 50%,
    rgba(0, 0, 0, 0.04) 65%,
    transparent 100%
  );
}

@keyframes shimmer-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
