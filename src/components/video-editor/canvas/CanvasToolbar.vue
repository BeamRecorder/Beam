<script setup lang="ts">
import { computed } from 'vue'
import { Crop } from '@lucide/vue'
import PopoverMenuButton from '../../ui/popover/PopoverMenuButton.vue'
import Button from '../../ui/button/Button.vue'
import type { OutputCanvasPreset } from './output-canvas'

const props = defineProps<{ preset: OutputCanvasPreset; canCrop: boolean; isCropping: boolean }>()
const emit = defineEmits<{ (event: 'select:preset', preset: Exclude<OutputCanvasPreset, 'custom'>): void; (event: 'toggle:crop'): void }>()
const presets: Exclude<OutputCanvasPreset, 'custom'>[] = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9']
const items = computed(() => presets.map((id) => ({ id, label: id, active: props.preset === id })))
</script>

<template>
  <div class="canvas-toolbar">
    <PopoverMenuButton transparent :label="preset" :aria-label="`Format ${preset}`" :items="items" @select="emit('select:preset', $event as Exclude<OutputCanvasPreset, 'custom'>)" />
    <Button class="crop-button" variant="outline" size="xs" :icon="Crop" :disabled="!canCrop" :tooltip="canCrop ? 'Crop selected clip' : 'Select a clip to crop it'" @click="emit('toggle:crop')">Recadrer</Button>
  </div>
</template>

<style scoped>
.canvas-toolbar { position:relative; z-index:3; height:44px; flex:none; display:flex; align-items:center; justify-content:center; gap:8px; padding:6px 12px; background:transparent; }.crop-button { height:28px; padding:0 10px; background:transparent; box-shadow:var(--shadow-sm); }.crop-button:hover:not(:disabled) { background:var(--color-primary-light); border-color:var(--color-primary); color:var(--color-primary); }
</style>
