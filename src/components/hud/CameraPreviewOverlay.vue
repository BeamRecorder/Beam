<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
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
    windowOverlay?: boolean
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
const previewRef = ref<HTMLElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const isHovered = ref(false)
const isPopoverOpen = ref(false)
const streamError = ref<string | null>(null)
const overlayOffset = ref({ x: 0, y: 0 })

const syncNativeWindowSize = async () => {
  if (!props.windowOverlay) return
  await nextTick()
  const bounds = previewRef.value?.getBoundingClientRect()
  if (!bounds) return
  await window.capture?.resizeCameraOverlay({
    width: Math.ceil(bounds.width) + 64,
    height: Math.ceil(bounds.height) + 64,
    popoverOpen: false,
  })
}

defineExpose({ syncNativeWindowSize, isPopoverOpen })

const handlePopoverToggle = async (isOpen: boolean) => {
  if (!isOpen) isPopoverOpen.value = false
  if (props.windowOverlay) {
    const contentWidth = ({ sm: 120, md: 160, lg: 220, xl: 300 }[props.size] || 160)
    const contentHeight = ({ sm: 90, md: 120, lg: 165, xl: 225 }[props.size] || 120)
    const offset = await window.capture?.resizeCameraOverlay({
      width: isOpen ? 390 : contentWidth + 64,
      height: isOpen ? Math.max(contentHeight + 64, 300) : contentHeight + 64,
      popoverOpen: isOpen,
    })
    overlayOffset.value = offset || { x: 0, y: 0 }
    if (isOpen) {
      isPopoverOpen.value = true
      window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }
  } else {
    isPopoverOpen.value = isOpen
  }
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
]

const cornerOptions = [
  { value: 'none', label: 'Square (0px)' },
  { value: 'sm', label: 'Small (8px)' },
  { value: 'md', label: 'Medium (16px)' },
  { value: 'lg', label: 'Large (24px)' },
  { value: 'full', label: 'Circular' },
]

const updateCameraSize = async (value: string) => {
  await handlePopoverToggle(false)
  emit('update:size', value)
}

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
  if (props.windowOverlay && isPopoverOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.camera-inline-settings, .native-settings')) {
      void handlePopoverToggle(false)
      return
    }
  }
  if ((e.target as HTMLElement).closest('.popover-container')) return

  if (props.windowOverlay) { window.capture?.dragStart(); window.addEventListener('mousemove', handleWindowDrag); window.addEventListener('mouseup', handleWindowDragEnd); return }
  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  initialPos.x = posX.value
  initialPos.y = posY.value

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

const handleWindowDrag = () => window.capture?.drag()
const handleWindowDragEnd = () => { window.removeEventListener('mousemove', handleWindowDrag); window.removeEventListener('mouseup', handleWindowDragEnd) }

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
  handleWindowDragEnd()
}

onMounted(() => {
  window.addEventListener('blur', closeInlineSettings)
  if (props.cameraId && props.cameraId !== 'off') {
    void setupCameraStream(props.cameraId)
  }
})

onBeforeUnmount(() => {
  stopCameraStream()
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('blur', closeInlineSettings)
})

function closeInlineSettings() {
  if (isPopoverOpen.value) void handlePopoverToggle(false)
}
</script>

<template>
  <div
    v-show="cameraId !== 'off'"
    ref="previewRef"
    class="camera-overlay-container"
    :class="[previewClasses, { 'window-overlay': windowOverlay }]"
    :style="windowOverlay ? { transform: `translate(${overlayOffset.x}px, ${overlayOffset.y}px)` } : { top: `${posY}px`, left: `${posX}px` }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @mousedown="handleMouseDown"
  >
    <div class="camera-overlay-frame">
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
    </div>

    <!-- Hover 'More' Button triggering settings popover -->
    <Transition name="fade">
      <div v-if="isHovered || isDragging || isPopoverOpen" class="camera-overlay-more">
        <button v-if="windowOverlay" class="more-btn native-settings" aria-label="Camera options" @mousedown.stop @click.stop="handlePopoverToggle(!isPopoverOpen)"><MoreVertical /></button>
        <Popover
          v-else
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
                />
              </div>

              <div class="setting-field">
                <label class="setting-label">Shadow Size</label>
                <Select
                  :model-value="shadowSize"
                  :options="shadowOptions"
                  @update:model-value="emit('update:shadowSize', $event)"
                />
              </div>

              <div class="setting-field">
                <label class="setting-label">Corner Radius</label>
                <Select
                  :model-value="cornerRadius"
                  :options="cornerOptions"
                  @update:model-value="emit('update:cornerRadius', $event)"
                />
              </div>
            </div>
          </template>
        </Popover>
      </div>
    </Transition>
    <section v-if="windowOverlay && isPopoverOpen" class="camera-inline-settings" @mousedown.stop>
      <label>Size<Select :model-value="size" :options="sizeOptions" @update:model-value="updateCameraSize" /></label>
      <label>Shadow<Select :model-value="shadowSize" :options="shadowOptions" @update:model-value="emit('update:shadowSize', $event)" /></label>
      <label>Corner<Select :model-value="cornerRadius" :options="cornerOptions" @update:model-value="emit('update:cornerRadius', $event)" /></label>
    </section>
  </div>
</template>

<style scoped>
.camera-overlay-container {
  position: fixed;
  z-index: 9999;
  cursor: grab;
  user-select: none;
  overflow: visible;
  border-radius: var(--camera-radius);
  transition: box-shadow 0.2s ease, border-radius 0.2s ease;
  isolation: isolate;
  --camera-radius: 20px;
}

.camera-overlay-container.window-overlay { top: 32px; left: 32px; }

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

.camera-inline-settings { position: absolute; inset: 4px; z-index: 3; display: grid; align-content: start; gap: 4px; padding: 25px 5px 5px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: inherit; background: var(--color-bg-surface); }
.camera-inline-settings label { display: grid; gap: 1px; font-size: 9px; font-weight: 700; line-height: 1; color: var(--text-secondary); }
.camera-inline-settings :deep(.select-trigger) { min-height: 28px; padding: 4px 7px; font-size: 10px; }
.camera-inline-settings :deep(.select-label) { font-size: 10px !important; }

.camera-overlay-frame {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--camera-radius);
  clip-path: inset(0 round var(--camera-radius));
  background: var(--color-bg-dark, #000);
}

.camera-overlay-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

/* Corner radius variants */
.radius-none {
  --camera-radius: 0px;
  border-radius: 0px;
}
.radius-sm {
  --camera-radius: 8px;
  border-radius: 8px;
}
.radius-md {
  --camera-radius: 14px;
  border-radius: 14px;
}
.radius-lg {
  --camera-radius: 20px;
  border-radius: 20px;
}
.radius-full {
  --camera-radius: 50%;
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
