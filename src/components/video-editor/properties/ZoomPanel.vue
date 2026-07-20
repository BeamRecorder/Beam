<script setup lang="ts">
import Button from '~/ui/button/Button.vue'
import Input from '~/ui/input/Input.vue'
import { MousePointer, Sparkles, Trash2 } from '@lucide/vue'
import type { ZoomElement } from '../zoom/zoom-types'

const props = defineProps<{
  selectedZoom: ZoomElement | null
  canGenerate: boolean
}>()

const emit = defineEmits<{
  (event: 'update', value: ZoomElement): void
  (event: 'delete'): void
  (event: 'generate'): void
}>()

const updateNumber = (key: 'scale' | 'speed' | 'startMs' | 'endMs', value: string) => {
  if (!props.selectedZoom || !Number.isFinite(Number(value))) return
  emit('update', { ...props.selectedZoom, [key]: Number(value) })
}
</script>

<template>
  <div class="zoom-panel">
    <Button variant="primary" size="sm" :icon="Sparkles" :disabled="!canGenerate" @click="emit('generate')">
      Generate zooms
    </Button>
    <template v-if="selectedZoom">
      <p class="hint"><MousePointer :size="14" /> Drag the target on the canvas to choose the focus.</p>
      <label>Scale
        <Input type="number" :model-value="selectedZoom.scale" min="1" max="3" step="0.05" size="sm" @update:model-value="updateNumber('scale', $event)" />
      </label>
      <label>Speed
        <Input type="number" :model-value="selectedZoom.speed" min="0.5" max="2" step="0.1" size="sm" @update:model-value="updateNumber('speed', $event)" />
      </label>
      <label>Start (ms)
        <Input type="number" :model-value="selectedZoom.startMs" min="0" size="sm" @update:model-value="updateNumber('startMs', $event)" />
      </label>
      <label>End (ms)
        <Input type="number" :model-value="selectedZoom.endMs" min="0" size="sm" @update:model-value="updateNumber('endMs', $event)" />
      </label>
      <Button variant="danger" size="sm" :icon="Trash2" @click="emit('delete')">Delete zoom</Button>
    </template>
    <p v-else class="hint">Select a zoom block in the timeline to edit it.</p>
  </div>
</template>

<style scoped>
.zoom-panel { display: flex; flex-direction: column; gap: 12px; }
label { display: grid; gap: 5px; font-size: 12px; color: var(--text-secondary); }
.hint { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
</style>
