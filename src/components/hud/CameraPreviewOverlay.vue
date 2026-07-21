<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Settings, Video } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'

const props = withDefaults(defineProps<{ cameraId: string; shadowSize?: string; cornerRadius?: string; windowOverlay?: boolean }>(), { shadowSize: 'md', cornerRadius: 'md' })
const emit = defineEmits<{ (event: 'update:shadowSize', value: string): void; (event: 'update:cornerRadius', value: string): void }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const streamError = ref<string | null>(null)
const settingsOpen = ref(false)

const stopCameraStream = () => {
  videoRef.value?.pause()
  if (videoRef.value) videoRef.value.srcObject = null
  cameraStream.value?.getTracks().forEach((track) => track.stop())
  cameraStream.value = null
}

const loadCamera = async (cameraId: string) => {
  stopCameraStream()
  if (!cameraId || cameraId === 'off') return
  try {
    streamError.value = null
    const deviceId = cameraId.replace('camera:chromium:', '')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { ideal: deviceId } } : true })
    cameraStream.value = stream
    if (videoRef.value) { videoRef.value.srcObject = stream; await videoRef.value.play() }
  } catch (error) {
    streamError.value = error instanceof Error ? error.message : 'Unable to start the camera.'
  }
}

watch(() => props.cameraId, (cameraId) => { void loadCamera(cameraId) }, { immediate: true })
const closeSettingsOnOutsidePointer = (event: PointerEvent) => {
  if (!settingsOpen.value || !(event.target instanceof Element)) return
  if (!event.target.closest('.camera-settings, .settings-button')) settingsOpen.value = false
}
const closeSettingsOnBlur = () => { settingsOpen.value = false }
onMounted(() => {
  window.addEventListener('pointerdown', closeSettingsOnOutsidePointer, { capture: true })
  window.addEventListener('blur', closeSettingsOnBlur)
})
onBeforeUnmount(() => {
  stopCameraStream()
  window.removeEventListener('pointerdown', closeSettingsOnOutsidePointer, { capture: true })
  window.removeEventListener('blur', closeSettingsOnBlur)
})


</script>

<template>
  <main v-show="cameraId !== 'off'" class="camera-overlay-container" :class="[`shadow-${shadowSize}`, `radius-${cornerRadius}`]">
    <video ref="videoRef" autoplay muted playsinline class="camera-overlay-video" />
    <div v-if="streamError" class="camera-overlay-error"><Video :size="24" /></div>
    <button type="button" class="settings-button" aria-label="Camera appearance" @pointerdown.stop @click.stop="settingsOpen = !settingsOpen"><Settings :size="17" /></button>
    <section v-if="settingsOpen" class="camera-settings" @pointerdown.stop>
      <span>Shadow</span><div class="shadow-options"><Button v-for="value in ['none', 'sm', 'md', 'lg']" :key="value" variant="tab" size="sm" :class="{ active: shadowSize === value }" @click="emit('update:shadowSize', value)">{{ value }}</Button></div>
      <span>Corner</span><div class="corner-options"><Button v-for="value in ['none', 'sm', 'md', 'lg', 'full']" :key="value" variant="tab" size="sm" :class="{ active: cornerRadius === value }" @click="emit('update:cornerRadius', value)">{{ value }}</Button></div>
    </section>
  </main>
</template>

<style scoped>
.camera-overlay-container { position: fixed; inset: 0; overflow: hidden; background: #000; cursor: grab; --radius: 12px; border-radius: var(--radius); isolation: isolate; -webkit-app-region: drag; }
.camera-overlay-video { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; display: block; object-fit: cover; border-radius: var(--radius); }
.camera-overlay-error { position: absolute; inset: 0; z-index: 1; display: grid; place-items: center; color: var(--text-muted); background: rgba(0, 0, 0, .7); }
.settings-button { position: absolute; top: 8px; right: 8px; z-index: 10; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; color: white; border: 1px solid rgba(255, 255, 255, .5); border-radius: 50%; background: rgba(0, 0, 0, .75); cursor: pointer; opacity: 0; transition: opacity .15s ease; -webkit-app-region: no-drag; }
.camera-overlay-container:hover .settings-button, .settings-button:focus-visible { opacity: 1; }
.camera-settings { position: absolute; top: 44px; right: 8px; z-index: 11; display: grid; gap: 5px; width: 132px; padding: 9px; border-radius: var(--radius-sm); background: rgba(20, 20, 24, .96); color: white; box-shadow: var(--shadow-lg); cursor: default; -webkit-app-region: no-drag; }
.camera-settings span { font-size: 9px; font-weight: 700; color: var(--text-muted); }.camera-settings div { display: grid; gap: 2px; }.shadow-options { grid-template-columns: repeat(4, 1fr); }.corner-options { grid-template-columns: repeat(5, 1fr); }
.camera-settings :deep(.btn-sm) { width: 100%; height: 24px; min-height: 24px; padding: 0; font-size: 9px; }
.radius-none { --radius: 0; }.radius-sm { --radius: 8px; }.radius-md { --radius: 14px; }.radius-lg { --radius: 22px; }.radius-full { --radius: 50%; }
</style>
