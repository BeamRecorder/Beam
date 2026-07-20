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
  { t: 0, x: 100, y: 100 },
  { t: 3, x: 250, y: 150 },
  { t: 7, x: 500, y: 300 },
  { t: 10, x: 150, y: 400 },
  { t: 15, x: 450, y: 120 },
  { t: 20, x: 600, y: 380 },
  { t: 25, x: 300, y: 250 },
  { t: 30, x: 100, y: 100 },
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
  return { x: 100, y: 100 }
}

let animationFrameId: number | null = null
let cursorImgElement: HTMLImageElement | null = null

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

  // 1. Clear background
  ctx.fillStyle = '#0f172a' // Dark editor canvas bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 2. Draw Video/Screen simulation
  if (props.isVideoEnabled) {
    // Draw a mock desktop screen with beautiful graphics
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80)
    
    // Draw a browser mockup inside the mock screen
    ctx.fillStyle = '#334155'
    ctx.fillRect(80, 80, canvas.width - 160, canvas.height - 160)
    
    // Browser header
    ctx.fillStyle = '#475569'
    ctx.fillRect(80, 80, canvas.width - 160, 32)
    
    // Browser circles (red, yellow, green)
    ctx.fillStyle = '#ef4444'
    ctx.beginPath(); ctx.arc(96, 96, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#eab308'
    ctx.beginPath(); ctx.arc(112, 96, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#22c55e'
    ctx.beginPath(); ctx.arc(128, 96, 6, 0, Math.PI * 2); ctx.fill()
    
    // Simulated Code editor / content text inside browser
    ctx.fillStyle = '#ff5a1f'
    ctx.fillRect(100, 150, 200, 16)
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(100, 180, 150, 16)
    ctx.fillStyle = '#a7f3d0'
    ctx.fillRect(100, 210, 280, 16)
    ctx.fillStyle = '#f472b6'
    ctx.fillRect(100, 240, 180, 16)

    // Animated orbiting widget to show playback is happening
    if (props.isPlaying) {
      const angle = (props.currentTime * 2) % (Math.PI * 2)
      ctx.fillStyle = '#ff5a1f'
      ctx.beginPath()
      ctx.arc(
        canvas.width / 2 + Math.cos(angle) * 80,
        canvas.height / 2 + Math.sin(angle) * 80,
        14,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  } else {
    // Disabled track overlay
    ctx.fillStyle = '#020617'
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
      
      // Update ripple size & opacity
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
    
    // Add ripple automatically on pre-defined keyframe ticks to simulate clicking
    if (props.isPlaying && (props.currentTime * 10) % 30 === 0 && Math.random() > 0.7) {
      ripples.value.push({
        x: pos.x,
        y: pos.y,
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
      pos.x - (props.selectedCursor === 'grabbing' || props.selectedCursor === 'text' ? props.cursorSize / 2 : 0), 
      pos.y - (props.selectedCursor === 'grabbing' || props.selectedCursor === 'text' ? props.cursorSize / 2 : 0)
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
