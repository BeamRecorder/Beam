<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../api/capture'
import { useThemeStore } from '../../stores/theme'
import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

// Instantiate the shared theme store in this separate Electron renderer too.
const theme = useThemeStore()
const state = ref({ cameraId: 'off', shadowSize: 'md', cornerRadius: 'md' })
const isRecording = ref(false)
const isHovered = ref(false)
let unsubscribe: (() => void) | null = null
let unsubscribeHover: (() => void) | null = null
let statusTimer: number | null = null

const refreshRecordingState = async () => {
  try {
    const session = await capture.status()
    isRecording.value = ['recording', 'degraded', 'paused'].includes(session.state)
  } catch {
    isRecording.value = false
  }
}

onMounted(async () => {
  unsubscribe = capture.onCameraOverlayState((next) => { state.value = next })
  unsubscribeHover = capture.onCameraOverlayHover((hovered) => { isHovered.value = hovered })
  const saved = await capture.getCameraOverlayState()
  if (saved) state.value = saved
  await refreshRecordingState()
  statusTimer = window.setInterval(() => { void refreshRecordingState() }, 500)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribeHover?.()
  if (statusTimer !== null) window.clearInterval(statusTimer)
})
</script>

<template><CameraPreviewOverlay :camera-id="state.cameraId" :shadow-size="state.shadowSize" :corner-radius="state.cornerRadius" :is-recording="isRecording" :is-hovered="isHovered" :theme="theme.theme" window-overlay @update:shadow-size="capture.configureCameraOverlay({ ...state, shadowSize: $event })" @update:corner-radius="capture.configureCameraOverlay({ ...state, cornerRadius: $event })" /></template>

<style scoped>:global(html), :global(body) { margin: 0; overflow: hidden; background: transparent; }</style>
