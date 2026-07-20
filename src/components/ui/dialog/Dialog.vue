<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    title?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    closeOnOverlayClick?: boolean
  }>(),
  {
    title: '',
    size: 'md',
    closeOnOverlayClick: true,
  }
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const close = () => {
  emit('close')
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.isOpen) {
    close()
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div 
        v-if="isOpen" 
        class="dialog-overlay" 
        @click="closeOnOverlayClick ? close() : null"
      >
        <Transition name="scale-modal" appear>
          <div 
            class="dialog-content" 
            :class="size" 
            @click.stop
            role="dialog"
            aria-modal="true"
          >
            <header class="dialog-header">
              <h3 v-if="title" class="dialog-title">{{ title }}</h3>
              <button type="button" class="dialog-close" @click="close" aria-label="Close dialog">
                <X class="close-icon" />
              </button>
            </header>
            
            <div class="dialog-body">
              <slot />
            </div>
            
            <footer v-if="$slots.footer" class="dialog-footer">
              <slot name="footer" :close="close" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.dialog-content {
  background-color: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  width: 100%;
  overflow: hidden;
  position: relative;
}

/* Sizes */
.dialog-content.sm { max-width: 440px; }
.dialog-content.md { max-width: 560px; }
.dialog-content.lg { max-width: 800px; }
.dialog-content.xl { max-width: 1140px; }

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.dialog-title {
  font-family: var(--font-headline);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-dark-blue);
}

.dialog-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background-color: var(--color-light-blue-hover);
  color: var(--color-orange);
}

.close-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
  font-size: 1rem;
  color: var(--text-secondary);
}

.dialog-footer {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background-color: var(--color-light-blue);
}

/* Overlay Fade Transition */
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.25s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

/* Modal Scale Transition */
.scale-modal-enter-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}
.scale-modal-leave-active {
  transition: transform 0.2s ease-in, opacity 0.15s ease-in;
}

.scale-modal-enter-from,
.scale-modal-leave-to {
  transform: scale(0.95);
  opacity: 0;
}

.scale-modal-enter-to,
.scale-modal-leave-from {
  transform: scale(1);
  opacity: 1;
}
</style>
