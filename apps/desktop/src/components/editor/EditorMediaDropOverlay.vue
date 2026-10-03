<script setup lang="ts">
import { LoaderCircle, UploadCloud } from '@lucide/vue';

defineProps<{
  visible: boolean;
  importing: boolean;
  title: string;
  description: string;
  importingLabel: string;
}>();
</script>

<template>
  <Transition name="media-drop">
    <div v-if="visible" class="media-drop-overlay" role="status" aria-live="polite">
      <div class="media-drop-card">
        <LoaderCircle v-if="importing" class="media-drop-icon is-loading" :size="34" />
        <UploadCloud v-else class="media-drop-icon" :size="34" />
        <strong>{{ importing ? importingLabel : title }}</strong>
        <span v-if="!importing">{{ description }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.media-drop-overlay {
  position: absolute;
  inset: 8px;
  z-index: 1900;
  display: grid;
  place-items: center;
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-surface) 84%, transparent);
  backdrop-filter: blur(10px);
  pointer-events: none;
}

.media-drop-card {
  display: flex;
  max-width: 420px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 28px;
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-xl);
  color: var(--text-primary);
  text-align: center;
}

.media-drop-card span {
  color: var(--text-secondary);
  font-size: 13px;
}

.media-drop-icon {
  color: var(--color-primary);
}

.is-loading {
  animation: media-drop-spin 0.8s linear infinite;
}

.media-drop-enter-active,
.media-drop-leave-active {
  transition: opacity var(--fast) ease;
}

.media-drop-enter-from,
.media-drop-leave-to {
  opacity: 0;
}

@keyframes media-drop-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
