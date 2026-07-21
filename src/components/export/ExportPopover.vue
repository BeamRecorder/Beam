<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, X } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import Popover from '~/ui/popover/Popover.vue'
import ProgressBar from '~/ui/progressbar/ProgressBar.vue'
import { supportedVideoCodec } from './mediabunny/exporter'
import { useExportJob } from './useExportJob'
import type { ExportFormat, ExportPreset, ExportRequest } from './export-types'

const props = defineProps<{ request: Omit<ExportRequest, 'format' | 'preset'> }>()
const format = ref<ExportFormat>('webm')
const preset = ref<ExportPreset>('medium')
const presets: ExportPreset[] = ['low', 'medium', 'high']
const availability = ref<string | null>(null)
const { progress, error, result, isExporting, start, cancel } = useExportJob()
const percentage = computed(() => progress.value ? (progress.value.completed / Math.max(1, progress.value.total)) * 100 : 0)
const run = async () => {
  availability.value = null
  const request = { ...props.request, format: format.value, preset: preset.value }
  if (!await supportedVideoCodec(request)) { availability.value = `${format.value.toUpperCase()} n’est pas pris en charge par l’encodeur de cette machine.`; return }
  await start(request)
}
</script>

<template>
  <Popover align="right" :match-trigger-width="false">
    <template #trigger>
      <Button variant="primary" size="sm" :icon="Download" class="export-trigger">Export Video</Button>
    </template>
    <template #default>
      <section class="export-popover" aria-label="Export video" @click.stop>
        <div class="field"><span>Format</span><div class="choices"><button :class="{ active: format === 'webm' }" :disabled="isExporting" @click="format = 'webm'">WebM <small>Recommended</small></button><button :class="{ active: format === 'mp4' }" :disabled="isExporting" @click="format = 'mp4'">MP4</button></div></div>
        <div class="field"><span>Bitrate</span><div class="choices"><button v-for="value in presets" :key="value" :class="{ active: preset === value }" :disabled="isExporting" @click="preset = value">{{ value }}</button></div></div>
        <div v-if="isExporting && progress" class="job-status" aria-live="polite"><span>{{ progress.stage }}</span><ProgressBar :value="percentage" /><span>{{ Math.round(percentage) }}%</span></div>
        <p v-if="availability || error" class="error" role="alert">{{ availability || error }}</p>
        <p v-if="result" class="success" role="status">Saved to {{ result.path }}</p>
        <div class="actions"><Button v-if="isExporting" variant="ghost" size="sm" :icon="X" @click="cancel">Cancel</Button><Button v-else variant="primary" size="sm" :icon="Download" @click="run">Export</Button></div>
      </section>
    </template>
  </Popover>
</template>

<style scoped>
.export-popover { width: 292px; padding: 14px; display: grid; gap: 14px; }
.field { display: grid; gap: 7px; font-size: 0.78rem; color: var(--text-muted); }
.choices { display: flex; gap: 6px; }
.choices button { border: 1px solid var(--color-border); background: var(--color-bg-surface); color: var(--text-primary); border-radius: var(--radius-sm); padding: 6px 8px; cursor: pointer; font: inherit; text-transform: capitalize; }
.choices button.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 16%, var(--color-bg-surface)); }
.choices button:disabled { cursor: not-allowed; opacity: .55; }.choices small { display: block; font-size: .62rem; color: var(--text-muted); }
.job-status { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; font-size: .75rem; color: var(--text-muted); text-transform: capitalize; }.error { color: var(--color-danger, #ef4444); font-size: .75rem; margin: 0; }.success { color: var(--color-success, #22c55e); font-size: .75rem; margin: 0; overflow-wrap: anywhere; }.actions { display: flex; justify-content: flex-end; }.export-trigger { -webkit-app-region: no-drag; }
</style>
