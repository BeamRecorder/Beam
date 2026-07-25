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

const formatMs = (ms: number) => {
  const totalSeconds = Math.max(0, ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  const millis = Math.floor((totalSeconds % 1) * 10)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}s`
}
</script>

<template>
  <Popover align="right" :match-trigger-width="false">
    <template #trigger>
      <Button variant="primary" size="xs" :icon="Download" class="export-trigger">
        {{ isExporting ? `${Math.round(percentage)}%` : 'Export Video' }}
      </Button>
    </template>
    <template #default>
      <section class="export-popover" aria-label="Export video" @click.stop>
        <!-- Active Exporting Progress Card -->
        <div v-if="isExporting" class="export-progress-card">
          <div class="progress-header">
            <span class="stage-title">{{ progress?.stageLabel || 'Exporting Video...' }}</span>
            <span class="percentage-badge">{{ Math.round(percentage) }}%</span>
          </div>

          <ProgressBar :value="percentage" class="main-progress-bar" />

          <div class="progress-details">
            <span class="detail-item">Frame {{ progress?.completed ?? 0 }} / {{ progress?.total ?? 0 }}</span>
            <span class="detail-item time-item">{{ formatMs(progress?.currentTimeMs ?? 0) }} / {{ formatMs(progress?.totalTimeMs ?? 0) }}</span>
          </div>

          <div class="actions">
            <Button variant="ghost" size="sm" block :icon="X" @click="cancel">Cancel Export</Button>
          </div>
        </div>

        <!-- Configuration Form (When not exporting) -->
        <template v-else>
          <div class="field">
            <span class="field-label">Format</span>
            <ButtonGroup full>
              <Button
                variant="tab"
                size="sm"
                block
                :class="{ active: format === 'webm' }"
                @click="format = 'webm'"
              >
                WebM
              </Button>
              <Button
                variant="tab"
                size="sm"
                block
                :class="{ active: format === 'mp4' }"
                @click="format = 'mp4'"
              >
                MP4
              </Button>
            </ButtonGroup>
            <span class="option-hint">{{ formatDescriptions[format] }}</span>
          </div>

          <div class="field">
            <span class="field-label">Quality & Bitrate</span>
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

          <p v-if="availability || error" class="error" role="alert">{{ availability || error }}</p>
          <p v-if="result" class="success" role="status">Saved to {{ result.path }}</p>
          <div class="actions">
            <Button variant="primary" size="sm" block :icon="Download" @click="run">Export Video</Button>
          </div>
        </template>
      </section>
    </template>
  </Popover>
</template>

<style scoped>
.export-popover { width: 320px; padding: 16px; display: grid; gap: 14px; }
.field { display: grid; gap: 6px; width: 100%; }
.field :deep(.btn-group) { width: 100% !important; box-sizing: border-box; }
.field :deep(.btn-group .btn-container) { flex: 1 !important; display: flex !important; min-width: 0 !important; }
.field :deep(.btn-group .btn) { width: 100% !important; justify-content: center !important; }
.field-label { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.option-hint { font-size: 0.7rem; color: var(--text-muted); line-height: 1.35; margin-top: 1px; }
.job-status { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; font-size: .75rem; color: var(--text-muted); text-transform: capitalize; }
.error { color: var(--color-danger, #ef4444); font-size: .75rem; margin: 0; }
.success { color: var(--color-success, #22c55e); font-size: .75rem; margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; width: 100%; margin-top: 4px; }
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

.stage-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.percentage-badge {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-primary);
}

.progress-details {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-muted);
}

:deep(.export-trigger) {
  -webkit-app-region: no-drag;
  height: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  display: inline-flex !important;
  align-items: center !important;
}
</style>
