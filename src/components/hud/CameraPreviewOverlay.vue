<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import Popover from '~/ui/popover/Popover.vue'
import Button from '~/ui/button/Button.vue'
import Select from '~/ui/select/Select.vue'
import { MoreVertical, Video } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    cameraId: string
    shadowSize?: string
    cornerRadius?: string
    size?: string
  }>(),
  {
    shadowSize: 'lg',
    cornerRadius: 'lg',
    size: 'md',
  }
)

const emit = defineEmits<{
  (e: 'update:shadowSize', value: string): void
  (e: 'update:cornerRadius', value: string): void
  (e: 'update:size', value: string): void
  (e: 'toggle-popover', isOpen: boolean): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const isHovered = ref(false)
const isPopoverOpen = ref(false)
const streamError = ref<string | null>(null)

const handlePopoverToggle = (isOpen: boolean) => {
  isPopoverOpen.value = isOpen
  emit('toggle-popover', isOpen)
}

// Dragging position state
const STORAGE_KEY_POS = 'demorecorder_hud_camera_pos'
const savedPos = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
})()

const defaultRightX = Math.max(16, window.innerWidth - 180)
const posX = ref(savedPos?.x ?? defaultRightX)
const posY = ref(savedPos?.y ?? 24)
const isDragging = ref(false)
const dragStart = { x: 0, y: 0 }
const initialPos = { x: 0, y: 0 }

watch([posX, posY], () => {
  try {
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ x: posX.value, y: posY.value }))
  } catch (err) {
    console.error('Failed to save camera position:', err)
  }
})

// Presets options for Popover
const sizeOptions = [
  { value: 'sm', label: 'Small (120×90)' },
  { value: 'md', label: 'Medium (160×120)' },
  { value: 'lg', label: 'Large (220×165)' },
  { value: 'xl', label: 'Extra Large (300×225)' },
]

const shadowOptions = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
]

const cornerOptions = [
  { value: 'none', label: 'Square (0px)' },
  { value: 'sm', label: 'Small (8px)' },
  { value: 'md', label: 'Medium (16px)' },
  { value: 'lg', label: 'Large (24px)' },
  { value: 'full', label: 'Circular' },
]

const sizeClassMap: Record<string, string> = {
  sm: 'size-sm',
  md: 'size-md',
  lg: 'size-lg',
  xl: 'size-xl',
}

const shadowClassMap: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
}

const cornerClassMap: Record<string, string> = {
  none: 'radius-none',
  sm: 'radius-sm',
  md: 'radius-md',
  lg: 'radius-lg',
  full: 'radius-full',
}

const previewClasses = computed(() => [
  sizeClassMap[props.size] || 'size-md',
  shadowClassMap[props.shadowSize] || 'shadow-lg',
  cornerClassMap[props.cornerRadius] || 'radius-lg',
])

const setupCameraStream = async (deviceIdStr: string) => {
  stopCameraStream()
  if (!deviceIdStr || deviceIdStr === 'off') return

  try {
    streamError.value = null
    const cleanDeviceId = deviceIdStr.replace('camera:chromium:', '')
    
    let videoConstraint: boolean | MediaTrackConstraints = true
    if (cleanDeviceId) {
      videoConstraint = {
        deviceId: { ideal: cleanDeviceId },
      }
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraint,
      })
    } catch {
      // Fallback to any available video stream if exact constraint fails
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      })
    }

    cameraStream.value = stream
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      videoRef.value.load()
      await videoRef.value.play().catch(() => undefined)
    }
  } catch (err) {
    console.error('Failed to initialize live camera overlay stream:', err)
    streamError.value = err instanceof Error ? err.message : String(err)
  }
}

watch(videoRef, (el) => {
  if (el && cameraStream.value) {
    el.srcObject = cameraStream.value
    void el.play().catch(() => undefined)
  }
})

const stopCameraStream = () => {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.srcObject = null
  }
  if (cameraStream.value) {
    const tracks = cameraStream.value.getTracks()
    tracks.forEach((track) => {
      track.stop()
      cameraStream.value?.removeTrack(track)
    })
    cameraStream.value = null
  }
}

watch(
  () => props.cameraId,
  (newId) => {
    if (!newId || newId === 'off') {
      stopCameraStream()
    } else {
      void setupCameraStream(newId)
    }
  },
  { immediate: true }
)

const handleMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.popover-container')) return

  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  initialPos.x = posX.value
  initialPos.y = posY.value

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  posX.value = Math.max(0, Math.min(window.innerWidth - 140, initialPos.x + dx))
  posY.value = Math.max(0, Math.min(window.innerHeight - 100, initialPos.y + dy))
}

const handleMouseUp = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}

onMounted(() => {
  if (props.cameraId && props.cameraId !== 'off') {
    void setupCameraStream(props.cameraId)
  }
})

onBeforeUnmount(() => {
  stopCameraStream()
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <div
    v-show="cameraId !== 'off'"
    class="camera-overlay-container"
    :class="previewClasses"
    :style="{ top: `${posY}px`, left: `${posX}px` }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @mousedown="handleMouseDown"
  >
    <video
      ref="videoRef"
      autoplay
      muted
      playsinline
      class="camera-overlay-video"
    />

    <div v-if="streamError" class="camera-overlay-error">
      <Video class="error-icon" />
    </div>

    <!-- Hover 'More' Button triggering settings popover -->
    <Transition name="fade">
      <div v-if="isHovered || isDragging || isPopoverOpen" class="camera-overlay-more">
        <Popover
          align="right"
          direction="down"
          :match-trigger-width="false"
          @toggle="handlePopoverToggle"
        >
          <template #trigger="{ isOpen }">
            <Button
              variant="ghost"
              size="sm"
              icon-only
              :icon="MoreVertical"
              class="more-btn"
              :class="{ 'is-open': isOpen }"
            />
          </template>
          <template #default>
            <div class="camera-settings-popover">
              <h4 class="popover-title">Camera Options</h4>
              
              <div class="setting-field">
                <label class="setting-label">Camera Size</label>
                <Select
                  :model-value="size"
                  :options="sizeOptions"
                  @update:model-value="emit('update:size', $event)"
                  @toggle="handlePopoverToggle"
                />
              </div>

              <div class="setting-field">
                <label class="setting-label">Shadow Size</label>
                <Select
                  :model-value="shadowSize"
                  :options="shadowOptions"
                  @update:model-value="emit('update:shadowSize', $event)"
                  @toggle="handlePopoverToggle"
                />
              </div>

              <div class="setting-field">
                <label class="setting-label">Corner Radius</label>
                <Select
                  :model-value="cornerRadius"
                  :options="cornerOptions"
                  @update:model-value="emit('update:cornerRadius', $event)"
                  @toggle="handlePopoverToggle"
                />
              </div>
            </div>
          </template>
        </Popover>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.camera-overlay-container {
  position: fixed;
  z-index: 9999;
  cursor: grab;
  user-select: none;
  overflow: hidden !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--color-bg-dark, #000);
  transition: width 0.2s ease, height 0.2s ease, box-shadow 0.2s ease, border-radius 0.2s ease;
  isolation: isolate;
}

.camera-overlay-container.size-sm {
  width: 120px;
  height: 90px;
}
.camera-overlay-container.size-md {
  width: 160px;
  height: 120px;
}
.camera-overlay-container.size-lg {
  width: 220px;
  height: 165px;
}
.camera-overlay-container.size-xl {
  width: 300px;
  height: 225px;
}

.camera-overlay-container:active {
  cursor: grabbing;
}

.camera-overlay-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
  overflow: hidden;
}

.camera-overlay-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text-muted);
}

.error-icon {
  width: 24px;
  height: 24px;
}

/* Hover More trigger button */
.camera-overlay-more {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
}

.more-btn {
  width: 26px !important;
  height: 26px !important;
  min-width: 26px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: rgba(0, 0, 0, 0.6) !important;
  color: #fff !important;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.more-btn:hover,
.more-btn.is-open {
  background: rgba(0, 0, 0, 0.85) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
}

/* Shadow variants */
.shadow-none {
  box-shadow: none;
}
.shadow-sm {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.shadow-md {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.shadow-lg {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.shadow-xl {
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65);
}

/* Corner radius variants */
.radius-none {
  border-radius: 0px;
}
.radius-sm {
  border-radius: 8px;
}
.radius-md {
  border-radius: 14px;
}
.radius-lg {
  border-radius: 20px;
}
.radius-full {
  border-radius: 50%;
  aspect-ratio: 1 / 1;
}

/* Popover Content */
.camera-settings-popover {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 170px;
}

.popover-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin: 0;
}

.setting-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
