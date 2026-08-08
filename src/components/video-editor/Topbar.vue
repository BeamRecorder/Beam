<script setup lang="ts">
import { capture } from '../../api/capture';
import VideoProjectEdition from './VideoProjectEdition.vue';
import ExportPopover from '../export/ExportPopover.vue';
import Button from '~/ui/button/Button.vue';
import { ArrowLeft, Redo2, Undo2 } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const { t } = useTranslate('Topbar');

withDefaults(
  defineProps<{
    exportRequest?: any;
    project?: any;
    isSaving?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    historyTooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  {
    exportRequest: null,
    project: null,
    isSaving: false,
    canUndo: false,
    canRedo: false,
    historyTooltipPosition: 'bottom',
  },
);

const emit = defineEmits<{
  (e: 'back-to-hud'): void;
  (e: 'open-project', project: any): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
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
      <div class="discord-action">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :tooltip="t('discordTooltip')"
          tooltip-position="bottom"
          :aria-label="t('discordAriaLabel')"
          @click.stop="openDiscordInvite"
        >
          <template #icon>
            <img :src="resolvePublicAssetUrl('/discord_svg.svg')" class="discord-icon" alt="" aria-hidden="true" />
          </template>
        </Button>
      </div>
      <ExportPopover v-if="exportRequest" :request="exportRequest" />
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

.discord-action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.discord-action :deep(.btn-container) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.discord-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  transform: translateY(1px);
}
</style>
