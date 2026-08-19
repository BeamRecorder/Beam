<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, FolderOpen, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import Popover from '~/ui/popover/Popover.vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import Switch from '~/ui/switch/Switch.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useExportJob } from './useExportJob';
import { bitrateFor } from './export-presets';
import type { ExportFormat, ExportPreset, ExportRequest } from './export-types';
import { useTranslate } from '~/i18n/useTranslate';
import { safeExportErrorMessage, technicalExportError } from './mediabunny/export-preflight';
import { buildBeamExportReport } from './export-diagnostics';

const { t } = useTranslate('ExportPopover');

export type ExportResolutionOption = '720p' | '1080p' | 'max';
export type ExportFrameRate = 24 | 30 | 60;

const recommendedFrameRate = (sourceFps: number): ExportFrameRate => {
  if (sourceFps >= 50) return 60;
  if (sourceFps <= 27) return 24;
  return 30;
};

const props = defineProps<{ request: Omit<ExportRequest, 'format' | 'preset'> }>();
const emit = defineEmits<{ (event: 'update:includeAudio', value: boolean): void }>();
const format = ref<ExportFormat>('webm');
const preset = ref<ExportPreset>('medium');
const resolution = ref<ExportResolutionOption>('max');
const frameRate = ref<ExportFrameRate>(recommendedFrameRate(props.request.snapshot.render.fps));
const presets: ExportPreset[] = ['low', 'medium', 'high'];
const frameRates: ExportFrameRate[] = [24, 30, 60];
const moreOptionsOpen = ref(false);
const includeAudio = computed({
  get: () => props.request.includeAudio !== false,
  set: (value: boolean) => emit('update:includeAudio', value),
});

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
  const bps = bitrateFor(p, width, height, frameRate.value);
  return (bps / 1_000_000).toFixed(1);
};

const presetDescriptions = computed<Record<ExportPreset, string>>(() => ({
  low: t('lowDesc', { mbps: getMb('low') }),
  medium: t('mediumDesc', { mbps: getMb('medium') }),
  high: t('highDesc', { mbps: getMb('high') }),
}));

const frameRateDescriptions = computed<Record<ExportFrameRate, string>>(() => ({
  24: t('frameRate24Desc'),
  30: t('frameRate30Desc'),
  60: t('frameRate60Desc'),
}));

const availability = ref<string | null>(null);
const { progress, error, errorContext, result, diagnostics, isChoosingDestination, isExporting, start, cancel } =
  useExportJob();
const toastStore = useToastStore();
const percentage = computed(() => {
  const value = progress.value;
  return value?.totalImages ? (value.completedImages / value.totalImages) * 100 : 0;
});
const displayError = computed(() => availability.value || (error.value ? safeExportErrorMessage(error.value) : null));

