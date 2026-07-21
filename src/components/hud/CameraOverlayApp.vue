<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../api/capture'
import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

const state = ref({ cameraId: 'off', shadowSize: 'md', cornerRadius: 'md' })
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  unsubscribe = capture.onCameraOverlayState((next) => { state.value = next })
  const saved = await capture.getCameraOverlayState()
  if (saved) state.value = saved
})

onBeforeUnmount(() => unsubscribe?.())
</script>

<template><CameraPreviewOverlay :camera-id="state.cameraId" :shadow-size="state.shadowSize" :corner-radius="state.cornerRadius" window-overlay @update:shadow-size="capture.configureCameraOverlay({ ...state, shadowSize: $event })" @update:corner-radius="capture.configureCameraOverlay({ ...state, cornerRadius: $event })" /></template>

<style scoped>:global(html), :global(body) { margin: 0; overflow: hidden; background: transparent; }</style>
