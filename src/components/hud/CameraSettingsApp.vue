<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../api/capture'
import Select from '~/ui/select/Select.vue'

const state = ref({ cameraId: 'off', size: 'md', shadowSize: 'lg', cornerRadius: 'lg' })
const options = { size: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }], shadowSize: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }], cornerRadius: [{ value: 'none', label: 'Square' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'full', label: 'Circular' }] }
let unsubscribe: (() => void) | null = null
const update = (key: 'size' | 'shadowSize' | 'cornerRadius', value: string) => { state.value = { ...state.value, [key]: value }; capture.configureCameraOverlay(state.value) }
onMounted(async () => { unsubscribe = capture.onCameraOverlayState((value) => { state.value = value }); const value = await capture.getCameraOverlayState(); if (value) state.value = value })
onBeforeUnmount(() => unsubscribe?.())
</script>
<template><main class="settings"><h2>Camera options</h2><label>Size<Select :model-value="state.size" :options="options.size" @update:model-value="update('size', $event)" /></label><label>Shadow<Select :model-value="state.shadowSize" :options="options.shadowSize" @update:model-value="update('shadowSize', $event)" /></label><label>Corner radius<Select :model-value="state.cornerRadius" :options="options.cornerRadius" @update:model-value="update('cornerRadius', $event)" /></label></main></template>
<style scoped>.settings{width:calc(100vw - 32px);height:calc(100vh - 32px);margin:16px;padding:14px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-bg-surface);color:var(--text-primary);box-shadow:var(--shadow-lg)}h2{margin:0 0 10px;font-size:14px}label{display:grid;gap:4px;margin-top:8px;font-size:12px;font-weight:600}</style>