const lastRequest = ref<ExportRequest | null>(null);
const reportRequest = computed<ExportRequest>(() => {
  if (lastRequest.value) return lastRequest.value;
  const { width, height } = activeDimensions.value;
  return {
    ...props.request,
    format: format.value,
    preset: preset.value,
    snapshot: {
      ...props.request.snapshot,
      render: { ...props.request.snapshot.render, fps: frameRate.value },
      canvas: { ...props.request.snapshot.canvas, width, height },
    },
  };
});
const exportReport = computed(() =>
  buildBeamExportReport({
    request: reportRequest.value,
    format: reportRequest.value.format,
    preset: reportRequest.value.preset,
    status: error.value ? 'failed' : result.value ? 'completed' : 'running',
    progress: progress.value,
    diagnostics: result.value?.diagnostics ?? diagnostics.value,
    outputPath: result.value?.path,
    error: error.value ? technicalExportError(errorContext?.value ?? error.value) : undefined,
  }),
);

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
      render: { ...props.request.snapshot.render, fps: frameRate.value },
      canvas: {
        ...props.request.snapshot.canvas,
        width,
        height,
      },
    },
  };
  lastRequest.value = request;
  await start(request);
  if (error.value) {
    const technical = exportReport.value;
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
</script>

<template>
  <Popover align="right" :match-trigger-width="false" :close-on-window-blur="false">
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
            <span class="percentage-badge" aria-live="polite">{{ Math.round(percentage) }}%</span>
          </div>

          <ProgressBar :value="percentage" class="main-progress-bar" />

          <div class="progress-footer">
            <div class="progress-actions">
              <CopyButton
                :text="exportReport"
                display="text"
                variant="ghost"
                size="xs"
                :label="t('copyReport')"
                :copied-label="t('copied')"
                :error-label="t('copyFailed')"
                class="copy-progress-button"
              />
            </div>
            <span class="progress-details">
              {{ t('frameCount', { completed: progress?.completedImages ?? 0, total: progress?.totalImages ?? 0 }) }}
            </span>
          </div>

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
            <div class="field-heading">
              <span class="field-label">{{ t('resolution') }}</span>
              <InfoTooltip :content="resolutionDescriptions[resolution]" position="left" />
            </div>
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
          </div>

          <div class="field">
            <div class="field-heading">
              <span class="field-label">{{ t('frameRate') }}</span>
              <InfoTooltip :content="frameRateDescriptions[frameRate]" position="left" />
            </div>
            <ButtonGroup full>
              <Button
                v-for="value in frameRates"
                :key="value"
                variant="tab"
                size="sm"
                block
                :class="{ active: frameRate === value }"
                @click="frameRate = value"
              >
                {{ value }} fps
              </Button>
            </ButtonGroup>
          </div>

          <Accordion v-model="moreOptionsOpen" :title="t('moreOptions')" class="more-options">
            <div class="more-options-content">
              <div class="audio-option-copy">
                <span class="audio-option-title">{{ t('includeAudio') }}</span>
                <span class="option-hint">{{ t('includeAudioDesc') }}</span>
              </div>
              <Switch v-model="includeAudio" :aria-label="t('includeAudio')" />
            </div>
          </Accordion>

          <div class="field">
            <div class="field-heading">
              <span class="field-label">{{ t('qualityAndBitrate') }}</span>
              <InfoTooltip :content="presetDescriptions[preset]" position="left" />
            </div>
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
                {{ t(value) }}
              </Button>
            </ButtonGroup>
          </div>

          <div v-if="displayError" class="error-box" role="alert">
            <div class="error-header">
              <p class="error-message">{{ displayError }}</p>
              <CopyButton
                :text="exportReport || displayError"
                display="icon"
                variant="ghost"
                size="sm"
                :label="t('copyError')"
                :copied-label="t('copied')"
                :error-label="t('copyFailed')"
                class="copy-error-icon-btn"
              />
            </div>
          </div>
          <div v-if="result" class="result-box">
            <div class="result-header">
              <p class="success" role="status">{{ t('savedTo', { path: result.path }) }}</p>
              <CopyButton
                :text="exportReport"
                display="icon"
                variant="ghost"
                size="sm"
                :label="t('copyReport')"
                :copied-label="t('copied')"
                :error-label="t('copyFailed')"
                class="copy-report-icon-btn"
              />
            </div>
            <Button variant="secondary" size="sm" block :icon="FolderOpen" @click="openFile(result.path)">
              {{ t('openFile') }}
            </Button>
          </div>
          <div class="actions">
            <Button variant="primary" size="sm" block :icon="Download" :loading="isChoosingDestination" @click="run">{{
              t('exportVideo')
            }}</Button>
          </div>
        </template>
      </section>
    </template>
  </Popover>
</template>

<style scoped>
.export-popover {
  width: 320px;
  max-width: 100%;
  max-height: calc(100vh - 24px);
  padding: 16px;
  box-sizing: border-box;
  display: grid;
  gap: 14px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.field {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  gap: 8px;
  min-width: 0;
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
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}
.job-status {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: capitalize;
  min-width: 0;
}
.error-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--color-error-light, rgba(239, 68, 68, 0.1));
  border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 30%, transparent);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}
.error-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  width: 100%;
}
.error-message {
  color: var(--color-error, #ef4444);
  font-size: 0.75rem;
  line-height: 1.35;
  margin: 0;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.copy-error-icon-btn {
  flex-shrink: 0;
}
.success {
  color: var(--color-success, #22c55e);
  font-size: 0.75rem;
  margin: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}
.result-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  width: 100%;
}
.copy-report-icon-btn {
  flex-shrink: 0;
}
.actions {
  display: flex;
  width: 100%;
  margin-top: 4px;
}
.more-options {
  display: grid;
  min-width: 0;
}
.more-options-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.audio-option-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.audio-option-title {
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 600;
}
.export-progress-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.progress-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  gap: 12px;
  min-width: 0;
}

.progress-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.progress-details {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
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
