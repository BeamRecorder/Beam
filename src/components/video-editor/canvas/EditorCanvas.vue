<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { Play, Pause } from '@lucide/vue'
import type { ProjectEditorData } from '../../../api/types/capture-api'
import type { CursorType } from '../composables/useCursorReplacer'
import type { BackgroundMedia } from '../composables/backgroundMedia'
import { buttonEventsBetween, cursorAssetForState, cursorStateAt } from '../composables/cursorPlayback'
import { zoomAtTime } from '../zoom/zoom-playback'
import { createCursorFollowCameraState, updateCursorFollowCamera } from '../zoom/zoom-camera'
import { createCameraVelocity, stepCameraSpring } from '../zoom/zoom-spring'
import type { ZoomElement } from '../zoom/zoom-types'
import { useCursorReplacer } from '../composables/useCursorReplacer'

const cursorHotspots: Record<CursorType, { x: number; y: number }> = {
  automatic: { x: 0, y: 0 },
  default: { x: 10, y: 7 },
  beachball: { x: 16, y: 16 },
  busy: { x: 7, y: 0 },
  cell: { x: 16, y: 16 },
  contextualmenu: { x: 8, y: 7 },
  copy: { x: 7, y: 0 },
  cross: { x: 16, y: 16 },
  handgrabbing: { x: 16, y: 16 },
  handopen: { x: 16, y: 16 },
  handpointing: { x: 12, y: 10 },
  help: { x: 7, y: 0 },
  makealias: { x: 7, y: 0 },
  move: { x: 16, y: 16 },
  notallowed: { x: 7, y: 0 },
  poof: { x: 7, y: 0 },
  resizenorth: { x: 16, y: 16 },
  resizenortheast: { x: 16, y: 16 },
  resizenortheastsouthwest: { x: 16, y: 16 },
  resizenorthsouth: { x: 16, y: 16 },
  resizenorthwest: { x: 16, y: 16 },
  resizenorthwestsoutheast: { x: 16, y: 16 },
  resizeright: { x: 16, y: 16 },
  resizesouth: { x: 16, y: 16 },
  resizesoutheast: { x: 16, y: 16 },
  resizesouthwest: { x: 16, y: 16 },
  resizeup: { x: 16, y: 16 },
  resizeupdown: { x: 16, y: 16 },
  resizewest: { x: 16, y: 16 },
  resizewesteast: { x: 16, y: 16 },
  screenshotselection: { x: 16, y: 16 },
  screenshotwindow: { x: 16, y: 16 },
  textcursor: { x: 16, y: 16 },
  textcursorvertical: { x: 16, y: 16 },
  zoomin: { x: 16, y: 16 },
  zoomout: { x: 16, y: 16 },
}

const props = defineProps<{
  isPlaying: boolean
  currentTime: number
  duration: number
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
  shadowBlur: number
  shadowColor: string
  rippleColor: string
  rippleSize: number
  isVideoEnabled: boolean
  selectedBackground: BackgroundMedia | null
  videoSrc: string
  editorData?: ProjectEditorData | null
  zoomElements: ZoomElement[]
  selectedZoom: ZoomElement | null
loopProgress?: number
}>()

const getRippleStyleColor = (hex: string, alpha: number) => {
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16) || 0
    const g = parseInt(hex.slice(3, 5), 16) || 0
    const b = parseInt(hex.slice(5, 7), 16) || 0
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return hex
}

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void
  (e: 'update:currentTime', value: number): void
  (e: 'duration-change', value: number): void
  (e: 'update:zoom', value: ZoomElement): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const videoError = ref<string | null>(null)

const logicalSize = ref({ width: 0, height: 0 })
const deviceScale = ref(1)
const cursorImages = new Map<string, HTMLImageElement>()
let resizeObserver: ResizeObserver | null = null
let animationFrameId: number | null = null
let lastDrawTime = 0
let previousCamera: { focusX: number; focusY: number; scale: number } | null = null
let renderedCamera: { focusX: number; focusY: number; scale: number } | null = null
let lastCameraUpdateMs = 0
const cameraVelocity = createCameraVelocity()
const cursorFollowCamera = createCursorFollowCameraState()
const videoWindowBounds = ref<{ dx: number; dy: number; dw: number; dh: number } | null>(null)
const focusTargetStyle = computed(() => {
  const bounds = videoWindowBounds.value
  if (!props.selectedZoom || props.selectedZoom.mode !== 'manual' || props.isPlaying || !bounds) return { display: 'none' }
  const selectionScale = [1.25, 1.5, 1.8, 2.2, 3.5, 5][props.selectedZoom.depth - 1]
  return {
    left: `${bounds.dx + props.selectedZoom.focus.cx * bounds.dw - bounds.dw / selectionScale / 2}px`,
    top: `${bounds.dy + props.selectedZoom.focus.cy * bounds.dh - bounds.dh / selectionScale / 2}px`,
    width: `${bounds.dw / selectionScale}px`,
    height: `${bounds.dh / selectionScale}px`,
  }
})
const isMovingSelection = ref(false)

