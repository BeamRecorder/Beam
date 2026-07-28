<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CheckCircle, Download, RefreshCw, Sparkles } from "@lucide/vue";
import Button from "~/ui/button/Button.vue";
import ProgressBar from "~/ui/progressbar/ProgressBar.vue";
import Select from "~/ui/select/Select.vue";
import type { CaptionClip, ClipComposition } from "../../composition/composition-types";
import { createComposition } from "../../composition/engine/clip-engine";
import { useWhisperTranscription } from "../../captions/useWhisperTranscription";
import { whisperModels, type TranscriptionSource, type WhisperModelId } from "../../captions/whisper-types";
import type { ProjectEditorData } from "../../../../api/types/capture-api";
import { capture } from "../../../../api/capture";
import { captionSources } from "./caption-sources";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("CaptionPanel");
const props = defineProps<{ composition: ClipComposition; editorData?: ProjectEditorData | null; timelineDurationMs: number }>();
const emit = defineEmits<{
  (event: "update:composition", composition: ClipComposition): void;
  (event: "select-caption", clipId: string): void;
}>();
const source = ref<TranscriptionSource>("system");
const model = ref<WhisperModelId>("Xenova/whisper-tiny");
const { progress, transcribe } = useWhisperTranscription();
const modelStates = ref<Record<string, { status: "missing" | "ready"; downloadedBytes: number; totalBytes: number | null }>>({});
const downloadProgress = ref<{ id: string; downloadedBytes: number; totalBytes: number | null } | null>(null);
const downloadError = ref<string | null>(null);
const selectedModelState = computed(() => modelStates.value[model.value]);
const modelReady = computed(() => selectedModelState.value?.status === "ready");
const progressPercent = computed(() => downloadProgress.value?.totalBytes ? downloadProgress.value.downloadedBytes / downloadProgress.value.totalBytes * 100 : 0);
const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
const aiCaptions = computed(() => props.composition.clips.filter((clip): clip is CaptionClip => clip.kind === "caption" && Boolean(clip.isAiGenerated)));
const hasAiCaptions = computed(() => aiCaptions.value.length > 0);
const loadModels = async () => { modelStates.value = Object.fromEntries((await capture.whisperModels()).map((item) => [item.id, item])); };
const downloadModel = async () => {
  downloadError.value = null;
  downloadProgress.value = null;
  try { await capture.downloadWhisperModel(model.value); await loadModels(); }
  catch (error) { downloadError.value = error instanceof Error ? error.message : t("modelDownloadFailed"); }
};
let unsubscribe: (() => void) | null = null;
onMounted(async () => {
  await loadModels();
  unsubscribe = capture.onWhisperProgress((event) => { if (event.id === model.value) downloadProgress.value = event; });
});
onBeforeUnmount(() => unsubscribe?.());
const sources = computed(() => captionSources(props.composition, props.editorData));
const selectedSource = computed(() => sources.value.find((item) => item.id === source.value) ?? null);
const modelSelectItems = computed(() => whisperModels.map((item) => ({ value: item.id, label: `${modelStates.value[item.id]?.status === "ready" ? "✓ " : ""}${item.label} (${item.languages})` })));
const sourceSelectItems = computed(() => sources.value.map((item) => ({ value: item.id, label: item.label })));
const runTranscription = async () => {
  if (!selectedSource.value) return;
  const result = await transcribe(selectedSource.value.src, model.value, props.timelineDurationMs);
  if (!result.sentences.length) return;
  const preserved = props.composition.clips.filter((clip) => clip.kind !== "caption" || !clip.isAiGenerated);
  const captions: CaptionClip[] = result.sentences.map((sentence, index) => {
    const durationMs = Math.max(40, sentence.endMs - sentence.startMs);
    return {
      id: crypto.randomUUID(),
      kind: "caption",
      name: `AI Caption ${index + 1}`,
      timelineStartMs: sentence.startMs,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs,
      sourceRangeStartMs: 0,
      sourceRangeEndMs: durationMs,
      playbackRate: 1,
      enabled: true,
      order: preserved.length + index,
      isAiGenerated: true,
      caption: { sentences: [sentence], style: { color: "#ffffff", fontSize: 36, shadowColor: "rgba(0, 0, 0, 0.8)", shadowBlur: 8, shadowDirection: "bottom-right", placement: "bottom" } },
    };
  });
  emit("update:composition", createComposition(props.composition.assets, [...preserved, ...captions]));
  emit("select-caption", captions[0].id);
};
</script>

