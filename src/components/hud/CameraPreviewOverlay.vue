<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Settings, Video } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import { isCameraUnavailableError } from '../../api/camera-recorder'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('CameraPreviewOverlay')

const props = withDefaults(defineProps<{ cameraId: string; shadowSize?: string; cornerRadius?: string; isRecording?: boolean; isHovered?: boolean; theme?: 'light' | 'dark' | 'system'; windowOverlay?: boolean }>(), { shadowSize: 'md', cornerRadius: 'md', isRecording: false, isHovered: false, theme: 'light' })
const emit = defineEmits<{ (event: 'update:shadowSize', value: string): void; (event: 'update:cornerRadius', value: string): void }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const streamError = ref<string | null>(null)
const settingsOpen = ref(false)
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
watch(() => props.isRecording, (recording) => { if (recording) settingsOpen.value = false })
const closeSettingsOnOutsidePointer = (event: PointerEvent) => {
  if (!settingsOpen.value || !(event.target instanceof Element)) return
  if (!event.target.closest('.camera-settings, .settings-button')) settingsOpen.value = false
}
const closeSettingsOnBlur = () => { settingsOpen.value = false }
onMounted(() => {
  // Let the themed skeleton paint before Chromium opens the physical camera.
  initialLoadTimer = window.setTimeout(() => { void loadCamera(props.cameraId) }, 0)
  window.addEventListener('pointerdown', closeSettingsOnOutsidePointer, { capture: true })
  window.addEventListener('blur', closeSettingsOnBlur)
})
onBeforeUnmount(() => {
  cameraRequest += 1
  if (initialLoadTimer !== null) window.clearTimeout(initialLoadTimer)
  stopCameraStream()
  window.removeEventListener('pointerdown', closeSettingsOnOutsidePointer, { capture: true })
  window.removeEventListener('blur', closeSettingsOnBlur)
})


</script>

<template>
  <main v-show="cameraId !== 'off'" class="camera-overlay-container" :data-theme="theme" :class="[`shadow-${shadowSize}`, `radius-${cornerRadius}`, { 'is-recording': isRecording, 'is-hovered': isHovered }]">
    <video ref="videoRef" autoplay muted playsinline class="camera-overlay-video" />
    <div v-if="isLoading" class="camera-overlay-skeleton" :aria-label="t('loadingCameraPreview')"><div /></div>
    <div v-else-if="streamError" class="camera-overlay-error"><Video :size="24" /></div>
    <button v-if="settingsOpen" type="button" class="settings-dismiss-layer" :aria-label="t('closeCameraSettings')" @pointerdown.stop="settingsOpen = false" />
    <button type="button" class="settings-button" :aria-label="t('cameraAppearance')" @pointerdown.stop @click.stop="settingsOpen = !settingsOpen"><Settings :size="17" /></button>
    <section v-if="settingsOpen" class="camera-settings" @pointerdown.stop>
      <span>{{ t('shadow') }}</span><div class="shadow-options"><Button v-for="value in ['none', 'sm', 'md', 'lg']" :key="value" variant="tab" size="sm" :class="{ active: shadowSize === value }" @click="emit('update:shadowSize', value)">{{ t(value) }}</Button></div>
      <span>{{ t('corner') }}</span><div class="corner-options"><Button v-for="value in ['none', 'sm', 'md', 'lg', 'full']" :key="value" variant="tab" size="sm" :class="{ active: cornerRadius === value }" @click="emit('update:cornerRadius', value)">{{ t(value) }}</Button></div>
    </section>
  </main>
</template>

<style scoped>
.camera-overlay-container { position: fixed; inset: 0; overflow: hidden; background: #000; cursor: grab; --radius: 12px; border-radius: var(--radius); isolation: isolate; -webkit-app-region: drag; }
.camera-overlay-video { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; display: block; object-fit: cover; border-radius: var(--radius); }
.camera-overlay-skeleton { position: absolute; inset: 0; z-index: 1; overflow: hidden; background: var(--color-bg-surface); }
.camera-overlay-skeleton div { width: 42%; height: 100%; background: linear-gradient(90deg, transparent, var(--color-bg-surface-hover), transparent); animation: camera-skeleton 1.1s ease-in-out infinite; }
.camera-overlay-error { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; color: var(--text-muted); background: var(--color-bg-surface); }
.settings-dismiss-layer { position: absolute; inset: 0; z-index: 8; border: 0; padding: 0; background: transparent; cursor: default; -webkit-app-region: no-drag; }
.settings-button { position: absolute; top: 8px; right: 8px; z-index: 10; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; color: var(--text-primary); border: 1px solid var(--color-border); border-radius: 50%; background: var(--color-bg-element); box-shadow: var(--shadow-md); cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .15s ease, background .15s ease; -webkit-app-region: no-drag; }
.settings-button:hover { background: var(--color-bg-surface-hover); }
.camera-overlay-container.is-hovered:not(.is-recording) .settings-button, .settings-button:focus-visible { opacity: 1; pointer-events: auto; }
.camera-overlay-container.is-recording .settings-button, .camera-overlay-container.is-recording .camera-settings { display: none; }
.camera-settings { position: absolute; top: 44px; right: 8px; z-index: 11; display: grid; gap: 5px; width: 132px; padding: 9px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-element); color: var(--text-primary); box-shadow: var(--shadow-lg); cursor: default; -webkit-app-region: no-drag; }
.camera-settings span { font-size: 9px; font-weight: 700; color: var(--text-muted); }.camera-settings div { display: grid; gap: 2px; }.shadow-options { grid-template-columns: repeat(4, 1fr); }.corner-options { grid-template-columns: repeat(5, 1fr); }
.camera-settings :deep(.btn-sm) { width: 100%; height: 24px; min-height: 24px; padding: 0; font-size: 9px; }
.radius-none { --radius: 0; }.radius-sm { --radius: 8px; }.radius-md { --radius: 14px; }.radius-lg { --radius: 22px; }.radius-full { --radius: 50%; }
@keyframes camera-skeleton { from { transform: translateX(-130%); } to { transform: translateX(340%); } }
</style>
