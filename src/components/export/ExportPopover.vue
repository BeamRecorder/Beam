<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, X } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Popover from '~/ui/popover/Popover.vue'
import ProgressBar from '~/ui/progressbar/ProgressBar.vue'
import { supportedVideoCodec } from './mediabunny/exporter'
import { useExportJob } from './useExportJob'
import { bitrateFor } from './export-presets'
import type { ExportFormat, ExportPreset, ExportRequest } from './export-types'

const props = defineProps<{ request: Omit<ExportRequest, 'format' | 'preset'> }>()
const format = ref<ExportFormat>('webm')
const preset = ref<ExportPreset>('medium')
const presets: ExportPreset[] = ['low', 'medium', 'high']

const formatDescriptions: Record<ExportFormat, string> = {
  webm: 'Fast export, optimal size and transparency support.',
  mp4: 'Universal compatibility for sharing across platforms.',
}

const getMb = (p: ExportPreset) => {
  const { width, height, fps } = props.request.snapshot.video
  const bps = bitrateFor(p, width, height, fps)
  return (bps / 1_000_000).toFixed(1)
}

const presetDescriptions = computed<Record<ExportPreset, string>>(() => ({
  low: `~${getMb('low')} Mbps · Lower size & clarity.`,
  medium: `~${getMb('medium')} Mbps · Balanced quality (Recommended).`,
  high: `~${getMb('high')} Mbps · Maximum visual fidelity.`,
}))

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
        <div class="field">
          <span class="field-label">Format</span>
          <ButtonGroup>
            <Button
              variant="tab"
              size="sm"
              :class="{ active: format === 'webm' }"
              :disabled="isExporting"
              @click="format = 'webm'"
            >
              WebM
            </Button>
            <Button
              variant="tab"
              size="sm"
              :class="{ active: format === 'mp4' }"
              :disabled="isExporting"
              @click="format = 'mp4'"
            >
              MP4
            </Button>
          </ButtonGroup>
          <span class="option-hint">{{ formatDescriptions[format] }}</span>
        </div>

        <div class="field">
          <span class="field-label">Quality & Bitrate</span>
          <ButtonGroup>
            <Button
              v-for="value in presets"
              :key="value"
              variant="tab"
              size="sm"
              :class="{ active: preset === value }"
              :disabled="isExporting"
              @click="preset = value"
            >
              {{ value }}
            </Button>
          </ButtonGroup>
          <span class="option-hint">{{ presetDescriptions[preset] }}</span>
        </div>

        <div v-if="isExporting && progress" class="job-status" aria-live="polite">
          <span>{{ progress.stage }}</span>
          <ProgressBar :value="percentage" />
          <span>{{ Math.round(percentage) }}%</span>
        </div>
        <p v-if="availability || error" class="error" role="alert">{{ availability || error }}</p>
        <p v-if="result" class="success" role="status">Saved to {{ result.path }}</p>
        <div class="actions">
          <Button v-if="isExporting" variant="ghost" size="sm" block :icon="X" @click="cancel">Cancel</Button>
          <Button v-else variant="primary" size="sm" block :icon="Download" @click="run">Export Video</Button>
        </div>
      </section>
    </template>
  </Popover>
</template>

<style scoped>
.export-popover { width: 300px; padding: 14px; display: grid; gap: 14px; }
.field { display: grid; gap: 6px; }
.field-label { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.option-hint { font-size: 0.7rem; color: var(--text-muted); line-height: 1.35; margin-top: 1px; }
.job-status { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; font-size: .75rem; color: var(--text-muted); text-transform: capitalize; }
.error { color: var(--color-danger, #ef4444); font-size: .75rem; margin: 0; }
.success { color: var(--color-success, #22c55e); font-size: .75rem; margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; width: 100%; margin-top: 4px; }
.export-trigger { -webkit-app-region: no-drag; }
</style>
