<script setup lang="ts">
import { ArrowLeft, Monitor, PanelsTopLeft } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { CapturePreview } from '~/api/types/capture-api';
import type { PreviewKind } from './hud-state-types';

defineProps<{ kind: PreviewKind; previews: CapturePreview[]; loading: boolean; disabled: boolean }>();
const emit = defineEmits<{ select: [id: string]; back: [] }>();
const { t } = useTranslate('HUD');
</script>

<template>
  <section class="source-picker" :aria-label="t(kind === 'screen' ? 'screen' : 'window')">
    <header class="source-heading">
      <Button variant="ghost" size="xs" icon-only :icon="ArrowLeft" :aria-label="t('back')" @click="emit('back')" />
      <span>{{ t('chooseCaptureSource') }}</span>
    </header>
    <div v-if="loading" class="source-loading" role="status" :aria-label="t('pleaseWait')">
      <Skeleton v-for="index in 2" :key="index" height="70px" />
    </div>
    <p v-else-if="previews.length === 0" class="source-empty" role="status">
      {{ t(kind === 'screen' ? 'noScreensDetected' : 'noWindowsDetected') }}
    </p>
    <div v-else class="source-grid">
      <Button
        v-for="preview in previews"
        :key="preview.id"
        variant="card"
        block
        class="source-card"
        :disabled="disabled"
        :aria-label="preview.name"
        :title="preview.name"
        @click="emit('select', preview.id)"
      >
        <img v-if="preview.thumbnail" :src="preview.thumbnail" alt="" draggable="false" class="source-thumbnail" />
        <span v-else class="source-unavailable"
          ><component :is="kind === 'screen' ? Monitor : PanelsTopLeft" :size="20"
        /></span>
        <span class="source-name">{{ preview.name }}</span>
      </Button>
    </div>
  </section>
</template>

<style scoped>
.source-picker {
  display: flex;
  flex-direction: column;
  height: 110px;
  min-height: 0;
  gap: 6px;
}
.source-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
.source-grid,
.source-loading {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  padding: 2px;
}
.source-picker :deep(.source-card) {
  height: 72px;
}
.source-thumbnail,
.source-unavailable {
  width: 100%;
  height: 48px;
  object-fit: contain;
  background: var(--color-bg-well);
}
.source-unavailable {
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);
}
.source-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 6px;
  font-size: var(--font-size-sm);
  font-weight: var(--weight-body);
}
.source-empty {
  padding: 12px;
  color: var(--text-muted);
  font-size: var(--font-size-body);
}
</style>
