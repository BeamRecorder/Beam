<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, FolderOpen, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import Popover from '~/ui/popover/Popover.vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useExportJob } from './useExportJob';
import { bitrateFor } from './export-presets';
import type { ExportFormat, ExportPreset, ExportRequest } from './export-types';
import { useTranslate } from '~/i18n/useTranslate';
import { safeExportErrorMessage, technicalExportError } from './mediabunny/export-preflight';

const { t } = useTranslate('ExportPopover');
const { t: tExporter } = useTranslate('exporter');

export type ExportResolutionOption = '720p' | '1080p' | 'max';

const props = defineProps<{ request: Omit<ExportRequest, 'format' | 'preset'> }>();
const format = ref<ExportFormat>('webm');
const preset = ref<ExportPreset>('medium');
const resolution = ref<ExportResolutionOption>('max');
const presets: ExportPreset[] = ['low', 'medium', 'high'];

const formatDescriptions: Record<ExportFormat, string> = {
  webm: t('webmDesc'),
  mp4: t('mp4Desc'),
};

const nativeWidth = computed(() => props.request.snapshot.canvas.width);
const nativeHeight = computed(() => props.request.snapshot.canvas.height);

const computeExportDimensions = (res: ExportResolutionOption) => {
  const nativeW = nativeWidth.value;
  const nativeH = nativeHeight.value;
  const aspectRatio = nativeW / nativeH;

  let targetH = nativeH;
  if (res === '720p') {
    targetH = Math.min(720, nativeH);
  } else if (res === '1080p') {
    targetH = Math.min(1080, nativeH);
  }

  let targetW = Math.round(targetH * aspectRatio);
  targetW = Math.max(2, targetW & ~1);
  targetH = Math.max(2, targetH & ~1);

  return { width: targetW, height: targetH };
};

const activeDimensions = computed(() => computeExportDimensions(resolution.value));

const resolutionDescriptions = computed<Record<ExportResolutionOption, string>>(() => {
  const dims720 = computeExportDimensions('720p');
  const dims1080 = computeExportDimensions('1080p');
  const dimsMax = computeExportDimensions('max');
  return {
    '720p': t('res720pDesc', { width: dims720.width, height: dims720.height }),
    '1080p': t('res1080pDesc', { width: dims1080.width, height: dims1080.height }),
    max: t('resMaxDesc', { width: dimsMax.width, height: dimsMax.height }),
  };
});

const getMb = (p: ExportPreset) => {
  const { width, height } = activeDimensions.value;
  const { fps } = props.request.snapshot.render;
  const bps = bitrateFor(p, width, height, fps);
  return (bps / 1_000_000).toFixed(1);
};

const presetDescriptions = computed<Record<ExportPreset, string>>(() => ({
  low: t('lowDesc', { mbps: getMb('low') }),
  medium: t('mediumDesc', { mbps: getMb('medium') }),
  high: t('highDesc', { mbps: getMb('high') }),
}));

const availability = ref<string | null>(null);
const { progress, error, errorContext, result, isExporting, start, cancel } = useExportJob();
const toastStore = useToastStore();
const percentage = computed(() => (progress.value?.overallProgress ?? 0) * 100);
const stageTitle = computed(() => {
  if (progress.value?.stageLabel) return progress.value.stageLabel;
  if (progress.value?.stage === 'loading_assets') return tExporter('loadingMediaAssets');
  if (progress.value?.stage === 'encoding')
    return tExporter('encodingFrame', {
      frame: progress.value.completedImages,
      total: progress.value.totalImages,
    });
  if (progress.value?.stage === 'finalizing') return tExporter('finalizingMediaFile');
  return tExporter('preparingExport');
});
const displayError = computed(() => availability.value || (error.value ? safeExportErrorMessage(error.value) : null));

const progressCopyText = computed(() => {
  const value = progress.value;
  if (!value) return '';
  const details = [stageTitle.value, `${Math.round(percentage.value)}%`];
  if (value.stage === 'encoding') {
    details.push(t('frameCount', { completed: value.completedImages, total: value.totalImages }));
    if (value.audioProgress !== null) details.push(`Audio ${Math.round(value.audioProgress * 100)}%`);
  }
  details.push(`${formatMs(value.currentTimeMs)} / ${formatMs(value.totalTimeMs)}`);
  return details.join('\n');
});

const openFile = (path: string) => {
  if (path && window.capture?.openFile) {
    void window.capture.openFile(path);
  }
};

const run = async () => {
  availability.value = null;
  const { width, height } = activeDimensions.value;
  const request: ExportRequest = {
    ...props.request,
    format: format.value,
    preset: preset.value,
    snapshot: {
      ...props.request.snapshot,
      canvas: {
        ...props.request.snapshot.canvas,
        width,
        height,
      },
    },
  };
  await start(request);
  if (error.value) {
    const technical = technicalExportError(errorContext?.value ?? error.value);
    toastStore.error(safeExportErrorMessage(error.value), 0, {
      label: t('copyError'),
      copiedLabel: t('copied'),
      errorLabel: t('copyFailed'),
      detail: technical,
      dismissOnSuccess: false,
      copyText: technical,
    });
    return;
  }
  if (result.value?.path) {
    const exportedPath = result.value.path;
    const filename = exportedPath.split(/[/\\]/).pop() || t('video');
    toastStore.success(t('savedTo', { path: filename }), 6000, {
      label: t('openFile'),
      onClick: () => openFile(exportedPath),
    });
  }
};

