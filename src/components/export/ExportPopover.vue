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

const { t, locale } = useTranslate('ExportPopover');

export type ExportResolutionOption = '720p' | '1080p' | 'max';
export type ExportFrameRate = 24 | 30 | 60;

const recommendedFrameRate = (sourceFps: number): ExportFrameRate => {
  if (sourceFps >= 50) return 60;
  if (sourceFps <= 27) return 24;
  return 30;
};

const props = withDefaults(
  defineProps<{
    request: Omit<ExportRequest, 'format' | 'preset'>;
    playheadSeconds?: number;
  }>(),
  { playheadSeconds: 0 },
);
const emit = defineEmits<{ (event: 'update:includeAudio', value: boolean): void }>();
const format = ref<ExportFormat>('webm');
const preset = ref<ExportPreset>('medium');
const resolution = ref<ExportResolutionOption>('max');
const frameRate = ref<ExportFrameRate>(recommendedFrameRate(props.request.snapshot.render.fps));
const presets: ExportPreset[] = ['low', 'medium', 'high'];
const frameRates: ExportFrameRate[] = [24, 30, 60];
const moreOptionsOpen = ref(false);
const exportUntilPlayhead = ref(false);
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
const playheadDuration = computed(() => {
  const value = Number(props.playheadSeconds);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(props.request.snapshot.duration, value));
});
const activeExportDuration = computed(() =>
  exportUntilPlayhead.value ? playheadDuration.value : props.request.snapshot.duration,
);
const formattedExportDuration = computed(() =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(activeExportDuration.value),
);
const exportButtonLabel = computed(() =>
  exportUntilPlayhead.value ? t('exportVideoDuration', { seconds: formattedExportDuration.value }) : t('exportVideo'),
);
const canExport = computed(() => activeExportDuration.value > 0);

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
const buildRequest = (): ExportRequest => {
  const { width, height } = activeDimensions.value;
  return {
    ...props.request,
    format: format.value,
    preset: preset.value,
    snapshot: {
      ...props.request.snapshot,
      duration: activeExportDuration.value,
      render: { ...props.request.snapshot.render, fps: frameRate.value },
      canvas: { ...props.request.snapshot.canvas, width, height },
    },
  };
};
const reportRequest = computed<ExportRequest>(() => {
  if (lastRequest.value) return lastRequest.value;
  return buildRequest();
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
  if (!canExport.value) return;
  const request = buildRequest();
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
            <div class="more-options-list">
              <div class="more-options-content">
                <div class="more-option-copy">
                  <span class="more-option-title">{{ t('includeAudio') }}</span>
                  <span class="option-hint">{{ t('includeAudioDesc') }}</span>
                </div>
                <Switch v-model="includeAudio" :aria-label="t('includeAudio')" />
              </div>
              <div class="more-options-content">
                <div class="more-option-copy">
                  <span class="more-option-title">{{ t('exportUntilPlayhead') }}</span>
                  <span class="option-hint">{{ t('exportUntilPlayheadDesc') }}</span>
                </div>
                <Switch v-model="exportUntilPlayhead" :aria-label="t('exportUntilPlayhead')" />
              </div>
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
            <Button
              variant="primary"
              size="sm"
              block
              :icon="Download"
              :loading="isChoosingDestination"
              :disabled="!canExport"
              @click="run"
            >
              {{ exportButtonLabel }}
            </Button>
          </div>
          <p v-if="exportUntilPlayhead" class="playhead-export-note">
            {{ t('exportUntilPlayheadEnabled') }}
          </p>
        </template>
      </section>
    </template>
  </Popover>
</template>

<style scoped src="./ExportPopover.css"></style>