interface Ripple {
  x: number
  y: number
  radius: number
  alpha: number
}
const ripples = ref<Ripple[]>([])

const { getCursorImage } = useCursorReplacer()
const customCursorImage = ref<HTMLImageElement | null>(null)

watch(
  () => [props.selectedCursor, props.cursorSize, props.cursorColor],
  async () => {
    if (props.selectedCursor === 'automatic') {
      customCursorImage.value = null
      return
    }
    try {
      const img = await getCursorImage(props.selectedCursor, props.cursorSize, props.cursorColor)
      customCursorImage.value = img
    } catch (err) {
      console.error('Failed to load custom cursor image:', err)
      customCursorImage.value = null
    }
  },
  { immediate: true }
)

const videoEl = document.createElement('video')
videoEl.muted = true
videoEl.preload = 'auto'
videoEl.playsInline = true

const effectiveVideoSrc = computed(() => props.editorData?.videoSrc || props.videoSrc)

const handleVideoMetadata = () => {
  if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    emit('duration-change', Math.ceil(videoEl.duration))
  }
}

const handleVideoError = () => {
  videoError.value = 'Unable to load this video file.'
}

videoEl.addEventListener('loadedmetadata', handleVideoMetadata)
videoEl.addEventListener('error', handleVideoError)

const loadVideo = () => {
  videoError.value = null
  previousCamera = null
  renderedCamera = null
  Object.assign(cameraVelocity, createCameraVelocity())
  videoEl.pause()
  videoEl.currentTime = 0
  videoEl.src = effectiveVideoSrc.value
  videoEl.load()
}
watch(effectiveVideoSrc, loadVideo, { immediate: true })

watch(() => props.isPlaying, (playing) => {
  if (playing) {
    videoEl.play().catch((error) => console.error('Failed to play video element:', error))
  } else {
    videoEl.pause()
    previousCamera = null
    renderedCamera = null
    Object.assign(cameraVelocity, createCameraVelocity())
  }
})

watch(() => props.currentTime, (time) => {
  const clampedTime = Math.max(0, Math.min(videoEl.duration || 0, time))
  if (Math.abs(videoEl.currentTime - clampedTime) > 0.15) videoEl.currentTime = clampedTime
})

const backgroundImg = new Image()
const backgroundVideo = document.createElement('video')
backgroundVideo.muted = true
backgroundVideo.loop = true
backgroundVideo.preload = 'auto'
backgroundVideo.playsInline = true

const loadBackground = () => {
  backgroundVideo.pause()
  backgroundVideo.removeAttribute('src')
  backgroundVideo.load()
  backgroundImg.removeAttribute('src')

  const background = props.selectedBackground
  if (!background) return

  if (background.kind === 'video') {
    backgroundVideo.src = background.path
    backgroundVideo.load()
  } else {
    backgroundImg.src = background.path
  }
}
watch(() => props.selectedBackground, loadBackground, { immediate: true })

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const background = props.selectedBackground
  if (background?.kind === 'video' && backgroundVideo.readyState >= 2) {
    ctx.drawImage(backgroundVideo, 0, 0, width, height)
    return
  }
  if (background?.kind !== 'video' && backgroundImg.complete && backgroundImg.naturalWidth > 0) {
    ctx.drawImage(backgroundImg, 0, 0, width, height)
    return
  }

  ctx.fillStyle = '#1e1e24'
  ctx.fillRect(0, 0, width, height)
}

watch(() => props.isPlaying, (playing) => {
  if (playing && props.selectedBackground?.kind === 'video') {
    backgroundVideo.play().catch((error) => console.error('Failed to play background video:', error))
  } else {
    backgroundVideo.pause()
  }
})

