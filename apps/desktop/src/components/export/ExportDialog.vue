<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { editorSearchKey } from '../editor/search/editor-search-types';
import { capture } from '~/api/capture';
import { Download } from '@lucide/vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Button from '~/ui/button/Button.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import Dialog from '~/ui/dialog/Dialog.vue';
import Input from '~/ui/input/Input.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { estimatedExportBytes } from '@beam/encoder/export-estimate';
import { formatExportSize } from './export-size';
import type { ExportResolutionOption, ExportFrameRate } from './export-dialog-types';
import { useExportJob } from './useExportJob';
import { bitrateFor } from '@beam/encoder/export-presets';
import type { EditorExportSource, ExportFormat, ExportPreset } from '@beam/encoder/export-types';
import { useTranslate } from '~/i18n/useTranslate';
import { safeExportErrorMessage, technicalExportError } from '@beam/encoder/mediabunny/export-preflight';
import { buildBeamExportReport } from '@beam/encoder/export-diagnostics';
import type { DesktopExportRequest } from './experimental-export-types';
import { useExportBackendPreference } from './useExportBackendPreference';
import ExportVideoOptions from './ExportVideoOptions.vue';
import DirectoryPreference from '~/components/settings/DirectoryPreference.vue';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import ExportStatusPill from './ExportStatusPill.vue';
import type { ExportMorphSource } from './export-status-types';
import { captureExportMorph } from './useExportPillMorph';

const { t, locale } = useTranslate('ExportPopover');
const preparing = ref(false);
let cancelledPreparing = false;

const recommendedFrameRate = (sourceFps: number): ExportFrameRate => {
  if (sourceFps >= 50) return 60;
  if (sourceFps <= 27) return 24;
  return 30;
};

const props = withDefaults(
  defineProps<{
    request: EditorExportSource;
    playheadSeconds?: number;
  }>(),
  { playheadSeconds: 0 },
);
const emit = defineEmits<{
  (event: 'update:includeAudio', value: boolean): void;
}>();
const isOpen = ref(false);
const dialog = ref<InstanceType<typeof Dialog> | null>(null);
const morphFrom = ref<ExportMorphSource | null>(null);
const pillVisible = ref(false);
const jobSequence = ref(0);
const fileName = ref(props.request.projectName);
watch(
  () => props.request.projectName,
  (name, previous) => {
    if (fileName.value === previous) fileName.value = name;
  },
);
const search = inject(editorSearchKey, null);
const releaseAction = search?.registerActions(() => [
  {
    id: 'action:export',
    group: 'action',
    label: t('export'),
    run: () => openDialog(),
  },
]);
onBeforeUnmount(() => releaseAction?.());
const format = ref<ExportFormat>('mp4');
const preset = ref<ExportPreset>('medium');
const resolution = ref<ExportResolutionOption>('max');
const frameRate = ref<ExportFrameRate>(recommendedFrameRate(props.request.fps));
const exportUntilPlayhead = ref(false);
const {
  available: isLinux,
  enabled: experimentalLinuxFfmpeg,
  ready: backendReady,
  busy: backendBusy,
  error: backendError,
  setEnabled: setExperimentalLinuxFfmpeg,
} = useExportBackendPreference();
const includeAudio = computed({
  get: () => props.request.includeAudio !== false,
  set: (value: boolean) => emit('update:includeAudio', value),
});

const formatDescriptions = computed<Record<ExportFormat, string>>(() => ({
  webm: t('webmDesc'),
  mp4: t('mp4Desc'),
}));

const nativeWidth = computed(() => props.request.width);
const nativeHeight = computed(() => props.request.height);

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
  return Math.max(0, Math.min(props.request.duration, value));
});
const activeExportDuration = computed(() =>
  exportUntilPlayhead.value ? playheadDuration.value : props.request.duration,
);
const formattedExportDuration = computed(() =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(activeExportDuration.value),
);
const exportButtonLabel = computed(() =>
  exportUntilPlayhead.value ? t('exportVideoDuration', { seconds: formattedExportDuration.value }) : t('exportVideo'),
);
const canExport = computed(
  () =>
    !preparing.value &&
    activeExportDuration.value > 0 &&
    fileName.value.trim().length > 0 &&
    backendReady.value &&
    !backendBusy.value,
);

const estimatedSize = computed(() =>
  formatExportSize(
    estimatedExportBytes({
      ...activeDimensions.value,
      fps: frameRate.value,
      preset: preset.value,
      duration: activeExportDuration.value,
      includeAudio: includeAudio.value && props.request.hasAudio,
    }),
    locale.value,
  ),
);

