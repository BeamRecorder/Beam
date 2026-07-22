<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  content?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  variant?: 'default' | 'error'
}>(), {
  position: 'top',
  variant: 'default',
})

const visible = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const tooltipStyle = ref<Record<string, string>>({})

const updatePosition = () => {
  const wrapper = wrapperRef.value
  if (!wrapper) return
  const rect = wrapper.getBoundingClientRect()
  const offset = 8
  if (props.position === 'bottom') {
    tooltipStyle.value = { top: `${rect.bottom + offset}px`, left: `${rect.left + rect.width / 2}px`, transform: 'translateX(-50%)' }
  } else if (props.position === 'left') {
    tooltipStyle.value = { top: `${rect.top + rect.height / 2}px`, left: `${rect.left - offset}px`, transform: 'translate(-100%, -50%)' }
  } else if (props.position === 'right') {
    tooltipStyle.value = { top: `${rect.top + rect.height / 2}px`, left: `${rect.right + offset}px`, transform: 'translateY(-50%)' }
  } else {
    tooltipStyle.value = { top: `${rect.top - offset}px`, left: `${rect.left + rect.width / 2}px`, transform: 'translate(-50%, -100%)' }
  }
}

const show = async () => {
  visible.value = true
  await nextTick()
  updatePosition()
}

const hide = () => { visible.value = false }

window.addEventListener('resize', updatePosition)
window.addEventListener('scroll', updatePosition, true)
onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div 
    ref="wrapperRef"
    class="tooltip-wrapper" 
    @mouseenter="show" 
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </div>
  <Teleport to="body">
    <Transition name="fade">
      <div 
        v-if="visible && (content || $slots.content)" 
        class="tooltip-content" 
        :class="[position || 'top', `tooltip-${variant}`]"
        :style="tooltipStyle"
        role="tooltip"
      >
        <slot name="content">{{ content }}</slot>
        <div class="tooltip-arrow" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.tooltip-content {
  position: fixed;
  background-color: var(--color-bg-element);
  color: var(--text-primary);
  border: 1px solid var(--color-border);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  z-index: 3000;
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

.tooltip-content.tooltip-error { background-color: var(--color-error); border-color: var(--color-error); color: #ffffff; }
.tooltip-content.tooltip-error.top .tooltip-arrow { border-color: var(--color-error) transparent transparent transparent; }
.tooltip-content.tooltip-error.bottom .tooltip-arrow { border-color: transparent transparent var(--color-error) transparent; }
.tooltip-content.tooltip-error.left .tooltip-arrow { border-color: transparent transparent transparent var(--color-error); }
.tooltip-content.tooltip-error.right .tooltip-arrow { border-color: transparent var(--color-error) transparent transparent; }

/* Arrow placement & styles */
.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

/* Top positioning */
.tooltip-content.top .tooltip-arrow {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px 5px 0 5px;
  border-color: var(--color-bg-element) transparent transparent transparent;
}

/* Bottom positioning */
.tooltip-content.bottom .tooltip-arrow {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent var(--color-bg-element) transparent;
}

/* Left positioning */
.tooltip-content.left .tooltip-arrow {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 0 5px 5px;
  border-color: transparent transparent transparent var(--color-bg-element);
}

/* Right positioning */
.tooltip-content.right .tooltip-arrow {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 5px 5px 0;
  border-color: transparent var(--color-bg-element) transparent transparent;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

</style>
