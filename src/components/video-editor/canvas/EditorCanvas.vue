<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { Play, Pause } from '@lucide/vue'
import type { ProjectEditorData } from '../../../api/types/capture-api'
import type { CursorType } from '../composables/useCursorReplacer'
import type { BackgroundMedia } from '../composables/backgroundMedia'
import { buttonEventsBetween, cursorAssetForState, cursorStateAt } from '../composables/cursorPlayback'
import { zoomAtTime } from '../zoom/zoom-playback'
import type { ZoomElement } from '../zoom/zoom-types'

const props = defineProps<{
  isPlaying: boolean
  currentTime: number
  duration: number
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
  isVideoEnabled: boolean
  selectedBackground: BackgroundMedia | null
  videoSrc: string
  editorData?: ProjectEditorData | null
  zoomElements: ZoomElement[]
  selectedZoom: ZoomElement | null
}>()

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
const videoWindowBounds = ref<{ dx: number; dy: number; dw: number; dh: number } | null>(null)
const focusTargetStyle = computed(() => {
  const bounds = videoWindowBounds.value
  if (!props.selectedZoom || !bounds) return { display: 'none' }
  return {
    left: `${bounds.dx + props.selectedZoom.focus.cx * bounds.dw}px`,
    top: `${bounds.dy + props.selectedZoom.focus.cy * bounds.dh}px`,
  }
})

interface Ripple {
  x: number
  y: number
  radius: number
  alpha: number
}
const ripples = ref<Ripple[]>([])

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

const loadCursorAssets = () => {
  cursorImages.clear()
  const shapes = props.editorData?.cursor.shapes ?? {}
  for (const [shapeId, shape] of Object.entries(shapes)) {
    const image = new Image()
    image.onload = () => { cursorImages.set(shapeId, image) }
    image.src = shape.src
  }
}
watch(() => props.editorData, loadCursorAssets, { immediate: true })

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

  const zoom = zoomAtTime(props.zoomElements, props.currentTime * 1000)
  const focusX = dx + (zoom?.focus.cx ?? 0.5) * dw
  const focusY = dy + (zoom?.focus.cy ?? 0.5) * dh
  const scale = zoom?.scale ?? 1
  ctx.translate(dx + dw / 2, dy + dh / 2)
  ctx.scale(scale, scale)
  ctx.translate(-focusX, -focusY)

  if (videoError.value) {
    ctx.fillStyle = '#ef4444'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(videoError.value, focusX, focusY)
  } else if (videoEl.readyState >= 1) {
    // The canvas is DPR-scaled, so this draw remains sharp on HiDPI displays.
    ctx.drawImage(videoEl, dx, dy, dw, dh)
  } else {
    ctx.fillStyle = '#334155'
    ctx.fillRect(dx, dy, dw, dh)
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Loading video recording...', width / 2, height / 2)
  }
  ctx.restore()
  videoWindowBounds.value = { dx, dy, dw, dh }
  return { dx, dy, dw, dh, focusX, focusY, scale }
}

const transformedPoint = (point: { x: number; y: number }, videoWindow: { focusX: number; focusY: number; scale: number }) => ({
  x: videoWindow.focusX + (point.x - videoWindow.focusX) * videoWindow.scale,
  y: videoWindow.focusY + (point.y - videoWindow.focusY) * videoWindow.scale,
})

const updateSelectedFocus = (event: PointerEvent) => {
  const canvas = canvasRef.value
  const bounds = videoWindowBounds.value
  if (!canvas || !bounds || !props.selectedZoom) return
  const rect = canvas.getBoundingClientRect()
  const cx = Math.min(1, Math.max(0, (event.clientX - rect.left - bounds.dx) / bounds.dw))
  const cy = Math.min(1, Math.max(0, (event.clientY - rect.top - bounds.dy) / bounds.dh))
  emit('update:zoom', { ...props.selectedZoom, focus: { cx, cy } })
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

    for (const ripple of ripples.value) {
      const position = transformedPoint(ripple, videoWindow)
      ctx.strokeStyle = `rgba(255, 90, 31, ${ripple.alpha})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(position.x, position.y, ripple.radius * videoWindow.scale, 0, Math.PI * 2)
      ctx.stroke()
      if (props.isPlaying) {
        ripple.radius += 1.5
        ripple.alpha -= 0.04
      }
    }
    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0)

    const state = cursorStateAt(cursorData.events, props.currentTime)
    const asset = cursorAssetForState(state, cursorData.shapes)
    const image = state?.shapeId ? cursorImages.get(state.shapeId) : null
    if (state?.visible && asset && image && image.complete && image.naturalWidth > 0) {
      const scale = props.cursorSize / image.naturalWidth
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale
      const pointer = transformedPoint({
        x: videoWindow.dx + state.x * videoWindow.dw,
        y: videoWindow.dy + state.y * videoWindow.dh,
      }, videoWindow)
      ctx.save()
      if (props.enableShadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 3
      }
      ctx.drawImage(
        image,
        pointer.x - asset.hotspot.x * scale * videoWindow.scale,
        pointer.y - asset.hotspot.y * scale * videoWindow.scale,
        drawWidth * videoWindow.scale,
        drawHeight * videoWindow.scale,
      )
      ctx.restore()
    } else if (state?.shapeId && !asset) {
      drawCursorWarning(ctx, 'Cursor shape missing', width)
    }
  } else if (props.isVideoEnabled && cursorData && !cursorData.available) {
    drawCursorWarning(ctx, 'Cursor data missing', width)
  }

  if (props.isPlaying) {
    const nextTime = props.currentTime + 0.016
    emit('update:currentTime', nextTime >= props.duration ? 0 : nextTime)
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
    <canvas ref="canvasRef" class="editor-canvas" @pointerdown="updateSelectedFocus"></canvas>
    <div class="zoom-focus-target" :style="focusTargetStyle" aria-hidden="true"></div>
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

.zoom-focus-target {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
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
