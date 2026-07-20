<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Play, Pause } from '@lucide/vue'
import type { CursorType } from '../composables/useCursorReplacer'
import { useCursorReplacer } from '../composables/useCursorReplacer'

const props = defineProps<{
  isPlaying: boolean
  currentTime: number
  duration: number
  
  // Cursor options
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
  
  // Track status
  isVideoEnabled: boolean

  // Wallpaper and source files
  selectedWallpaper: string
  videoSrc: string
}>()

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void
  (e: 'update:currentTime', value: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const { getCursorImage } = useCursorReplacer()

// Simulated cursor positions (keyframe track)
const cursorTrack = [
  { t: 0, x: 200, y: 150 },
  { t: 3, x: 350, y: 200 },
  { t: 7, x: 600, y: 350 },
  { t: 10, x: 250, y: 450 },
  { t: 15, x: 550, y: 180 },
  { t: 20, x: 700, y: 400 },
  { t: 25, x: 400, y: 300 },
  { t: 30, x: 200, y: 150 },
]

// Clicking ripples list
interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
}
const ripples = ref<Ripple[]>([])

// Interpolate cursor position based on currentTime
const getCursorPos = (t: number) => {
  const loopT = t % 30
  for (let i = 0; i < cursorTrack.length - 1; i++) {
    const p1 = cursorTrack[i]
    const p2 = cursorTrack[i + 1]
    if (loopT >= p1.t && loopT <= p2.t) {
      const ratio = (loopT - p1.t) / (p2.t - p1.t)
      return {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio,
      }
    }
  }
  return { x: 200, y: 150 }
}

let animationFrameId: number | null = null
let cursorImgElement: HTMLImageElement | null = null

// Setup offscreen Video Element
const videoEl = document.createElement('video')
videoEl.muted = true
videoEl.loop = true
videoEl.playsInline = true

const loadVideo = () => {
  videoEl.src = props.videoSrc
  videoEl.load()
}
watch(() => props.videoSrc, loadVideo, { immediate: true })

watch(() => props.isPlaying, (playing) => {
  if (playing) {
    videoEl.play().catch(err => console.error('Failed to play video element:', err))
  } else {
    videoEl.pause()
  }
})

watch(() => props.currentTime, (time) => {
  if (Math.abs(videoEl.currentTime - time) > 0.15) {
    videoEl.currentTime = time
  }
})

// Setup Wallpaper image loading
const wallpaperImg = new Image()
const loadWallpaper = () => {
  wallpaperImg.src = props.selectedWallpaper
}
watch(() => props.selectedWallpaper, loadWallpaper, { immediate: true })

// Load cursor image when configuration changes
const loadCursor = async () => {
  cursorImgElement = await getCursorImage(props.selectedCursor, props.cursorSize, props.cursorColor)
}

watch(() => [props.selectedCursor, props.cursorSize, props.cursorColor], loadCursor, { immediate: true })

// Main draw loop
const draw = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 1. Draw Wallpaper background
  if (wallpaperImg.complete && wallpaperImg.naturalWidth > 0) {
    ctx.drawImage(wallpaperImg, 0, 0, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = '#1e1e24'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // 2. Draw Video recording frame
  let dx = 0, dy = 0, dw = 0, dh = 0
  if (props.isVideoEnabled) {
    const margin = 50
    const availWidth = canvas.width - (margin * 2)
    const availHeight = canvas.height - (margin * 2)
    
    const videoWidth = videoEl.videoWidth || 1920
    const videoHeight = videoEl.videoHeight || 1080
    const aspect = videoWidth / videoHeight
    
    dw = availWidth
    dh = availWidth / aspect
    
    if (dh > availHeight) {
      dh = availHeight
      dw = availHeight * aspect
    }
    
    dx = (canvas.width - dw) / 2
    dy = (canvas.height - dh) / 2
    
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 12
    
    // Draw window backing
    ctx.fillStyle = '#1e1e1e'
    ctx.beginPath()
    ctx.roundRect(dx, dy, dw, dh, 10)
    ctx.fill()
    ctx.clip()
    
    if (videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, dx, dy, dw, dh)
    } else {
      ctx.fillStyle = '#334155'
      ctx.fillRect(dx, dy, dw, dh)
      ctx.fillStyle = '#ffffff'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Loading video recording...', canvas.width / 2, canvas.height / 2)
    }
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Video track disabled', canvas.width / 2, canvas.height / 2)
  }

  // 3. Draw Ripples
  if (props.enableRipple) {
    ripples.value.forEach((ripple, index) => {
      ctx.strokeStyle = `rgba(255, 90, 31, ${ripple.alpha})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
      ctx.stroke()
      
      if (props.isPlaying) {
        ripple.radius += 1.5
        ripple.alpha -= 0.04
      }
      if (ripple.alpha <= 0) {
        ripples.value.splice(index, 1)
      }
    })
  }

  // 4. Draw Custom Cursor
  if (props.isVideoEnabled && cursorImgElement) {
    const pos = getCursorPos(props.currentTime)
    
    // Keep cursor within video window boundaries for realism
    const localX = dx + (pos.x / 800) * dw
    const localY = dy + (pos.y / 600) * dh

    if (props.isPlaying && (props.currentTime * 10) % 30 === 0 && Math.random() > 0.7) {
      ripples.value.push({
        x: localX,
        y: localY,
        radius: 2,
        maxRadius: 24,
        alpha: 1.0
      })
    }

    ctx.save()
    if (props.enableShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 3
    }
    
    ctx.drawImage(
      cursorImgElement, 
      localX - (props.selectedCursor === 'grabbing' || props.selectedCursor === 'text' ? props.cursorSize / 2 : 0), 
      localY - (props.selectedCursor === 'grabbing' || props.selectedCursor === 'text' ? props.cursorSize / 2 : 0)
    )
    ctx.restore()
  }

  // Update time if playing
  if (props.isPlaying) {
    const nextTime = props.currentTime + 0.016
    emit('update:currentTime', nextTime >= props.duration ? 0 : nextTime)
  }

  animationFrameId = requestAnimationFrame(draw)
}

const resizeCanvas = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  draw()
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  videoEl.pause()
  videoEl.src = ''
  videoEl.load()
})
</script>

<template>
  <div class="canvas-island" ref="containerRef">
    <canvas ref="canvasRef" class="editor-canvas"></canvas>

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
