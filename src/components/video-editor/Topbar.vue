<script setup lang="ts">
import EditorHistoryControls from './EditorHistoryControls.vue';
import VideoProjectEdition from './VideoProjectEdition.vue';
import ExportPopover from '../export/ExportPopover.vue';
import Button from '~/ui/button/Button.vue';
import { ArrowLeft } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { PreviewPerformanceSnapshot } from './performance/preview-performance-types';
import type { EditorExportSource } from '../export/export-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import EditorPresetControls from './EditorPresetControls.vue';

const { t } = useTranslate('Topbar');

withDefaults(
  defineProps<{
    exportRequest?: EditorExportSource | null;
    playheadSeconds?: number;
    project?: any;
    isSaving?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    historyTooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
    performanceSnapshot?: PreviewPerformanceSnapshot | null;
    presetDocument?: EditorPresetDocument | null;
    presetDirty?: boolean;
  }>(),
  {
    exportRequest: null,
    playheadSeconds: 0,
    project: null,
    isSaving: false,
    canUndo: false,
    canRedo: false,
    historyTooltipPosition: 'bottom',
    performanceSnapshot: null,
    presetDocument: null,
    presetDirty: false,
  },
);

const emit = defineEmits<{
  (e: 'back-to-hud'): void;
  (e: 'open-project', project: any): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'update:exportAudio', value: boolean): void;
  (e: 'presetSelect', id: string | number): void;
  (e: 'presetAdd', name: string): void;
  (e: 'presetRename', name: string): void;
  (e: 'presetDelete'): void;
  (e: 'presetSave'): void;
}>();

const handleExit = () => {
  emit('back-to-hud');
};
</script>

<template>
  <header class="editor-titlebar">
    <div class="left-actions">
      <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" class="brand-logo" alt="Beam" />
      <Button variant="ghost" size="sm" :icon="ArrowLeft" @click.stop="handleExit" class="exit-btn titlebar-btn">
        {{ t('exitToHUD') }}
      </Button>
      <VideoProjectEdition :project="project" :is-saving="isSaving" @open-project="emit('open-project', $event)" />
      <EditorHistoryControls
        :can-undo="canUndo"
        :can-redo="canRedo"
        :tooltip-position="historyTooltipPosition"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
    </div>

    <div class="titlebar-drag-region" aria-hidden="true" />

    <div class="right-actions">
      <EditorPresetControls
        :document="presetDocument"
        :dirty="presetDirty"
        @select="emit('presetSelect', $event)"
        @add="emit('presetAdd', $event)"
        @rename="emit('presetRename', $event)"
        @delete="emit('presetDelete')"
        @save="emit('presetSave')"
      />
      <ExportPopover
        v-if="exportRequest"
        :request="exportRequest"
        :playhead-seconds="playheadSeconds"
        @update:include-audio="emit('update:exportAudio', $event)"
      />
    </div>
  </header>
</template>

<style scoped>
.editor-titlebar {
  height: 40px;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  padding-left: env(titlebar-area-x, 0px);
  padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  flex-shrink: 0;
  -webkit-app-region: drag;
  app-region: drag;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.left-actions,
.right-actions {
  zoom: var(--ui-scale-topbar, 1);
}

.left-actions {
  gap: 8px;
}

.titlebar-drag-region {
  min-width: 32px;
  height: 100%;
  flex: 1 1 auto;
  -webkit-app-region: drag;
  app-region: drag;
}

.brand-logo {
  width: 24px;
  height: 24px;
  margin-left: 10px;
  object-fit: contain;
  flex: 0 0 auto;
}

.exit-btn {
  margin-right: 4px;
}
</style>
