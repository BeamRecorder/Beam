<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue'
import Input from '~/ui/input/Input.vue'
import Slider from '~/ui/slider/Slider.vue'
import ProgressBar from '~/ui/progressbar/ProgressBar.vue'
import { Captions, Download, Sparkles } from '@lucide/vue'
import type { CaptionCompositionLayer, CompositionMedia, ProjectComposition } from '../composition/composition-types'
import { useWhisperTranscription } from '../captions/useWhisperTranscription'
import { whisperModels, type TranscriptionSource, type WhisperModelId } from '../captions/whisper-types'
import type { ProjectEditorData } from '../../../api/types/capture-api'
import { capture } from '../../../api/capture'

const props = defineProps<{ layer: CaptionCompositionLayer | null; composition: ProjectComposition; editorData?: ProjectEditorData | null }>()
const emit = defineEmits<{ (event: 'update', layer: CaptionCompositionLayer): void }>()
const source = ref<TranscriptionSource>('system'); const model = ref<WhisperModelId>('Xenova/whisper-tiny'); const { progress, transcribe } = useWhisperTranscription()
const modelStates = ref<Record<string, { status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>>({}); const downloadProgress = ref<{ id: string; downloadedBytes: number; totalBytes: number | null } | null>(null); const downloadError = ref<string | null>(null)
const selectedModelState = computed(() => modelStates.value[model.value]); const modelReady = computed(() => selectedModelState.value?.status === 'ready'); const progressPercent = computed(() => downloadProgress.value?.totalBytes ? downloadProgress.value.downloadedBytes / downloadProgress.value.totalBytes * 100 : 0)
const loadModels = async () => { modelStates.value = Object.fromEntries((await capture.whisperModels()).map((item) => [item.id, item])) }
const downloadModel = async () => { downloadError.value = null; try { await capture.downloadWhisperModel(model.value); await loadModels() } catch (error) { downloadError.value = error instanceof Error ? error.message : 'Model download failed.' } }
let unsubscribe: (() => void) | null = null
onMounted(async () => { await loadModels(); unsubscribe = capture.onWhisperProgress((event) => { if (event.id === model.value) downloadProgress.value = event }) })
onBeforeUnmount(() => unsubscribe?.())
const sources = computed(() => {
  const capture = props.editorData?.tracks.flatMap((track) => track.kind === 'system-audio' || track.kind === 'microphone' ? track.assets.filter((asset) => asset.src).map((asset) => ({ id: track.kind as TranscriptionSource, label: track.kind === 'system-audio' ? 'System' : 'Microphone', src: asset.src! })) : []) || []
  const imported = props.composition.media.filter((asset) => asset.kind === 'audio').map((asset: CompositionMedia) => ({ id: `media:${asset.id}` as TranscriptionSource, label: asset.name, src: asset.src }))
  return [...capture, ...imported]
})
const selectedSource = computed(() => sources.value.find((item) => item.id === source.value) || null)
const update = (next: CaptionCompositionLayer) => emit('update', next)
const updateStyle = (key: keyof CaptionCompositionLayer['caption']['style'], value: string | number) => { if (props.layer) update({ ...props.layer, caption: { ...props.layer.caption, style: { ...props.layer.caption.style, [key]: value } } }) }
const updateWord = (sentenceId: string, index: number, key: 'text' | 'startMs' | 'endMs', value: string) => { if (!props.layer) return; const sentences = props.layer.caption.sentences.map((sentence) => sentence.id !== sentenceId ? sentence : (() => { const words = sentence.words.map((word, wordIndex) => wordIndex === index ? { ...word, [key]: key === 'text' ? value : Number(value) } : word); return { ...sentence, words, text: words.map((word) => word.text).join(' '), startMs: words[0]?.startMs || 0, endMs: words.at(-1)?.endMs || 0 } })()); update({ ...props.layer, startMs: sentences[0]?.startMs || props.layer.startMs, endMs: sentences.at(-1)?.endMs || props.layer.endMs, caption: { ...props.layer.caption, sentences } }) }
const run = async () => { if (!props.layer || !selectedSource.value) return; const result = await transcribe(selectedSource.value.src, model.value); update({ ...props.layer, startMs: result.sentences[0]?.startMs || props.layer.startMs, endMs: result.sentences.at(-1)?.endMs || props.layer.endMs, caption: { ...props.layer.caption, sentences: result.sentences } }) }
</script>

<template>
  <div class="caption-panel">
    <template v-if="layer">
      <label>Audio source <select v-model="source"><option v-for="item in sources" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
      <label>Whisper model <select v-model="model"><option v-for="item in whisperModels" :key="item.id" :value="item.id">{{ item.label }} — {{ item.languages }}</option></select></label>
      <p v-if="whisperModels.find(item => item.id === model)?.warning" class="hint">{{ whisperModels.find(item => item.id === model)?.warning }}</p>
      <Button v-if="!modelReady" variant="primary" size="sm" :icon="Download" @click="downloadModel">Download model</Button>
      <ProgressBar v-if="downloadProgress?.id === model" :value="progressPercent" />
      <p v-if="selectedModelState" class="hint">{{ selectedModelState.status === 'ready' ? 'Ready' : 'Not downloaded' }} · {{ Math.round(selectedModelState.downloadedBytes / 1024 / 1024) }} MB</p>
      <p v-if="downloadError" class="error">{{ downloadError }}</p>
      <Button variant="primary" size="sm" :icon="Sparkles" :disabled="!modelReady || !selectedSource || progress.status === 'loading' || progress.status === 'running'" @click="run">{{ progress.status === 'idle' ? 'Transcribe' : progress.message }}</Button>
      <p v-if="progress.status === 'error'" class="error">{{ progress.message }}</p>
      <label>Text color <ColorPicker :model-value="layer.caption.style.color" @update:model-value="updateStyle('color', $event)" /></label>
      <label>Shadow color <ColorPicker :model-value="layer.caption.style.shadowColor" @update:model-value="updateStyle('shadowColor', $event)" /></label>
      <label>Font size <Slider :model-value="layer.caption.style.fontSize" :min="12" :max="120" @update:model-value="updateStyle('fontSize', $event)" /></label>
      <label>Shadow blur <Slider :model-value="layer.caption.style.shadowBlur" :min="0" :max="30" @update:model-value="updateStyle('shadowBlur', $event)" /></label>
      <label>Placement <select :value="layer.caption.style.placement" @change="updateStyle('placement', ($event.target as HTMLSelectElement).value)"><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
      <section v-for="sentence in layer.caption.sentences" :key="sentence.id" class="sentence"><strong>{{ sentence.text }}</strong><div v-for="(word, index) in sentence.words" :key="`${sentence.id}-${index}`" class="word"><Input :model-value="word.text" size="sm" @update:model-value="updateWord(sentence.id, index, 'text', String($event))" /><Input :model-value="word.startMs" type="number" size="sm" @update:model-value="updateWord(sentence.id, index, 'startMs', String($event))" /><Input :model-value="word.endMs" type="number" size="sm" @update:model-value="updateWord(sentence.id, index, 'endMs', String($event))" /></div></section>
    </template>
    <p v-else class="hint"><Captions :size="15" /> Select a caption clip in the timeline.</p>
  </div>
</template>

<style scoped>
.caption-panel { display: flex; flex-direction: column; gap: 12px; }.caption-panel label { display: grid; gap: 5px; color: var(--text-secondary); font-size: 12px; }.caption-panel select { min-height: 30px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--text-primary); background: var(--color-bg-surface); }.hint, .error { margin: 0; color: var(--text-muted); font-size: 12px; }.error { color: var(--color-error); }.sentence { display: grid; gap: 6px; border-top: 1px solid var(--color-border); padding-top: 8px; font-size: 11px; }.word { display: grid; grid-template-columns: 1fr 58px 58px; gap: 4px; }
</style>