const formatMs = (ms: number) => {
  const totalSeconds = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}s`;
};
</script>

<template>
  <Popover align="right" :match-trigger-width="false">
    <template #trigger>
      <Button variant="primary" size="xs" :icon="Download" class="export-trigger">
        {{ isExporting ? `${Math.round(percentage)}%` : t('exportVideo') }}
      </Button>
    </template>
    <template #default>
      <section class="export-popover" :aria-label="t('exportVideoAria')" @click.stop>
        <div v-if="isExporting" class="export-progress-card">
          <div class="progress-header">
            <span class="progress-title">{{ t('exporting') }}</span>
            <div class="progress-tools">
              <CopyButton
                :text="progressCopyText"
                display="icon"
                variant="ghost"
                size="xs"
                :label="t('copyProgress')"
                :copied-label="t('copied')"
                :error-label="t('copyFailed')"
                class="copy-progress-button"
              />
              <span class="percentage-badge" aria-live="polite">{{ Math.round(percentage) }}%</span>
            </div>
          </div>

          <ProgressBar :value="percentage" class="main-progress-bar" />

          <div class="actions">
            <Button variant="ghost" size="sm" block :icon="X" @click="cancel">{{ t('cancelExport') }}</Button>
          </div>
        </div>

        <template v-else>
          <div class="field">
            <span class="field-label">{{ t('format') }}</span>
            <ButtonGroup full>
              <Button variant="tab" size="sm" block :class="{ active: format === 'webm' }" @click="format = 'webm'">
                {{ t('webm') }}
              </Button>
              <Button variant="tab" size="sm" block :class="{ active: format === 'mp4' }" @click="format = 'mp4'">
                {{ t('mp4') }}
              </Button>
            </ButtonGroup>
            <span class="option-hint">{{ formatDescriptions[format] }}</span>
          </div>

          <div class="field">
            <span class="field-label">{{ t('resolution') }}</span>
            <ButtonGroup full>
              <Button
                variant="tab"
                size="sm"
                block
                :disabled="nativeHeight < 720"
                :class="{ active: resolution === '720p' }"
                @click="resolution = '720p'"
              >
                {{ t('res720p') }}
              </Button>
              <Button
                variant="tab"
                size="sm"
                block
                :disabled="nativeHeight < 1080"
                :class="{ active: resolution === '1080p' }"
                @click="resolution = '1080p'"
              >
                {{ t('res1080p') }}
              </Button>
              <Button
                variant="tab"
                size="sm"
                block
                :class="{ active: resolution === 'max' }"
                @click="resolution = 'max'"
              >
                {{ t('resMax') }}
              </Button>
            </ButtonGroup>
            <span class="option-hint">{{ resolutionDescriptions[resolution] }}</span>
          </div>

          <div class="field">
            <span class="field-label">{{ t('qualityAndBitrate') }}</span>
            <ButtonGroup full>
              <Button
                v-for="value in presets"
                :key="value"
                variant="tab"
                size="sm"
                block
                :class="{ active: preset === value }"
                @click="preset = value"
              >
                {{ value }}
              </Button>
            </ButtonGroup>
            <span class="option-hint">{{ presetDescriptions[preset] }}</span>
          </div>

          <p v-if="displayError" class="error" role="alert">{{ displayError }}</p>
          <div v-if="result" class="result-box">
            <p class="success" role="status">{{ t('savedTo', { path: result.path }) }}</p>
            <Button variant="secondary" size="sm" block :icon="FolderOpen" @click="openFile(result.path)">{{
              t('openFile')
            }}</Button>
          </div>
          <div class="actions">
            <Button variant="primary" size="sm" block :icon="Download" @click="run">{{ t('exportVideo') }}</Button>
          </div>
        </template>
      </section>
    </template>
  </Popover>
</template>

<style scoped>
.export-popover {
  width: 320px;
  padding: 16px;
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
  width: 100%;
}
.field :deep(.btn-group) {
  width: 100% !important;
  box-sizing: border-box;
}
.field :deep(.btn-group .btn-container) {
  flex: 1 !important;
  display: flex !important;
  min-width: 0 !important;
}
.field :deep(.btn-group .btn) {
  width: 100% !important;
  justify-content: center !important;
}
.field-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}
.option-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.35;
  margin-top: 1px;
}
.job-status {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: capitalize;
}
.error {
  color: var(--color-danger, #ef4444);
  font-size: 0.75rem;
  margin: 0;
}
.success {
  color: var(--color-success, #22c55e);
  font-size: 0.75rem;
  margin: 0;
  overflow-wrap: anywhere;
}
.result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.actions {
  display: flex;
  width: 100%;
  margin-top: 4px;
}
.export-progress-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.progress-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.percentage-badge {
  display: inline-block;
  width: 4ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-primary);
}

:deep(.export-trigger) {
  -webkit-app-region: no-drag;
  width: auto;
  min-width: 9rem;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
</style>