const loadCursorAssets = async () => {
  cursorImages.clear()
  const shapes = props.editorData?.cursor.shapes ?? {}
  for (const [shapeId, shape] of Object.entries(shapes)) {
    try {
      if (props.cursorColor === '#000000') {
        const image = new Image()
        image.onload = () => { cursorImages.set(shapeId, image) }
        image.src = shape.src
      } else {
        const response = await fetch(shape.src)
        if (response.ok) {
          let svgContent = await response.text()
          svgContent = svgContent
            .replace(/fill="#000000"/gi, `fill="${props.cursorColor}"`)
            .replace(/fill="#000"/gi, `fill="${props.cursorColor}"`)
          const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
          const url = URL.createObjectURL(svgBlob)
          const image = new Image()
          image.onload = () => { cursorImages.set(shapeId, image) }
          image.src = url
        } else {
          const image = new Image()
          image.onload = () => { cursorImages.set(shapeId, image) }
          image.src = shape.src
        }
      }
    } catch (err) {
      console.error('Failed to colorize shape SVG:', err)
      const image = new Image()
      image.onload = () => { cursorImages.set(shapeId, image) }
      image.src = shape.src
    }
  }
}
watch(() => [props.editorData, props.cursorColor], loadCursorAssets, { immediate: true })

const resizeCanvas = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const width = Math.max(1, container.clientWidth)
  const height = Math.max(1, container.clientHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  deviceScale.value = dpr
  logicalSize.value = { width, height }

  const backingWidth = Math.max(1, Math.round(width * dpr))
  const backingHeight = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
}

const drawVideoWindow = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  if (!props.isVideoEnabled) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Video track disabled', width / 2, height / 2)
    return null
  }

  const margin = 50
  const availWidth = Math.max(1, width - margin * 2)
  const availHeight = Math.max(1, height - margin * 2)
  const videoWidth = videoEl.videoWidth || 1920
  const videoHeight = videoEl.videoHeight || 1080
  const aspect = videoWidth / videoHeight
  let dw = availWidth
  let dh = availWidth / aspect
  if (dh > availHeight) {
    dh = availHeight
    dw = availHeight * aspect
  }
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 12
  ctx.fillStyle = '#1e1e1e'
  ctx.beginPath()
  ctx.roundRect(dx, dy, dw, dh, 10)
  ctx.fill()
  ctx.clip()

  const zoom = zoomAtTime(props.zoomElements, props.currentTime * 1000, props.editorData?.cursor.telemetry ?? [])
  // The camera follows the same interpolated event stream as the visible cursor.
  // Telemetry is used for zoom suggestions, not presentation, so sparse samples
  // cannot make the camera and the cursor disagree.
  const renderedCursor = cursorStateAt(props.editorData?.cursor.events ?? [], props.currentTime)
  const trackedFocus = zoom?.mode === 'auto'
    ? updateCursorFollowCamera(cursorFollowCamera, renderedCursor ? { cx: renderedCursor.x, cy: renderedCursor.y } : null, zoom.focus, zoom.scale, zoom.strength, props.currentTime * 1000)
    : zoom?.focus ?? { cx: 0.5, cy: 0.5 }
  const focusX = dx + trackedFocus.cx * dw
  const focusY = dy + trackedFocus.cy * dh
  const scale = zoom?.scale ?? 1
  const drawAtCamera = (camera: { focusX: number; focusY: number; scale: number }, alpha: number) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(dx + dw / 2, dy + dh / 2)
    ctx.scale(camera.scale, camera.scale)
    ctx.translate(-camera.focusX, -camera.focusY)
    if (videoEl.readyState >= 1) ctx.drawImage(videoEl, dx, dy, dw, dh)
    ctx.restore()
  }

  const targetCamera = { focusX, focusY, scale }
  const now = performance.now()
  const deltaMs = Math.min(80, Math.max(1, now - lastCameraUpdateMs))
  lastCameraUpdateMs = now
  if (!props.isPlaying || !renderedCamera) {
    renderedCamera = targetCamera
  } else {
    renderedCamera = stepCameraSpring(renderedCamera, targetCamera, cameraVelocity, deltaMs)
  }
  const camera = renderedCamera
  const previous = previousCamera
  const cameraDistance = previous
    ? Math.hypot(focusX - previous.focusX, focusY - previous.focusY) + Math.abs(scale - previous.scale) * Math.max(dw, dh)
    : 0
  if (props.isPlaying && previous && cameraDistance > 0.5 && videoEl.readyState >= 1) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const progress = sample / 4
      drawAtCamera({
        focusX: previous.focusX + (focusX - previous.focusX) * progress,
        focusY: previous.focusY + (focusY - previous.focusY) * progress,
        scale: previous.scale + (scale - previous.scale) * progress,
      }, 0.09)
    }
  }

  if (videoError.value) {
    ctx.save()
    ctx.translate(dx + dw / 2, dy + dh / 2)
    ctx.scale(scale, scale)
    ctx.translate(-focusX, -focusY)
    ctx.fillStyle = '#ef4444'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(videoError.value, focusX, focusY)
    ctx.restore()
  } else if (videoEl.readyState >= 1) {
    drawAtCamera(camera, 1)
  } else {
    ctx.save()
    ctx.translate(dx + dw / 2, dy + dh / 2)
    ctx.scale(scale, scale)
    ctx.translate(-focusX, -focusY)
    ctx.fillStyle = '#334155'
    ctx.fillRect(dx, dy, dw, dh)
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Loading video recording...', width / 2, height / 2)
    ctx.restore()
  }
  ctx.restore()
  previousCamera = camera
  videoWindowBounds.value = { dx, dy, dw, dh }
  // Cursor, ripples and video must share the rendered spring state. Returning
  // the target camera here made overlays jump ahead of the eased video frame.
  return { dx, dy, dw, dh, focusX: camera.focusX, focusY: camera.focusY, scale: camera.scale }
}

