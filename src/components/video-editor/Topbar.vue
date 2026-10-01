<script setup lang="ts">
import EditorTitlebar from './EditorTitlebar.vue';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectIdentity } from '../projects/project-picker-types';
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
    project?: ProjectIdentity | null;
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
  (e: 'open-project', project: CaptureProject): void;
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
  <EditorTitlebar>
    <template #left>
      <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" class="brand-logo" alt="Beam" />
      <Button
        variant="ghost"
        size="sm"
        :icon="ArrowLeft"
        @click.stop="handleExit"
        class="exit-btn titlebar-btn"
        :aria-label="t('exitToHUD')"
        style="height: 28px; padding: 0 var(--editor-back-padding, 12px); gap: var(--editor-back-gap, 8px)"
      >
        <span class="back-label">{{ t('exitToHUD') }}</span>
      </Button>
      <EditorPresetControls
        :document="presetDocument"
        :dirty="presetDirty"
        @select="emit('presetSelect', $event)"
        @add="emit('presetAdd', $event)"
        @rename="emit('presetRename', $event)"
        @delete="emit('presetDelete')"
        @save="emit('presetSave')"
      />
      <EditorHistoryControls
        :can-undo="canUndo"
        :can-redo="canRedo"
        :tooltip-position="historyTooltipPosition"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
    </template>
    <template #center>
      <VideoProjectEdition :project="project" :is-saving="isSaving" @open-project="emit('open-project', $event)" />
    </template>
    <template #right>
      <ExportPopover
        v-if="exportRequest"
        :request="exportRequest"
        :playhead-seconds="playheadSeconds"
        @update:include-audio="emit('update:exportAudio', $event)"
      />
    </template>
  </EditorTitlebar>
</template>

<style scoped>
.brand-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex: none;
}
.back-label {
  display: var(--editor-back-label-display, inline);
}
</style>
