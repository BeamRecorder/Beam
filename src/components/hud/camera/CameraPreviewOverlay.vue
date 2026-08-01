<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Video } from '@lucide/vue'
import { isCameraUnavailableError } from '../../../api/camera-recorder'
import { useTranslate } from '~/i18n/useTranslate'
import { capture } from '../../../api/capture'

const { t } = useTranslate('CameraPreviewOverlay')

const props = withDefaults(
  defineProps<{
    cameraId: string;
    isRecording?: boolean;
    isHovered?: boolean;
    theme?: 'light' | 'dark' | 'system';
    windowOverlay?: boolean;
  }>(),
  { isRecording: false, isHovered: false, theme: 'light' }
)

const videoRef = ref<HTMLVideoElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const streamError = ref<string | null>(null)
const isLoading = ref(false)
let cameraRequest = 0
let initialLoadTimer: number | null = null

const stopCameraStream = () => {
  videoRef.value?.pause()
  if (videoRef.value) videoRef.value.srcObject = null
  cameraStream.value?.getTracks().forEach((track) => track.stop())
  cameraStream.value = null
}

const loadCamera = async (cameraId: string) => {
  const request = ++cameraRequest
  stopCameraStream()
  if (!cameraId || cameraId === 'off') { isLoading.value = false; return }
  try {
    streamError.value = null
    isLoading.value = true
    const deviceId = cameraId.replace('camera:chromium:', '')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { ideal: deviceId } } : true })
    if (request !== cameraRequest) { stream.getTracks().forEach((track) => track.stop()); return }
    cameraStream.value = stream
    if (videoRef.value) { videoRef.value.srcObject = stream; await videoRef.value.play() }
  } catch (error) {
    if (request === cameraRequest) {
      streamError.value = error instanceof Error ? error.message : t('unableToStartCamera')
      if (isCameraUnavailableError(error)) capture.configureCameraOverlay({ cameraId: 'off' })
    }
  } finally {
    if (request === cameraRequest) isLoading.value = false
  }
}

watch(() => props.cameraId, (cameraId) => { void loadCamera(cameraId) })

onMounted(() => {
  initialLoadTimer = window.setTimeout(() => { void loadCamera(props.cameraId) }, 0)
})

onBeforeUnmount(() => {
  cameraRequest += 1
  if (initialLoadTimer !== null) window.clearTimeout(initialLoadTimer)
  stopCameraStream()
})
</script>

<template>
  <main v-show="cameraId !== 'off'" class="camera-overlay-container" :data-theme="theme" :class="{ 'is-recording': isRecording, 'is-hovered': isHovered }">
    <video ref="videoRef" autoplay muted playsinline class="camera-overlay-video" />
    <div v-if="isLoading" class="camera-overlay-skeleton" :aria-label="t('loadingCameraPreview')"><div /></div>
    <div v-else-if="streamError" class="camera-overlay-error"><Video :size="24" /></div>
  </main>
</template>

<style scoped>
.camera-overlay-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  cursor: grab;
  border-radius: 12px;
  isolation: isolate;
  -webkit-app-region: drag;
}
.camera-overlay-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 12px;
}
.camera-overlay-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: var(--color-bg-surface);
}
.camera-overlay-skeleton div {
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--color-bg-surface-hover), transparent);
  animation: camera-skeleton 1.1s ease-in-out infinite;
}
.camera-overlay-error {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  background: var(--color-bg-surface);
}
@keyframes camera-skeleton {
  from { transform: translateX(-130%); }
  to { transform: translateX(340%); }
}
</style>
