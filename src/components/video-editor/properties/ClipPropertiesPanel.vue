<script setup lang="ts">
import { computed } from 'vue'
import BigSlider from '~/ui/slider/BigSlider.vue'
import Button from '~/ui/button/Button.vue'
import Switch from '~/ui/switch/Switch.vue'
import { Unlink, Trash2, Gauge, Clock, Scissors } from '@lucide/vue'

const props = defineProps<{
  selectedClip: {
    id: string
    kind: string
    name?: string
    timelineStartMs: number
    timelineDurationMs: number
    playbackRate?: number
    enabled?: boolean
    isLinked?: boolean
  } | null
}>()

const emit = defineEmits<{
  (e: 'update:playbackRate', rate: number): void
  (e: 'update:enabled', enabled: boolean): void
  (e: 'unlink'): void
  (e: 'delete'): void
  (e: 'split'): void
}>()

const speedPresets = [0.5, 1.0, 1.5, 2.0, 3.0]

const formattedStartTime = computed(() => {
  if (!props.selectedClip) return '0.0s'
  return `${(props.selectedClip.timelineStartMs / 1000).toFixed(2)}s`
})

const formattedDuration = computed(() => {
  if (!props.selectedClip) return '0.0s'
  return `${(props.selectedClip.timelineDurationMs / 1000).toFixed(2)}s`
})

const currentPlaybackRate = computed(() => {
  return Math.round((props.selectedClip?.playbackRate ?? 1.0) * 100) / 100
})
</script>

<template>
  <div class="clip-properties">
    <div v-if="!selectedClip" class="empty-state">
      <div class="empty-icon">🎬</div>
      <p class="empty-title">No clip selected</p>
      <p class="empty-desc">Click a clip on the timeline to inspect and edit its speed, timing, or link settings.</p>
    </div>

    <div v-else class="options-group">
      <div class="clip-header">
        <span class="clip-type-badge">{{ selectedClip.kind.toUpperCase() }}</span>
        <h4 class="clip-name">{{ selectedClip.name || selectedClip.id }}</h4>
      </div>

      <!-- Speed Boost / Rate Controls -->
      <div class="property-card">
        <div class="card-header">
          <Gauge :size="14" class="card-icon" />
          <span class="card-title">Speed Boost</span>
        </div>
        <BigSlider 
          :model-value="currentPlaybackRate" 
          :default-value="1.0"
          :min="0.25" 
          :max="4.0"
          :step="0.05"
          label="Playback Speed"
          :format-value="(val) => `${val.toFixed(2)}×`"
          @update:modelValue="emit('update:playbackRate', $event)"
        />
        <div class="preset-pills">
          <button
            v-for="preset in speedPresets"
            :key="preset"
            type="button"
            class="preset-pill"
            :class="{ active: Math.abs(currentPlaybackRate - preset) < 0.04 }"
            @click="emit('update:playbackRate', preset)"
          >
            {{ preset }}×
          </button>
        </div>
      </div>

      <!-- Clip Timing & Split -->
      <div class="property-card">
        <div class="card-header">
          <Clock :size="14" class="card-icon" />
          <span class="card-title">Timing & Actions</span>
        </div>
        <div class="timing-grid">
          <div class="timing-box">
            <span class="timing-label">Start Time</span>
            <span class="timing-value">{{ formattedStartTime }}</span>
          </div>
          <div class="timing-box">
            <span class="timing-label">Duration</span>
            <span class="timing-value">{{ formattedDuration }}</span>
          </div>
        </div>
        <div class="actions-row">
          <Button 
            variant="secondary" 
            size="sm" 
            :icon="Scissors"
            block
            @click="emit('split')"
          >
            Split at Playhead
          </Button>
        </div>
      </div>

      <!-- Link & Visibility Controls -->
      <div class="property-card">
        <div class="prop-row">
          <span class="prop-label">Enabled</span>
          <Switch 
            :model-value="selectedClip.enabled ?? true" 
            @update:modelValue="emit('update:enabled', $event)"
          />
        </div>

        <div v-if="selectedClip.isLinked" class="prop-row">
          <div class="link-label">
            <Unlink :size="14" />
            <span>Sidecar Link</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            @click="emit('unlink')"
          >
            Unlink
          </Button>
        </div>
      </div>

      <!-- Danger Delete Button -->
      <div class="danger-zone">
        <Button 
          variant="danger" 
          size="sm" 
          :icon="Trash2"
          block
          @click="emit('delete')"
        >
          Delete Clip
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clip-properties {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
  background: var(--color-bg-element);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border-strong);
}

.empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-desc {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.clip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.clip-type-badge {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary);
  letter-spacing: 0.05em;
}

.clip-name {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-card {
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.card-icon {
  color: var(--color-primary);
}

.card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preset-pills {
  display: flex;
  gap: 6px;
}

.preset-pill {
  flex: 1;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--fast) ease;
}

.preset-pill:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.preset-pill.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.timing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.timing-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.timing-label {
  font-size: 9px;
  color: var(--text-muted);
  font-weight: 600;
}

.timing-value {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-primary);
}

.actions-row {
  margin-top: 4px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.prop-label, .link-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.danger-zone {
  margin-top: 4px;
}
</style>
