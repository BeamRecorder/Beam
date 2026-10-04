<script setup lang="ts">
import { computed } from 'vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import type { BackgroundDeleteDialogProps } from './background-deletion-types';
import { gradientCssBackground } from '../../composables/backgroundCatalog';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<BackgroundDeleteDialogProps>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const { t } = useTranslate('BackgroundDeletion');
const swatchStyle = computed(() =>
  props.target?.kind === 'color'
    ? { backgroundColor: props.target.color }
    : props.target?.kind === 'gradient'
      ? { backgroundImage: gradientCssBackground(props.target.gradient) }
      : {},
);
</script>

<template>
  <ConfirmDialog
    :is-open="Boolean(target)"
    :title="t('title')"
    :description="t('description')"
    :confirm-label="t('delete')"
    :cancel-label="t('cancel')"
    destructive
    :busy="busy"
    @close="emit('close')"
    @confirm="emit('confirm')"
  >
    <template #preview>
      <figure v-if="target" class="deletion-preview">
        <img v-if="target.kind === 'image'" :src="preview || target.path" :alt="target.name" />
        <video
          v-else-if="target.kind === 'video'"
          :src="target.path"
          :poster="preview"
          controls
          muted
          preload="metadata"
          :aria-label="target.name"
        />
        <div v-else class="deletion-swatch transparency-grid" role="img" :aria-label="target.name">
          <span :style="swatchStyle" />
        </div>
        <figcaption>{{ target.name }}</figcaption>
      </figure>
    </template>
    <p v-if="error" class="deletion-error" role="alert">{{ error }}</p>
  </ConfirmDialog>
</template>

<style scoped>
.deletion-preview {
  margin: 0 0 12px;
  display: grid;
  gap: 8px;
}
.deletion-preview img,
.deletion-preview video,
.deletion-swatch {
  width: 100%;
  height: 160px;
  object-fit: contain;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-element);
}
.deletion-swatch {
  position: relative;
  overflow: hidden;
}
.deletion-swatch span {
  position: absolute;
  inset: 0;
}
.deletion-preview figcaption {
  color: var(--text-primary);
  overflow-wrap: anywhere;
  font-size: var(--font-size-body);
}
.deletion-error {
  color: var(--color-error);
  font-size: var(--font-size-body);
}
</style>
