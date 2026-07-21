<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../api/capture'
import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

type OverlayState = { cameraId: string; size: string; shadowSize: string; cornerRadius: string }
const state = ref<OverlayState>({ cameraId: 'off', size: 'md', shadowSize: 'lg', cornerRadius: 'lg' })
let unsubscribe: (() => void) | null = null
onMounted(async () => { unsubscribe = capture.onCameraOverlayState((next) => { state.value = next }); const saved = await capture.getCameraOverlayState(); if (saved) state.value = saved })
onBeforeUnmount(() => unsubscribe?.())
const update = (key: 'size' | 'shadowSize' | 'cornerRadius', value: string) => { state.value = { ...state.value, [key]: value }; capture.configureCameraOverlay(state.value) }
</script>

<template>
  <CameraPreviewOverlay :size="state.size" :shadow-size="state.shadowSize" :corner-radius="state.cornerRadius" :camera-id="state.cameraId" window-overlay @update:size="update('size', $event)" @update:shadow-size="update('shadowSize', $event)" @update:corner-radius="update('cornerRadius', $event)" />
</template>

<style scoped>
:global(body) { margin: 0; background: transparent; overflow: hidden; }
</style>
