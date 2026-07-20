<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    align?: 'left' | 'right' | 'center'
  }>(),
  {
    align: 'left',
  }
)

const isOpen = ref(false)
const popoverRef = ref<HTMLElement | null>(null)

const toggle = () => {
  isOpen.value = !isOpen.value
}

const close = () => {
  isOpen.value = false
}

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
  <div class="popover-container" ref="popoverRef">
    <div class="popover-trigger" @click="toggle">
      <slot name="trigger" :isOpen="isOpen" />
    </div>

    <Transition name="pop">
      <div v-if="isOpen" class="popover-content" :class="align">
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

.popover-trigger {
  display: inline-block;
  cursor: pointer;
}

.popover-content {
  position: absolute;
  top: 100%;
  margin-top: 8px;
  background-color: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 12px;
  z-index: 50;
  min-width: 220px;
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
