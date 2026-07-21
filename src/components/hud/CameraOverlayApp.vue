<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../api/capture'
import CameraPreviewOverlay from './CameraPreviewOverlay.vue'

type OverlayState = { cameraId: string; size: string; shadowSize: string; cornerRadius: string }
const state = ref<OverlayState>({ cameraId: 'off', size: 'md', shadowSize: 'lg', cornerRadius: 'lg' })
const preview = ref<InstanceType<typeof CameraPreviewOverlay> | null>(null)
let unsubscribe: (() => void) | null = null
let lastInteractive: boolean | null = null
const INTERACTIVE_SELECTOR = '.camera-overlay-container, .popover-content, button, input, [role="button"]'
const updateMousePassThrough = (event: MouseEvent) => {
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const interactive = Boolean(element?.closest(INTERACTIVE_SELECTOR))
  if (interactive === lastInteractive) return
  lastInteractive = interactive
  capture.setCameraOverlayInteractive(interactive)
}
const disableMousePassThrough = () => { if (lastInteractive !== false) { lastInteractive = false; capture.setCameraOverlayInteractive(false) } }
const SIZES: Record<string, [number, number]> = { sm: [120, 90], md: [160, 120], lg: [220, 165], xl: [300, 225] }
const syncPreviewWindow = async () => {
  await nextTick()
  const [w, h] = SIZES[state.value.size] || SIZES.md
  await window.capture?.resizeCameraOverlay({
    width: w + 64,
    height: h + 64,
    popoverOpen: Boolean(preview.value?.isPopoverOpen),
  })
}
onMounted(async () => { window.addEventListener('mousemove', updateMousePassThrough, { passive: true }); window.addEventListener('mouseleave', disableMousePassThrough); disableMousePassThrough(); unsubscribe = capture.onCameraOverlayState((next) => { state.value = next; void syncPreviewWindow() }); const saved = await capture.getCameraOverlayState(); if (saved) { state.value = saved; void syncPreviewWindow() } })
onBeforeUnmount(() => { window.removeEventListener('mousemove', updateMousePassThrough); window.removeEventListener('mouseleave', disableMousePassThrough); unsubscribe?.() })
const update = (key: 'size' | 'shadowSize' | 'cornerRadius', value: string) => { state.value = { ...state.value, [key]: value }; capture.configureCameraOverlay(state.value); void syncPreviewWindow() }
</script>

<template>
  <CameraPreviewOverlay ref="preview" :size="state.size" :shadow-size="state.shadowSize" :corner-radius="state.cornerRadius" :camera-id="state.cameraId" window-overlay @update:size="update('size', $event)" @update:shadow-size="update('shadowSize', $event)" @update:corner-radius="update('cornerRadius', $event)" />
</template>

<style scoped>
:global(body) { margin: 0; background: transparent; overflow: hidden; }
</style>
