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
const contentRef = ref<HTMLElement | null>(null)
const directionClass = ref(props.direction)
const floatingStyle = ref<Record<string, string>>({})

const toggle = () => {
  isOpen.value = !isOpen.value
}

const close = () => {
  isOpen.value = false
}

const adjustPosition = () => {
  if (!popoverRef.value) return
  const triggerEl = popoverRef.value.querySelector('.popover-trigger') || popoverRef.value
  const rect = triggerEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  
  if (props.direction === 'down' && spaceBelow < 150 && spaceAbove > spaceBelow) {
    directionClass.value = 'up'
  } else if (props.direction === 'up' && spaceAbove < 150 && spaceBelow > spaceAbove) {
    directionClass.value = 'down'
  } else {
    directionClass.value = props.direction
  }
  
  let top = 0
  let left = 0
  
  if (directionClass.value === 'down') {
    top = rect.bottom + window.scrollY + 8
  } else {
    top = rect.top + window.scrollY - 8
  }
  
  if (props.align === 'left') {
    left = rect.left + window.scrollX
  } else if (props.align === 'right') {
    left = rect.right + window.scrollX
  } else {
    left = rect.left + window.scrollX + rect.width / 2
  }
  
  const transforms: string[] = []
  if (props.align === 'right') {
    transforms.push('translateX(-100%)')
  } else if (props.align === 'center') {
    transforms.push('translateX(-50%)')
  }
  
  if (directionClass.value === 'up') {
    transforms.push('translateY(-100%)')
  }
  
  floatingStyle.value = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: '1000',
    ...(transforms.length > 0 ? { transform: transforms.join(' ') } : {})
  }
}

watch(isOpen, (val) => {
  if (val) {
    setTimeout(adjustPosition, 0)
  }
  emit('toggle', val)
})

watch(() => props.direction, (val) => {
  directionClass.value = val
})

const handleClickOutside = (event: MouseEvent) => {
  const isClickInsideTrigger = popoverRef.value && popoverRef.value.contains(event.target as Node)
  const isClickInsideContent = contentRef.value && contentRef.value.contains(event.target as Node)
  if (!isClickInsideTrigger && !isClickInsideContent) {
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

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="isOpen" ref="contentRef" class="popover-content" :class="[align, directionClass, { 'popover-block': block }]" :style="floatingStyle">
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
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
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  z-index: 50;
  min-width: max-content;
}

.popover-content.popover-block {
  width: 100%;
  min-width: unset;
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
