<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Download, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import Select from '~/ui/select/Select.vue';
import Divider from '~/ui/divider/Divider.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import type { CaptionClip, CaptionSentence, ClipComposition } from '~/media/shared/composition-types';
import { createComposition } from '../../composition/engine/clip-engine';
import { useWhisperTranscription } from '../../captions/useWhisperTranscription';
import { whisperModels, type TranscriptionSource, type WhisperModelId } from '../../captions/whisper-types';
import type { ProjectEditorData } from '../../../../api/types/capture-api';
import { capture } from '../../../../api/capture';
import { captionSources } from './caption-sources';
import { useTranslate } from '~/i18n/useTranslate';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { buildBeamTranscriptionReport, formatTranscriptionElapsed } from '../../captions/transcription-diagnostics';

const { t } = useTranslate('CaptionPanel');
const { t: tHud } = useTranslate('HUD');
const { t: tExport } = useTranslate('ExportPopover');
const props = defineProps<{
  composition: ClipComposition;
  editorData?: ProjectEditorData | null;
  timelineDurationMs: number;
}>();
const emit = defineEmits<{
  (event: 'update:composition', composition: ClipComposition): void;
  (event: 'select-caption', clipId: string): void;
}>();

const source = ref<TranscriptionSource>('system');
const model = ref<WhisperModelId>('Xenova/whisper-tiny');
const { progress, diagnostics, transcribe, cancel } = useWhisperTranscription();
const modelStates = ref<
  Record<string, { status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>
>({});
const downloadProgress = ref<{ id: string; downloadedBytes: number; totalBytes: number | null } | null>(null);
const downloadError = ref<string | null>(null);
const isDownloading = ref(false);
const isDeleting = ref(false);
const isTranscribing = ref(false);
const transcriptionSourceLabel = ref<string | null>(null);
let transcriptionRun = 0;

const cancelTranscription = () => {
  transcriptionRun += 1;
  cancel();
  isTranscribing.value = false;
};

const selectedModelState = computed(() => modelStates.value[model.value]);
const modelReady = computed(() => selectedModelState.value?.status === 'ready');
const isProcessing = computed(
  () => isTranscribing.value || progress.value.status === 'loading' || progress.value.status === 'running',
);
const visibleError = computed(
  () => downloadError.value || (progress.value.status === 'error' ? progress.value.message : ''),
);
const progressPercent = computed(() =>
  downloadProgress.value?.totalBytes
    ? (downloadProgress.value.downloadedBytes / downloadProgress.value.totalBytes) * 100
    : 0,
);
const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
const transcriptionReport = computed(() =>
  diagnostics.value ? buildBeamTranscriptionReport(diagnostics.value, transcriptionSourceLabel.value) : '',
);
const transcriptionStatus = computed(() => {
  if (!diagnostics.value) return '';
  if (progress.value.status === 'completed') return progress.value.message;
  return formatTranscriptionElapsed(diagnostics.value.elapsedMs);
});

const aiCaptions = computed(() =>
  props.composition.clips.filter((clip): clip is CaptionClip => clip.kind === 'caption' && Boolean(clip.isAiGenerated)),
);
const hasAiCaptions = computed(() => aiCaptions.value.length > 0);

const loadModels = async () => {
  modelStates.value = Object.fromEntries((await capture.whisperModels()).map((item) => [item.id, item]));
};
const downloadModel = async () => {
  if (isDownloading.value || isDeleting.value) return;
  isDownloading.value = true;
  downloadError.value = null;
  downloadProgress.value = null;
  try {
    await capture.downloadWhisperModel(model.value);
    await loadModels();
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : t('modelDownloadFailed');
  } finally {
    isDownloading.value = false;
  }
};

const deleteModel = async () => {
  if (isDeleting.value || isDownloading.value || isTranscribing.value) return;
  isDeleting.value = true;
  downloadError.value = null;
  try {
    await capture.deleteWhisperModel(model.value);
    await loadModels();
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : t('modelDownloadFailed');
  } finally {
    isDeleting.value = false;
  }
};

let unsubscribe: (() => void) | null = null;
onMounted(async () => {
  await loadModels();
  unsubscribe = capture.onWhisperProgress((event) => {
    if (event.id === model.value) downloadProgress.value = event;
  });
});
onBeforeUnmount(() => {
  transcriptionRun += 1;
  unsubscribe?.();
});

const sources = computed(() => captionSources(props.composition, props.editorData));
const selectedSource = computed(() => sources.value.find((item) => item.id === source.value) ?? null);
const modelSelectItems = computed(() =>
  whisperModels.map((item) => ({
    value: item.id,
    label: `${modelStates.value[item.id]?.status === 'ready' ? '✓ ' : ''}${item.label} (${item.languages})`,
  })),
);
const sourceSelectItems = computed(() => sources.value.map((item) => ({ value: item.id, label: item.label })));

const runTranscription = async () => {
  if (!selectedSource.value || isTranscribing.value) return;
  const run = ++transcriptionRun;
  isTranscribing.value = true;
  transcriptionSourceLabel.value = selectedSource.value.label;
  const captionIds = new Map<string, string>();
  const applySentences = (sentences: CaptionSentence[]) => {
    if (run !== transcriptionRun) return [];
    if (!sentences.length) return [];
    const preserved = props.composition.clips.filter((clip) => clip.kind !== 'caption' || !clip.isAiGenerated);
    const captions: CaptionClip[] = sentences.map((sentence, index) => {
      const durationMs = Math.max(40, sentence.endMs - sentence.startMs);
      let clipId = captionIds.get(sentence.id);
      if (!clipId) {
        clipId = crypto.randomUUID();
        captionIds.set(sentence.id, clipId);
      }
      return {
        id: clipId,
        kind: 'caption',
        name: `AI Caption ${index + 1}`,
        timelineStartMs: sentence.startMs,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: preserved.length + index,
        isAiGenerated: true,
        caption: {
          type: 'text',
          sentences: [sentence],
          style: {
            ...createDefaultCaptionStyle(36),
            shadowColor: 'rgba(0, 0, 0, 0.8)',
            shadowBlur: 8,
            shadowDirection: 'bottom-right',
          },
        },
      };
    });
    const composition = createComposition(
      props.composition.assets,
      [...preserved, ...captions],
      props.composition.keyboardCaptionSessions,
    );
    emit('update:composition', composition);
    return captions;
  };
  try {
    const result = await transcribe(selectedSource.value.src, model.value, props.timelineDurationMs, (partial) =>
      applySentences(partial.sentences),
    );
    if (run !== transcriptionRun) return;
    const captions = applySentences(result.sentences);
    if (run === transcriptionRun && captions.length) emit('select-caption', captions[0]!.id);
  } catch {
    // The composable exposes the actionable worker error through progress.
  } finally {
    if (run === transcriptionRun) isTranscribing.value = false;
  }
};
</script>

<template>
  <div class="caption-sidebar-panel">
    <div class="options-group">
      <!-- AI Generation Configuration Block -->
      <div class="section-block">
        <p class="section-desc">{{ t('headerDesc') }}</p>

        <Divider spacing="xs" />

        <div v-if="sources.length" class="sub-group">
          <span class="sub-label">{{ t('audioSource') }}</span>
          <Select
            :items="sourceSelectItems"
            :model-value="source"
            size="sm"
            @update:model-value="source = $event as TranscriptionSource"
          />
        </div>

        <div class="sub-group">
          <span class="sub-label">{{ t('whisperModel') }}</span>
          <Select
            :items="modelSelectItems"
            :model-value="model"
            size="sm"
            @update:model-value="model = $event as WhisperModelId"
          />
          <div v-if="modelReady" class="model-action-row">
            <span class="model-ready-text">{{ t('modelReady') }}</span>
            <Button
              variant="outline"
              size="xs"
              :icon="Trash2"
              :disabled="isDeleting || isProcessing"
              @click="deleteModel"
            >
              {{ isDeleting ? t('deleting') : t('deleteModel') }}
            </Button>
          </div>
          <Button
            v-else
            variant="secondary"
            size="sm"
            :icon="Download"
            :disabled="isDownloading || isDeleting || isProcessing"
            @click="downloadModel"
            block
          >
            {{ isDownloading ? t('processing') : t('downloadModel') }}
          </Button>
        </div>

        <div v-if="downloadProgress?.id === model" class="progress-block">
          <ProgressBar :value="progressPercent" />
          <span class="progress-text"
            >{{ formatMegabytes(downloadProgress.downloadedBytes) }} /
            {{ downloadProgress.totalBytes ? formatMegabytes(downloadProgress.totalBytes) : '…' }}</span
          >
        </div>

        <div v-if="progress.status === 'loading' || progress.status === 'running'" class="progress-block">
          <div class="transcription-throbber-row">
            <Throbber
              :text="progress.message || t('processing')"
              :respect-reduced-motion="false"
              inherit-typography
              variant="highlight"
              speed="slow"
            />
          </div>
          <ProgressBar :value="progress.progress ?? 0" />
        </div>

        <div v-if="!isProcessing && transcriptionReport" class="transcription-diagnostics-row">
          <span class="transcription-diagnostics-status" aria-live="polite">{{ transcriptionStatus }}</span>
          <CopyButton
            :text="transcriptionReport"
            display="text"
            variant="ghost"
            size="xs"
            :label="tExport('copyReport')"
            :copied-label="tExport('copied')"
            :error-label="tExport('copyFailed')"
          />
        </div>
      </div>

      <Divider v-if="hasAiCaptions" spacing="xs" />

      <!-- Active Captions Status Block -->
      <div v-if="hasAiCaptions" class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('aiCaptionsActive') }}</span>
          <Button variant="ghost" size="xs" @click="emit('select-caption', aiCaptions[0].id)">{{ t('edit') }}</Button>
        </div>
        <p class="section-desc">{{ t('subtitlesGenerated', { count: aiCaptions.length }) }}</p>
      </div>

      <!-- Bottom Generate Action -->
      <div class="generate-action-footer">
        <div v-if="visibleError" class="error-block" role="alert">
          <p class="error-text">{{ visibleError }}</p>
          <CopyButton
            :text="visibleError"
            display="text"
            variant="ghost"
            size="xs"
            :label="tHud('copyError')"
            :copied-label="tHud('copied')"
            :error-label="tExport('copyFailed')"
          />
        </div>

        <Button
          v-if="isProcessing"
          variant="outline"
          size="sm"
          class="cancel-transcription-btn"
          @click="cancelTranscription"
          block
        >
          {{ t('cancel') }}
        </Button>

        <Button
          variant="primary"
          size="md"
          :disabled="!modelReady || !selectedSource || isProcessing"
          @click="runTranscription"
          block
        >
          {{ !isProcessing ? (hasAiCaptions ? t('regenerateAICaptions') : t('generateCaptions')) : t('processing') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.caption-sidebar-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 18px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
  margin: -2px 0 4px;
}

.sub-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}

.model-ready-text {
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
  margin-top: 1px;
}

.progress-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-text {
  font-size: 10px;
  color: var(--text-muted);
}

.transcription-diagnostics-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
}

.transcription-diagnostics-status {
  min-width: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.error-text {
  color: var(--color-error, #ef4444);
  font-size: 11px;
  margin: 0;
  user-select: text;
  overflow-wrap: anywhere;
}

.error-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.model-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.transcription-throbber-row {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 18px;
  padding: 2px 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.35;
}

.cancel-transcription-btn {
  margin-bottom: 2px;
}

.generate-action-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
}
</style>
