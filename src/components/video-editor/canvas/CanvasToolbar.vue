<script setup lang="ts">
import { computed } from 'vue'
import { Crop } from '@lucide/vue'
import PopoverMenuButton from '../../ui/popover/PopoverMenuButton.vue'
import type { OutputCanvasPreset } from './output-canvas'

const props = defineProps<{ preset: OutputCanvasPreset; canCrop: boolean; isCropping: boolean }>()
const emit = defineEmits<{ (event: 'select:preset', preset: Exclude<OutputCanvasPreset, 'custom'>): void; (event: 'toggle:crop'): void }>()
const presets: Exclude<OutputCanvasPreset, 'custom'>[] = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9']
const items = computed(() => presets.map((id) => ({ id, label: id, active: props.preset === id })))
</script>

<template>
  <div class="canvas-toolbar">
    <PopoverMenuButton :label="preset" :aria-label="`Format ${preset}`" :items="items" @select="emit('select:preset', $event as Exclude<OutputCanvasPreset, 'custom'>)" />
    <button class="crop-button" :class="{ active: isCropping }" :disabled="!canCrop" type="button" title="Recadrer l’élément sélectionné" @click="emit('toggle:crop')"><Crop /><span>Recadrer</span></button>
  </div>
</template>

<style scoped>
.canvas-toolbar { height:44px; flex:none; display:flex; align-items:center; justify-content:center; gap:8px; padding:6px 12px; border-bottom:1px solid var(--color-border); background:var(--color-bg-element); }.crop-button { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-surface); color:var(--text-primary); font:600 12px var(--font-sans); cursor:pointer; }.crop-button svg { width:14px; height:14px; }.crop-button:hover:not(:disabled),.crop-button.active { background:var(--color-primary-light); border-color:var(--color-primary); color:var(--color-primary); }.crop-button:disabled { opacity:.5; cursor:not-allowed; }
</style>
