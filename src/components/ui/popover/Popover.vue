<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    align?: 'left' | 'right' | 'center'
    direction?: 'up' | 'down'
    block?: boolean
  }>(),
  {
    align: 'left',
    direction: 'down',
    block: false,
  }
)

const emit = defineEmits<{
  (e: 'toggle', isOpen: boolean): void
}>()

const isOpen = ref(false)
const popoverRef = ref<HTMLElement | null>(null)

const toggle = () => {
  isOpen.value = !isOpen.value
}

const close = () => {
  isOpen.value = false
}

watch(isOpen, (val) => {
  emit('toggle', val)
})

const handleClickOutside = (event: MouseEvent) => {
  if (popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

defineExpose({
  isOpen,
  toggle,
  close,
})
</script>

<template>
  <div :class="['popover-container', { 'popover-block': block }]" ref="popoverRef">
    <div :class="['popover-trigger', { 'popover-block': block }]" @click="toggle">
      <slot name="trigger" :isOpen="isOpen" />
    </div>

    <Transition name="pop">
      <div v-if="isOpen" class="popover-content" :class="[align, direction, { 'popover-block': block }]">
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.popover-container {
  position: relative;
  display: inline-block;
}

.popover-container.popover-block {
  display: block;
  width: 100%;
}

.popover-trigger {
  display: inline-block;
  cursor: pointer;
}

.popover-trigger.popover-block {
  display: block;
  width: 100%;
}

.popover-content {
  position: absolute;
  background-color: var(--color-bg-element);
  color: var(--text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  z-index: 50;
  min-width: 220px;
}

.popover-content.down {
  top: 100%;
  margin-top: 8px;
}

.popover-content.up {
  bottom: 100%;
  margin-bottom: 8px;
}

.popover-content.popover-block {
  width: 100%;
  min-width: unset;
}

.popover-content.left {
  left: 0;
}

.popover-content.right {
  right: 0;
}

.popover-content.center {
  left: 50%;
  transform: translateX(-50%);
}

/* Animations */
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.pop-enter-to,
.pop-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.pop-enter-active.center,
.pop-leave-active.center {
  transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-enter-from.center,
.pop-leave-to.center {
  opacity: 0;
  transform: translate(-50%, -4px);
}

.pop-enter-to.center,
.pop-leave-from.center {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