const resolutionDescriptions = computed<Record<ExportResolutionOption, string>>(() => {
  const dims720 = computeExportDimensions('720p');
  const dims1080 = computeExportDimensions('1080p');
  const dimsMax = computeExportDimensions('max');
  return {
    '720p': t('res720pDesc', {
      width: dims720.width,
      height: dims720.height,
    }),
    '1080p': t('res1080pDesc', {
      width: dims1080.width,
      height: dims1080.height,
    }),
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
const {
  progress,
  preview,
  error,
  errorContext,
  result,
  diagnostics,
  isChoosingDestination,
  isExporting,
  start,
  cancel,
} = useExportJob();
const openDialog = () => {
  if (preparing.value || isExporting.value || isChoosingDestination.value) {
    document.querySelector<HTMLElement>('.export-status-host .snip-pill')?.focus();
    return;
  }
  morphFrom.value = null;
  isOpen.value = true;
};
const closeDialog = () => {
  isOpen.value = false;
};
const percentage = computed(() => {
  const value = progress.value;
  return Math.max(0, Math.min(100, (value?.overallProgress ?? 0) * 100));
});
const displayError = computed(() => availability.value || backendError.value);

const lastRequest = ref<DesktopExportRequest | null>(null);
const buildRequest = (): DesktopExportRequest => {
  const { width, height } = activeDimensions.value;
  const snapshot = props.request.createSnapshot();
  return {
    projectName: props.request.projectName,
    fileName: fileName.value.trim(),
    includeAudio: props.request.includeAudio,
    format: format.value,
    preset: preset.value,
    preview: true,
    ...(isLinux && experimentalLinuxFfmpeg.value ? { experimentalLinuxFfmpeg: true } : {}),
    snapshot: {
      ...snapshot,
      duration: activeExportDuration.value,
      render: { ...snapshot.render, fps: frameRate.value },
      canvas: { ...snapshot.canvas, width, height },
    },
  };
};
const exportReport = computed(() => {
  const request = lastRequest.value;
  if (!request) return '';
  return buildBeamExportReport({
    request,
    format: request.format,
    preset: request.preset,
    status: error.value ? 'failed' : result.value ? 'completed' : 'running',
    progress: progress.value,
    diagnostics: result.value?.diagnostics ?? diagnostics.value,
    outputPath: result.value?.path,
    error: error.value ? technicalExportError(errorContext?.value ?? error.value) : undefined,
  });
});

onMounted(() => {
  if (!isExporting.value && !isChoosingDestination.value) result.value = null;
  void capture
    .getEditorPresets()
    .then((document) => {
      const saved = document.presets.find((item) => item.id === document.activePresetId)?.settings.export;
      if (!saved) return;
      if (saved.format === 'mp4' || saved.format === 'webm') format.value = saved.format;
      if (saved.preset === 'low' || saved.preset === 'medium' || saved.preset === 'high') preset.value = saved.preset;
      if (saved.resolution === '720p' || saved.resolution === '1080p' || saved.resolution === 'max')
        resolution.value = saved.resolution;
      if (saved.frameRate === 24 || saved.frameRate === 30 || saved.frameRate === 60) frameRate.value = saved.frameRate;
    })
    .catch(() => undefined);
});

const run = async () => {
  availability.value = null;
  if (!canExport.value || isExporting.value || isChoosingDestination.value) return;
  let request: DesktopExportRequest;
  try {
    request = buildRequest();
  } catch (reason) {
    availability.value = safeExportErrorMessage(reason instanceof Error ? reason.message : String(reason));
    return;
  }
  morphFrom.value = captureExportMorph(dialog.value?.content);
  error.value = null;
  result.value = null;
  preparing.value = true;
  cancelledPreparing = false;
  jobSequence.value += 1;
  pillVisible.value = true;
  isOpen.value = false;
  try {
    lastRequest.value = request;
    try {
      await capture.updateEditorPreset('default', {
        export: {
          format: format.value,
          preset: preset.value,
          resolution: resolution.value,
          frameRate: frameRate.value,
          includeAudio: includeAudio.value,
        },
      });
    } catch (reason) {
      console.error('Unable to save export preset', reason);
    }
    if (cancelledPreparing) {
      pillVisible.value = false;
      return;
    }
    await start(request);
    if (!error.value && !result.value) pillVisible.value = false;
  } finally {
    preparing.value = false;
  }
};
const cancelExport = () => {
  cancelledPreparing = true;
  cancel();
};
</script>

<template>
  <Button variant="primary" size="sm" :icon="Download" class="export-trigger" style="height: 2rem" @click="openDialog">
    {{ isExporting ? `${Math.round(percentage)}%` : t('exportVideo') }}
  </Button>
  <Dialog
    ref="dialog"
    :animate="!morphFrom"
    :is-open="isOpen"
    :title="t('dialogTitle')"
    size="lg"
    scroll-shadow
    @close="closeDialog"
  >
    <section class="export-dialog" :aria-label="t('exportVideoAria')" @click.stop>
      <fieldset class="export-fields" :disabled="isChoosingDestination || preparing">
        <div class="export-destination">
          <label class="field">
            <span class="field-label">{{ t('fileName') }}</span>
            <Input v-model="fileName" :unit="`.${format}`" :aria-label="t('fileName')" data-dialog-autofocus />
          </label>
          <div class="field">
            <div class="field-heading">
              <span class="field-label">{{ t('format') }}</span>
              <InfoTooltip
                :content="`${t('mp4')}: ${formatDescriptions.mp4}\n\n${t('webm')}: ${formatDescriptions.webm}`"
                position="left"
              />
            </div>
            <ButtonGroup
              class="export-format-choices"
              full
              variant="neutral"
              :selection="{ index: format === 'webm' ? 0 : 1, count: 2 }"
            >
              <Button
                style="height: calc(2.75rem - 2 * var(--button-group-padding-y) - 2px); padding-block: 0"
                variant="tab"
                size="sm"
                block
                :class="{ active: format === 'webm' }"
                :aria-pressed="format === 'webm'"
                @click="format = 'webm'"
              >
                {{ t('webm') }}
              </Button>
              <Button
                style="height: calc(2.75rem - 2 * var(--button-group-padding-y) - 2px); padding-block: 0"
                variant="tab"
                size="sm"
                block
                :class="{ active: format === 'mp4' }"
                :aria-pressed="format === 'mp4'"
                @click="format = 'mp4'"
              >
                {{ t('mp4') }}
              </Button>
            </ButtonGroup>
          </div>
          <DirectoryPreference
            class="export-directory"
            kind="exports"
            compact
            :disabled="isChoosingDestination || preparing"
          />
        </div>
        <ExportVideoOptions
          v-model:preset="preset"
          v-model:resolution="resolution"
          v-model:frame-rate="frameRate"
          v-model:include-audio="includeAudio"
          v-model:export-until-playhead="exportUntilPlayhead"
          :native-height="nativeHeight"
          :disabled="isChoosingDestination || preparing"
          :resolution-descriptions="resolutionDescriptions"
          :preset-descriptions="presetDescriptions"
          :frame-rate-descriptions="frameRateDescriptions"
        />
        <TogglePreference
          v-if="isLinux"
          :model-value="experimentalLinuxFfmpeg"
          :label="t('experimentalFfmpeg')"
          :description="t('experimentalFfmpegDesc')"
          :disabled="!backendReady || backendBusy || isChoosingDestination || preparing"
          :busy="backendBusy"
          switch-variant="primary"
          @update:model-value="setExperimentalLinuxFfmpeg"
        />
      </fieldset>
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
    </section>
    <template #footer>
      <div class="export-footer">
        <div class="export-estimate" role="status" aria-live="polite">
          <span
            >{{ t('estimatedSize') }} <strong>{{ estimatedSize }}</strong></span
          >
          <small>{{ t('sizeHint') }}</small>
        </div>
        <Button
          class="export-submit"
          variant="primary"
          :icon="Download"
          :loading="isChoosingDestination || preparing"
          :disabled="!canExport"
          @click="run"
          >{{ exportButtonLabel }}</Button
        >
      </div>
    </template>
  </Dialog>
  <ExportStatusPill
    v-if="pillVisible"
    :key="jobSequence"
    :state="error ? 'failed' : result ? 'completed' : 'working'"
    :name="lastRequest?.fileName || fileName"
    :format="lastRequest?.format || format"
    :progress="progress?.overallProgress"
    :stage-label="progress?.stageLabel"
    :preview="preview"
    :file-path="result?.path"
    :error="error ? safeExportErrorMessage(error) : null"
    :report="exportReport"
    :morph-from="morphFrom"
    @cancel="cancelExport"
    @dismiss="pillVisible = false"
  />
</template>

<style scoped src="./export-dialog.css"></style>
