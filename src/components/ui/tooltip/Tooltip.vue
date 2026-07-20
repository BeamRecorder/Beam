<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}>()

const visible = ref(false)
</script>

<template>
  <div 
    class="tooltip-wrapper" 
    @mouseenter="visible = true" 
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
  >
    <slot />
    <Transition name="fade">
      <div 
        v-if="visible && content" 
        class="tooltip-content" 
        :class="position || 'top'"
        role="tooltip"
      >
        {{ content }}
        <div class="tooltip-arrow" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.tooltip-content {
  position: absolute;
  background-color: var(--color-dark-blue);
  color: var(--text-light);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  z-index: 100;
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

/* Arrow placement & styles */
.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

/* Top positioning */
.tooltip-content.top {
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -8px);
}
.tooltip-content.top .tooltip-arrow {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px 5px 0 5px;
  border-color: var(--color-dark-blue) transparent transparent transparent;
}

/* Bottom positioning */
.tooltip-content.bottom {
  top: 100%;
  left: 50%;
  transform: translate(-50%, 8px);
}
.tooltip-content.bottom .tooltip-arrow {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent var(--color-dark-blue) transparent;
}

/* Left positioning */
.tooltip-content.left {
  right: 100%;
  top: 50%;
  transform: translate(-8px, -50%);
}
.tooltip-content.left .tooltip-arrow {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 0 5px 5px;
  border-color: transparent transparent transparent var(--color-dark-blue);
}

/* Right positioning */
.tooltip-content.right {
  left: 100%;
  top: 50%;
  transform: translate(8px, -50%);
}
.tooltip-content.right .tooltip-arrow {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 5px 5px 0;
  border-color: transparent var(--color-dark-blue) transparent transparent;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from.top, .fade-leave-to.top { transform: translate(-50%, -4px); }
.fade-enter-from.bottom, .fade-leave-to.bottom { transform: translate(-50%, 4px); }
.fade-enter-from.left, .fade-leave-to.left { transform: translate(-4px, -50%); }
.fade-enter-from.right, .fade-leave-to.right { transform: translate(4px, -50%); }
</style>
