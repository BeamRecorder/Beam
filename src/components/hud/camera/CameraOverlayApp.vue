<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../../api/capture'
import { useThemeStore } from '../../../stores/theme'
import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

const theme = useThemeStore()
const cameraId = ref('off')
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
  unsubscribe = capture.onCameraOverlayState((next) => {
    cameraId.value = next.cameraId
  })
  unsubscribeHover = capture.onCameraOverlayHover((hovered) => {
    isHovered.value = hovered
  })
  const saved = await capture.getCameraOverlayState()
  if (saved) cameraId.value = saved.cameraId
  await refreshRecordingState()
  statusTimer = window.setInterval(() => {
    void refreshRecordingState()
  }, 500)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribeHover?.()
  if (statusTimer !== null) window.clearInterval(statusTimer)
})
</script>

<template>
  <CameraPreviewOverlay
    :camera-id="cameraId"
    :is-recording="isRecording"
    :is-hovered="isHovered"
    :theme="theme.theme"
    window-overlay
  />
</template>

<style scoped>
:global(html),
:global(body) {
  margin: 0;
  overflow: hidden;
  background: transparent;
}
</style>
