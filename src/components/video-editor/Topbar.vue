<script setup lang="ts">
import { capture } from '../../api/capture';
import VideoProjectEdition from './VideoProjectEdition.vue';
import ExportPopover from '../export/ExportPopover.vue';
import Button from '~/ui/button/Button.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import { ArrowLeft, Redo2, Undo2 } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import PreviewPerformanceWidget from './performance/PreviewPerformanceWidget.vue';
import type { PreviewPerformanceSnapshot } from './performance/preview-performance-types';
import type { ExportRequest } from '../export/export-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import EditorPresetControls from './EditorPresetControls.vue';

const { t } = useTranslate('Topbar');

withDefaults(
  defineProps<{
    exportRequest?: Omit<ExportRequest, 'format' | 'preset'> | null;
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

const openDiscordInvite = () => {
  void capture.openDiscordInvite();
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
      <EditorPresetControls
        :document="presetDocument"
        :dirty="presetDirty"
        @select="emit('presetSelect', $event)"
        @add="emit('presetAdd', $event)"
        @rename="emit('presetRename', $event)"
        @delete="emit('presetDelete')"
        @save="emit('presetSave')"
      />
      <div class="history-actions">
        <Button
          variant="ghost"
          size="xs"
          :icon="Undo2"
          :disabled="!canUndo"
          :tooltip="t('undoTooltip')"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('undo')"
        />
        <Button
          variant="ghost"
          size="xs"
          :icon="Redo2"
          :disabled="!canRedo"
          :tooltip="t('redoTooltip')"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('redo')"
        />
      </div>
    </div>

    <div class="titlebar-drag-region" aria-hidden="true" />

    <div class="right-actions">
      <PreviewPerformanceWidget v-if="performanceSnapshot" :snapshot="performanceSnapshot" />
      <Tooltip :content="t('discordTooltip')" position="bottom">
        <button type="button" class="discord-btn" :aria-label="t('discordAriaLabel')" @click.stop="openDiscordInvite">
          <img :src="resolvePublicAssetUrl('/discord_svg.svg')" class="discord-icon" alt="" aria-hidden="true" />
        </button>
      </Tooltip>
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
  background: var(--color-bg-element);
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

.history-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.exit-btn {
  margin-right: 4px;
}

.discord-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.discord-btn:hover {
  background-color: var(--color-bg-surface-hover, #2a2a32);
  border-color: var(--color-border-dark, #3f3f46);
  transform: translateY(-1px);
}

.discord-btn:active {
  transform: translateY(0);
}

.discord-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
}
</style>