const drawInCameraSpace = (
  ctx: CanvasRenderingContext2D,
  videoWindow: { dx: number; dy: number; dw: number; dh: number; focusX: number; focusY: number; scale: number },
  drawContent: () => void,
) => {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(videoWindow.dx, videoWindow.dy, videoWindow.dw, videoWindow.dh, 10)
  ctx.clip()
  ctx.translate(videoWindow.dx + videoWindow.dw / 2, videoWindow.dy + videoWindow.dh / 2)
  ctx.scale(videoWindow.scale, videoWindow.scale)
  ctx.translate(-videoWindow.focusX, -videoWindow.focusY)
  drawContent()
  ctx.restore()
}

const updateSelectedFocus = (event: PointerEvent) => {
  const canvas = canvasRef.value
  const bounds = videoWindowBounds.value
  if (!canvas || !bounds || !props.selectedZoom || props.selectedZoom.mode !== 'manual') return
  const rect = canvas.getBoundingClientRect()
  const cx = Math.min(1, Math.max(0, (event.clientX - rect.left - bounds.dx) / bounds.dw))
  const cy = Math.min(1, Math.max(0, (event.clientY - rect.top - bounds.dy) / bounds.dh))
  emit('update:zoom', { ...props.selectedZoom, focus: { cx, cy } })
}

const beginSelectionMove = (event: PointerEvent) => {
  if (props.selectedZoom?.mode !== 'manual') return
  isMovingSelection.value = true
  canvasRef.value?.setPointerCapture(event.pointerId)
  updateSelectedFocus(event)
}

const moveSelection = (event: PointerEvent) => {
  if (isMovingSelection.value) updateSelectedFocus(event)
}

const endSelectionMove = (event: PointerEvent) => {
  isMovingSelection.value = false
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId)
  }
}

const drawCursorWarning = (ctx: CanvasRenderingContext2D, message: string, width: number) => {
  ctx.save()
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
  const padding = 8
  const textWidth = ctx.measureText(message).width
  ctx.roundRect(width - textWidth - padding * 2 - 8, 12, textWidth + padding * 2, 26, 6)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.fillText(message, width - 8 - padding, 29)
  ctx.restore()
}

