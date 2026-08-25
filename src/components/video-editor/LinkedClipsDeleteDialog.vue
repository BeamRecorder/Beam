<script setup lang="ts">
import { computed, onBeforeUnmount, watch, type Component } from 'vue';
import { Captions, Camera, Check, Film, Image, Layers, Monitor, Palette, Shapes, Trash2, Volume2 } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import Dialog from '~/components/ui/dialog/Dialog.vue';
import type { Clip, ClipKind } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{
  isOpen: boolean;
  clips: Clip[];
}>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'delete', clipIds: string[]): void;
}>();
const { t } = useTranslate('LinkedClipsDeleteDialog');
const { t: tCanvas } = useTranslate('CanvasPanel');

const kindIcons: Record<ClipKind, Component> = {
  screen: Monitor,
  video: Film,
  image: Image,
  webcam: Camera,
  color: Palette,
  shape: Shapes,
  blur: Layers,
  audio: Volume2,
  caption: Captions,
};
const kindLabel = (kind: ClipKind) =>
  kind === 'color' ? tCanvas('color') : kind === 'shape' ? tCanvas('shapesAndArrows') : t(`kind.${kind}`);
const allClipIds = computed(() => props.clips.map((clip) => clip.id));
const COMPLETION_CLOSE_DELAY_MS = 900;
let hadClips = false;
let closeTimer = 0;

watch(
  [() => props.isOpen, () => props.clips.length],
  ([isOpen, clipCount]) => {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    if (!isOpen) {
      hadClips = false;
      return;
    }
    if (clipCount > 0) {
      hadClips = true;
      return;
    }
    if (hadClips) closeTimer = window.setTimeout(() => emit('close'), COMPLETION_CLOSE_DELAY_MS);
  },
  { immediate: true },
);

onBeforeUnmount(() => window.clearTimeout(closeTimer));
</script>

<template>
  <Dialog :is-open="isOpen" :title="t('title')" size="sm" @close="emit('close')">
    <div class="linked-delete-content">
      <p class="linked-delete-description">{{ t('description') }}</p>

      <Button
        v-if="clips.length"
        class="delete-all-button"
        variant="danger"
        size="sm"
        :icon="Trash2"
        block
        @click="emit('delete', allClipIds)"
      >
        {{ t('deleteAll', { count: clips.length }) }}
      </Button>

      <div v-if="clips.length" class="linked-clip-list">
        <div v-for="clip in clips" :key="clip.id" class="linked-clip-row">
          <span class="clip-kind-icon" aria-hidden="true">
            <component :is="kindIcons[clip.kind]" class="clip-type-svg" />
          </span>
          <span class="clip-details">
            <span class="clip-name">{{ clip.name }}</span>
            <span class="clip-kind">{{ kindLabel(clip.kind) }}</span>
          </span>
          <Button
            class="delete-one-button"
            variant="ghost"
            size="xs"
            :icon="Trash2"
            :tooltip="t('deleteOne', { name: clip.name })"
            tooltip-variant="error"
            @click="emit('delete', [clip.id])"
          >
            {{ t('delete') }}
          </Button>
        </div>
      </div>

      <div v-else class="linked-delete-empty" role="status">
        <span class="completion-check" aria-hidden="true"><Check :size="17" /></span>
        <span>{{ t('allDeleted') }}</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.linked-delete-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.linked-delete-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.linked-clip-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.linked-clip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 7px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}

.clip-kind-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.clip-type-svg {
  width: 15px;
  height: 15px;
}

.clip-details {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clip-name {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip-kind {
  color: var(--text-muted);
  font-size: 10px;
}

.linked-delete-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 72px;
  color: var(--text-muted);
  font-size: 12px;
  animation: completion-copy-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.completion-check {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 50%;
  color: #fff;
  background: var(--color-success, #10b981);
  animation: completion-check-in 420ms cubic-bezier(0.16, 1.4, 0.3, 1) both;
}

@keyframes completion-check-in {
  from {
    opacity: 0;
    transform: scale(0.55) rotate(-12deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes completion-copy-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
