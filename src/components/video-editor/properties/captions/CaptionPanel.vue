<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import ProgressBar from '~/ui/progressbar/ProgressBar.vue'
import Select from '~/ui/select/Select.vue'
import { Sparkles, Download, RefreshCw, CheckCircle } from '@lucide/vue'
import type { CaptionCompositionLayer, CompositionMedia, ProjectComposition } from '../../composition/composition-types'
import { useWhisperTranscription } from '../../captions/useWhisperTranscription'
import { whisperModels, type TranscriptionSource, type WhisperModelId } from '../../captions/whisper-types'
import type { ProjectEditorData } from '../../../../api/types/capture-api'
import { capture } from '../../../../api/capture'

const props = defineProps<{
  composition: ProjectComposition;
  editorData?: ProjectEditorData | null;
}>()

const emit = defineEmits<{
  (event: 'update:composition', composition: ProjectComposition): void;
  (event: 'select-caption', layerId: string): void;
}>()

const source = ref<TranscriptionSource>('system')
const model = ref<WhisperModelId>('Xenova/whisper-tiny')
const { progress, transcribe } = useWhisperTranscription()
const modelStates = ref<Record<string, { status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>>({})
const downloadProgress = ref<{ id: string; downloadedBytes: number; totalBytes: number | null } | null>(null)
const downloadError = ref<string | null>(null)

const selectedModelState = computed(() => modelStates.value[model.value])
const modelReady = computed(() => selectedModelState.value?.status === 'ready')
const progressPercent = computed(() => downloadProgress.value?.totalBytes ? (downloadProgress.value.downloadedBytes / downloadProgress.value.totalBytes) * 100 : 0)

const aiCaptionLayers = computed(() =>
  props.composition.layers.filter((l): l is CaptionCompositionLayer => l.kind === 'caption' && !!l.isAiGenerated)
)
const hasAiCaptions = computed(() => aiCaptionLayers.value.length > 0)

const loadModels = async () => {
  modelStates.value = Object.fromEntries((await capture.whisperModels()).map((item) => [item.id, item]))
}

const downloadModel = async () => {
  downloadError.value = null
  try {
    await capture.downloadWhisperModel(model.value)
    await loadModels()
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : 'Model download failed.'
  }
}

let unsubscribe: (() => void) | null = null
onMounted(async () => {
  await loadModels()
  unsubscribe = capture.onWhisperProgress((event) => {
    if (event.id === model.value) downloadProgress.value = event
  })
})
onBeforeUnmount(() => unsubscribe?.())

const sources = computed(() => {
  const captureSources = props.editorData?.tracks.flatMap((track) =>
    track.kind === 'system-audio' || track.kind === 'microphone'
      ? track.assets.filter((asset) => asset.src).map((asset) => ({
          id: track.kind as TranscriptionSource,
          label: track.kind === 'system-audio' ? 'System Audio' : 'Microphone',
          src: asset.src!
        }))
      : []
  ) || []
  const importedSources = props.composition.media
    .filter((asset) => asset.kind === 'audio')
    .map((asset: CompositionMedia) => ({
      id: `media:${asset.id}` as TranscriptionSource,
      label: asset.name,
      src: asset.src
    }))
  return [...captureSources, ...importedSources]
})

const selectedSource = computed(() => sources.value.find((item) => item.id === source.value) || null)

const modelSelectItems = computed(() =>
  whisperModels.map((m) => ({
    value: m.id,
    label: `${m.label} (${m.languages})`,
  }))
)

const sourceSelectItems = computed(() =>
  sources.value.map((s) => ({
    value: s.id,
    label: s.label,
  }))
)

const runTranscription = async () => {
  if (!selectedSource.value) return
  const result = await transcribe(selectedSource.value.src, model.value)
  if (!result.sentences.length) return

  // Remove previous AI-generated caption layers
  const existingNonAiLayers = props.composition.layers.filter(
    (l) => l.kind !== 'caption' || !l.isAiGenerated
  )

  const newLayer: CaptionCompositionLayer = {
    id: crypto.randomUUID(),
    kind: 'caption',
    name: 'AI Captions',
    startMs: result.sentences[0]?.startMs || 0,
    endMs: result.sentences.at(-1)?.endMs || 5000,
    enabled: true,
    order: existingNonAiLayers.length,
    isAiGenerated: true,
    caption: {
      sentences: result.sentences,
      style: {
        color: '#ffffff',
        fontSize: 36,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
        shadowDirection: 'bottom-right',
        placement: 'bottom',
      },
    },
  }

  const updatedComp: ProjectComposition = {
    ...props.composition,
    layers: [...existingNonAiLayers, newLayer],
  }

  emit('update:composition', updatedComp)
  emit('select-caption', newLayer.id)
}
</script>

<template>
  <div class="caption-sidebar-panel">
    <div class="header-card">
      <div class="header-icon-wrap">
        <Sparkles :size="20" class="sparkles-icon" />
      </div>
      <div>
        <h3 class="header-title">AI Auto-Captioning</h3>
        <p class="header-desc">Generate automatic speech-to-text subtitles powered by Whisper AI.</p>
      </div>
    </div>

    <!-- Configuration Box -->
    <div class="config-card">
      <div class="field-group" v-if="sources.length">
        <label class="field-label">Audio Source</label>
        <Select
          :items="sourceSelectItems"
          :model-value="source"
          size="sm"
          @update:model-value="source = $event as TranscriptionSource"
        />
      </div>

      <div class="field-group">
        <label class="field-label">Whisper Model</label>
        <Select
          :items="modelSelectItems"
          :model-value="model"
          size="sm"
          @update:model-value="model = $event as WhisperModelId"
        />
      </div>

      <Button
        v-if="!modelReady"
        variant="secondary"
        size="sm"
        :icon="Download"
        @click="downloadModel"
        block
      >
        Download Model
      </Button>

      <ProgressBar v-if="downloadProgress?.id === model" :value="progressPercent" />
      <p v-if="downloadError" class="error-text">{{ downloadError }}</p>

      <Button
        variant="primary"
        size="md"
        :icon="hasAiCaptions ? RefreshCw : Sparkles"
        :disabled="!modelReady || !selectedSource || progress.status === 'loading' || progress.status === 'running'"
        @click="runTranscription"
        block
        class="generate-btn"
      >
        {{ progress.status === 'idle' ? (hasAiCaptions ? 'Regenerate AI Captions' : 'Generate Captions') : progress.message }}
      </Button>
    </div>

    <!-- Active AI Captions Banner -->
    <div v-if="hasAiCaptions" class="active-status-card">
      <CheckCircle :size="16" class="status-icon" />
      <div class="status-content">
        <p class="status-title">AI Captions Active</p>
        <p class="status-sub">{{ aiCaptionLayers.length }} subtitle track(s) generated.</p>
      </div>
      <Button
        variant="ghost"
        size="xs"
        @click="emit('select-caption', aiCaptionLayers[0].id)"
      >
        Edit
      </Button>
    </div>
  </div>
</template>

<style scoped>
.caption-sidebar-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.header-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
}

.header-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: rgba(99, 102, 241, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sparkles-icon {
  color: var(--color-primary);
}

.header-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px 0;
}

.header-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.config-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.generate-btn {
  margin-top: 4px;
}

.error-text {
  color: var(--color-error, #ef4444);
  font-size: 11px;
  margin: 0;
}

.active-status-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: var(--radius-md);
  padding: 12px;
}

.status-icon {
  color: #10b981;
}

.status-content {
  flex: 1;
}

.status-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.status-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}
</style>