<template>
  <div class="caption-sidebar-panel">
    <div class="header-card"><div class="header-icon-wrap"><Sparkles :size="20" class="sparkles-icon" /></div><div><h3 class="header-title">{{ t('aiAutoCaptioning') }}</h3><p class="header-desc">{{ t('headerDesc') }}</p></div></div>
    <div class="config-card">
      <div v-if="sources.length" class="field-group"><label class="field-label">{{ t('audioSource') }}</label><Select :items="sourceSelectItems" :model-value="source" size="sm" @update:model-value="source = $event as TranscriptionSource" /></div>
      <div class="field-group"><label class="field-label">{{ t('whisperModel') }}</label><Select :items="modelSelectItems" :model-value="model" size="sm" @update:model-value="model = $event as WhisperModelId" /><p v-if="modelReady" class="model-ready"><CheckCircle :size="13" /> {{ t('modelReady') }}</p></div>
      <Button v-if="!modelReady" variant="secondary" size="sm" :icon="Download" block @click="downloadModel">Download Model</Button>
      <div v-if="downloadProgress?.id === model" class="download-progress"><ProgressBar :value="progressPercent" /><p>{{ formatMegabytes(downloadProgress.downloadedBytes) }} / {{ downloadProgress.totalBytes ? formatMegabytes(downloadProgress.totalBytes) : '…' }}</p></div>
      <div v-if="progress.status === 'loading' || progress.status === 'running'" class="transcription-progress"><ProgressBar :value="progress.progress ?? 0" /><p>{{ progress.message }}</p></div>
      <p v-if="downloadError || progress.status === 'error'" class="error-text">{{ downloadError || progress.message }}</p>
      <Button variant="primary" size="md" :icon="hasAiCaptions ? RefreshCw : Sparkles" :disabled="!modelReady || !selectedSource || progress.status === 'loading' || progress.status === 'running'" block class="generate-btn" @click="runTranscription">{{ progress.status === 'idle' ? (hasAiCaptions ? t('regenerateAICaptions') : t('generateCaptions')) : t('processing') }}</Button>
    </div>
    <div v-if="hasAiCaptions" class="active-status-card"><CheckCircle :size="16" class="status-icon" /><div class="status-content"><p class="status-title">{{ t('aiCaptionsActive') }}</p><p class="status-sub">{{ t('subtitlesGenerated', { count: aiCaptions.length }) }}</p></div><Button variant="ghost" size="xs" @click="emit('select-caption', aiCaptions[0].id)">Edit</Button></div>
  </div>
</template>

<style scoped>
.caption-sidebar-panel { display: flex; flex-direction: column; gap: 16px; padding: 4px; }.header-card { display: flex; align-items: flex-start; gap: 12px; background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 14px; }.header-icon-wrap { width: 36px; height: 36px; border-radius: var(--radius-sm); background: rgba(99,102,241,.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }.sparkles-icon { color: var(--color-primary); }.header-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }.header-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.4; }.config-card { display: flex; flex-direction: column; gap: 14px; background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 14px; }.field-group { display: flex; flex-direction: column; gap: 6px; }.field-label { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .03em; }.generate-btn { margin-top: 4px; }.error-text { color: var(--color-error,#ef4444); font-size: 11px; margin: 0; }.model-ready,.download-progress p,.transcription-progress p { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 11px; margin: 0; }.model-ready { color: #10b981; }.download-progress,.transcription-progress { display: flex; flex-direction: column; gap: 6px; }.active-status-card { display: flex; align-items: center; gap: 10px; background: rgba(16,185,129,.08); border: 1px solid rgba(16,185,129,.25); border-radius: var(--radius-md); padding: 12px; }.status-icon { color: #10b981; }.status-content { flex: 1; }.status-title { font-size: 12px; font-weight: 700; color: var(--text-primary); margin: 0; }.status-sub { font-size: 11px; color: var(--text-muted); margin: 0; }
</style>
