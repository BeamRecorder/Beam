<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, Trash2 } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import Dialog from '~/components/ui/dialog/Dialog.vue';
import type { Clip, ClipKind, MediaAsset } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import LinkedClipPreviewPlayer from './LinkedClipPreviewPlayer.vue';
import LinkedClipThumbnail from './LinkedClipThumbnail.vue';
import { useLinkedClipPosters } from './linked-clip-posters';

const props = defineProps<{
  isOpen: boolean;
  clips: Clip[];
  assets?: MediaAsset[];
}>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'delete', clipIds: string[]): void;
}>();
const { t } = useTranslate('LinkedClipsDeleteDialog');
const { t: tCanvas } = useTranslate('CanvasPanel');

const kindLabel = (kind: ClipKind) =>
  kind === 'color' ? tCanvas('color') : kind === 'shape' ? tCanvas('shapesAndArrows') : t(`kind.${kind}`);
const allClipIds = computed(() => props.clips.map((clip) => clip.id));
const assetById = computed(() => new Map((props.assets ?? []).map((asset) => [asset.id, asset])));
const clipAsset = (clip: Clip) => ('assetId' in clip ? assetById.value.get(clip.assetId) : undefined);
const { posterUrl, requestPoster } = useLinkedClipPosters(computed(() => props.isOpen));
const selectedClipId = ref<string | null>(null);
const selectedClip = computed(
  () => props.clips.find((clip) => clip.id === selectedClipId.value) ?? props.clips[0] ?? null,
);
const formatTime = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const COMPLETION_CLOSE_DELAY_MS = 900;
let hadClips = false;
let closeTimer = 0;

watch(
  [() => props.isOpen, () => props.clips.length],
  ([isOpen, clipCount]) => {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    if (!isOpen) {
      selectedClipId.value = null;
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
  <Dialog :is-open="isOpen" :title="t('title')" size="md" @close="emit('close')">
    <div class="linked-delete-content">
      <p class="linked-delete-description">{{ t('description') }}</p>

      <div class="preview-slot">
        <Transition name="preview-swap" appear>
          <LinkedClipPreviewPlayer
            v-if="selectedClip"
            :key="selectedClip.id"
            :clip="selectedClip"
            :asset="clipAsset(selectedClip)"
          />
        </Transition>
      </div>

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
        <div
          v-for="(clip, index) in clips"
          :key="clip.id"
          class="linked-clip-row"
          :class="{ selected: selectedClip?.id === clip.id }"
        >
          <button
            type="button"
            class="select-preview-button"
            :aria-pressed="selectedClip?.id === clip.id"
            :aria-label="t('selectPreview', { name: clip.name })"
            @click="selectedClipId = clip.id"
          >
            <LinkedClipThumbnail
              :clip="clip"
              :asset="clipAsset(clip)"
              :poster-url="posterUrl(clip, clipAsset(clip))"
              :request-poster="requestPoster"
            />
            <span class="clip-details">
              <span class="clip-heading"
                ><span class="clip-ordinal">{{ index + 1 }}.</span><span class="clip-name">{{ clip.name }}</span></span
              >
              <span class="clip-kind">{{ kindLabel(clip.kind) }}</span>
              <span
                v-if="clipAsset(clip)"
                class="clip-source"
                :title="clipAsset(clip)?.sessionPath ?? clipAsset(clip)?.fileName ?? clip.name"
              >
                {{ clipAsset(clip)?.sessionPath ?? clipAsset(clip)?.fileName }} · {{ formatTime(clip.sourceInMs) }}–{{
                  formatTime(clip.sourceInMs + clip.sourceDurationMs)
                }}
              </span>
            </span>
          </button>
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

.preview-slot {
  display: grid;
  min-height: 0;
}
.preview-slot > * {
  grid-area: 1 / 1;
}
.preview-swap-enter-active,
.preview-swap-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.preview-swap-enter-from {
  opacity: 0;
  transform: translateY(7px);
}
.preview-swap-leave-to {
  opacity: 0;
  transform: translateY(-7px);
}
@media (prefers-reduced-motion: reduce) {
  .preview-swap-enter-active,
  .preview-swap-leave-active {
    transition: none;
  }
}

.linked-clip-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  max-height: clamp(160px, 30vh, 280px);
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 2px;
}

.linked-clip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}
.linked-clip-row.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.select-preview-button {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.select-preview-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}

.clip-source {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip-details {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clip-heading {
  display: flex;
  min-width: 0;
  gap: 4px;
}

.clip-ordinal {
  color: var(--text-muted);
  font-size: 12px;
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