const draw = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = logicalSize.value
  if (!width || !height) {
    animationFrameId = requestAnimationFrame(draw)
    return
  }
  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0)
  ctx.clearRect(0, 0, width, height)

  drawBackground(ctx, width, height)

  const videoWindow = drawVideoWindow(ctx, width, height)
  const cursorData = props.editorData?.cursor
  if (videoWindow && cursorData?.available) {
    const time = props.currentTime
    if (props.enableRipple && props.isPlaying && time >= lastDrawTime) {
      for (const button of buttonEventsBetween(cursorData.events, lastDrawTime, time)) {
        const state = cursorStateAt(cursorData.events, button.sessionNs / 1_000_000_000)
        if (!state) continue
        ripples.value.push({
          x: videoWindow.dx + state.x * videoWindow.dw,
          y: videoWindow.dy + state.y * videoWindow.dh,
          radius: 2,
          alpha: 1,
        })
      }
    }
    lastDrawTime = time

    const state = cursorStateAt(cursorData.events, props.currentTime)
    const asset = cursorAssetForState(state, cursorData.shapes)
    const image = state?.shapeId ? cursorImages.get(state.shapeId) : null
    drawInCameraSpace(ctx, videoWindow, () => {
      for (const ripple of ripples.value) {
        ctx.strokeStyle = getRippleStyleColor(props.rippleColor, ripple.alpha)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
        ctx.stroke()
        if (props.isPlaying) {
          ripple.radius += props.rippleSize / 25
          ripple.alpha -= 0.04
        }
      }

      const activeImage = customCursorImage.value || image
      if (!state?.visible || !asset || !activeImage || !activeImage.complete || activeImage.naturalWidth <= 0) return
      const pointerX = videoWindow.dx + state.x * videoWindow.dw
      const pointerY = videoWindow.dy + state.y * videoWindow.dh

      let hx = 0
      let hy = 0

      if (customCursorImage.value) {
        const hotspot = cursorHotspots[props.selectedCursor] || { x: 0, y: 0 }
        const cursorScale = props.cursorSize / 32
        hx = hotspot.x * cursorScale
        hy = hotspot.y * cursorScale
      } else {
        const cursorScale = props.cursorSize / activeImage.naturalWidth
        hx = asset.hotspot.x * cursorScale
        hy = asset.hotspot.y * cursorScale
      }

      if (props.enableShadow) {
        ctx.shadowColor = props.shadowColor
        ctx.shadowBlur = props.shadowBlur
        ctx.shadowOffsetX = Math.round(props.shadowBlur * 0.33)
        ctx.shadowOffsetY = Math.round(props.shadowBlur * 0.5)
      }
      ctx.drawImage(
        activeImage,
        pointerX - hx,
        pointerY - hy,
        customCursorImage.value ? props.cursorSize : (activeImage.naturalWidth * (props.cursorSize / activeImage.naturalWidth)),
        customCursorImage.value ? props.cursorSize : (activeImage.naturalHeight * (props.cursorSize / activeImage.naturalWidth))
      )
    })
    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0)

    if (state?.shapeId && !asset) {
      drawCursorWarning(ctx, 'Cursor shape missing', width)
    }
  } else if (props.isVideoEnabled && cursorData && !cursorData.available) {
    drawCursorWarning(ctx, 'Cursor data missing', width)
  }

  if (props.isPlaying && videoEl.readyState >= 1) {
    emit('update:currentTime', videoEl.ended ? 0 : videoEl.currentTime)
  }
  animationFrameId = requestAnimationFrame(draw)
}

onMounted(() => {
  resizeCanvas()
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  draw()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  videoEl.pause()
  backgroundVideo.pause()
  videoEl.removeEventListener('loadedmetadata', handleVideoMetadata)
  videoEl.removeEventListener('error', handleVideoError)
  videoEl.src = ''
  videoEl.load()
  backgroundVideo.removeAttribute('src')
  backgroundVideo.load()
})
</script>

<template>
  <div class="canvas-island" ref="containerRef">
    <canvas
      ref="canvasRef"
      class="editor-canvas"
      :class="{ 'is-selection-editable': selectedZoom?.mode === 'manual' }"
      @pointerdown="beginSelectionMove"
      @pointermove="moveSelection"
      @pointerup="endSelectionMove"
      @pointercancel="endSelectionMove"
    ></canvas>
    <div
      class="zoom-selection-box"
      :class="{ locked: selectedZoom?.mode !== 'manual' }"
      :style="focusTargetStyle"
      aria-hidden="true"
    ></div>
    <div class="canvas-play-controls">
      <button class="play-btn" @click="emit('update:isPlaying', !isPlaying)">
        <Play v-if="!isPlaying" class="ctrl-icon" />
        <Pause v-else class="ctrl-icon" />
      </button>
      <span class="time-readout">
        {{ Math.floor(currentTime).toString().padStart(2, '0') }}s / {{ duration }}s
      </span>
    </div>
  </div>
</template>

<style scoped>
.canvas-island {
  flex: 1;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.editor-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.editor-canvas.is-selection-editable {
  cursor: move;
}

.zoom-selection-box {
  position: absolute;
  border: 2px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.zoom-selection-box.locked {
  border-style: dashed;
  opacity: 0.7;
}

.canvas-play-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 16px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-md);
  z-index: 20;
}

.play-btn {
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctrl-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.time-readout {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  font-family: monospace;
}
</style>
