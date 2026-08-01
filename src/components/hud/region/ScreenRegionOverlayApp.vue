<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Move, RotateCcw, X } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import { capture } from '../../../api/capture'
import type { ScreenRegionOverlayOptions, ScreenRegion } from '../../../api/types/screen-region'

type Interaction =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; region: ScreenRegion }
  | { kind: 'resize'; handle: Handle; startX: number; startY: number; region: ScreenRegion }
  | null
type Handle = 'nw' | 'ne' | 'sw' | 'se'

const options = ref<(ScreenRegionOverlayOptions & { mode?: 'select' | 'record' }) | null>(null)
const region = ref<ScreenRegion | null>(null)
let interaction: Interaction = null
let unsubscribe: (() => void) | null = null

const isSelecting = computed(() => options.value?.mode === 'select')
const regionStyle = computed(() => {
  if (!region.value) return {}
  return {
    left: `${region.value.x * 100}%`,
    top: `${region.value.y * 100}%`,
    width: `${region.value.width * 100}%`,
    height: `${region.value.height * 100}%`,
  }
})

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const point = (event: PointerEvent) => ({
  x: clamp(event.clientX / Math.max(1, window.innerWidth)),
  y: clamp(event.clientY / Math.max(1, window.innerHeight)),
})

const normalize = (x1: number, y1: number, x2: number, y2: number): ScreenRegion => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  width: Math.abs(x2 - x1),
  height: Math.abs(y2 - y1),
})

const isFullScreenRegion = (r: ScreenRegion | null): boolean => {
  if (!r) return false
  return r.x <= 0.01 && r.y <= 0.01 && r.width >= 0.98 && r.height >= 0.98
}

const begin = (event: PointerEvent) => {
  if (!isSelecting.value) return
  const target = event.target as HTMLElement
  const handle = target.dataset.handle as Handle | undefined
  const current = region.value
  const next = point(event)
  if (handle && current) {
    interaction = { kind: 'resize', handle, startX: next.x, startY: next.y, region: { ...current } }
  } else if (
    current &&
    !isFullScreenRegion(current) &&
    next.x >= current.x &&
    next.x <= current.x + current.width &&
    next.y >= current.y &&
    next.y <= current.y + current.height
  ) {
    interaction = { kind: 'move', startX: next.x, startY: next.y, region: { ...current } }
  } else {
    region.value = { x: next.x, y: next.y, width: 0, height: 0 }
    interaction = { kind: 'draw', startX: next.x, startY: next.y }
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

const move = (event: PointerEvent) => {
  if (!interaction) return
  const next = point(event)
  if (interaction.kind === 'draw') {
    region.value = normalize(interaction.startX, interaction.startY, next.x, next.y)
    return
  }
  if (interaction.kind === 'move') {
    const dx = next.x - interaction.startX
    const dy = next.y - interaction.startY
    region.value = { ...interaction.region, x: Math.max(0, Math.min(1 - interaction.region.width, interaction.region.x + dx)), y: Math.max(0, Math.min(1 - interaction.region.height, interaction.region.y + dy)) }
    return
  }
  const start = interaction.region
  let left = start.x
  let right = start.x + start.width
  let top = start.y
  let bottom = start.y + start.height
  if (interaction.handle.includes('w')) left = Math.min(next.x, right - 0.01)
  if (interaction.handle.includes('e')) right = Math.max(next.x, left + 0.01)
  if (interaction.handle.includes('n')) top = Math.min(next.y, bottom - 0.01)
  if (interaction.handle.includes('s')) bottom = Math.max(next.y, top + 0.01)
  region.value = { x: Math.max(0, left), y: Math.max(0, top), width: Math.min(1, right) - Math.max(0, left), height: Math.min(1, bottom) - Math.max(0, top) }
}

const FULL_SCREEN_REGION: ScreenRegion = { x: 0, y: 0, width: 1, height: 1 }

const end = () => { interaction = null }
const reset = () => { region.value = { ...FULL_SCREEN_REGION } }
const confirm = () => {
  if (!region.value || region.value.width <= 0 || region.value.height <= 0) return
  capture.confirmScreenRegion({ ...region.value })
}
const cancel = () => capture.cancelScreenRegion()

onMounted(() => {
  unsubscribe = capture.onScreenRegionConfigure((next) => {
    options.value = next
    region.value = next.region ? { ...next.region } : { ...FULL_SCREEN_REGION }
  })
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <main class="region-overlay" @pointerdown.prevent="begin" @pointermove="move" @pointerup="end" @pointercancel="end">
    <div v-if="isSelecting && !region" class="region-empty-backdrop" />
    <div v-if="region" class="region-frame" :style="regionStyle" :class="{ selecting: isSelecting }">
      <span v-if="isSelecting" class="resize-handle nw" data-handle="nw" />
      <span v-if="isSelecting" class="resize-handle ne" data-handle="ne" />
      <span v-if="isSelecting" class="resize-handle sw" data-handle="sw" />
      <span v-if="isSelecting" class="resize-handle se" data-handle="se" />
      <span v-if="isSelecting" class="region-size">{{ Math.round(region.width * (options?.bounds.width || 0)) }} × {{ Math.round(region.height * (options?.bounds.height || 0)) }}</span>
    </div>
    <aside v-if="isSelecting" class="region-toolbar" @pointerdown.stop>
      <span class="region-instruction"><Move :size="16" /> Select an area to record</span>
      <div class="region-actions">
        <Button variant="ghost" size="sm" :icon="RotateCcw" @click="reset">Reset</Button>
        <Button variant="ghost" size="sm" :icon="X" @click="cancel">Cancel</Button>
        <Button variant="primary" size="sm" :icon="Check" :disabled="!region" @click="confirm">Use this area</Button>
      </div>
    </aside>
  </main>
</template>

<style scoped>
.region-overlay { position: fixed; inset: 0; overflow: hidden; cursor: crosshair; background: transparent; user-select: none; touch-action: none; }
.region-empty-backdrop { position: absolute; inset: 0; pointer-events: none; background: rgb(8 12 20 / 42%); }
.region-frame { position: absolute; z-index: 1; border: 2px solid var(--color-primary); cursor: move; }
.region-frame.selecting { box-shadow: 0 0 0 9999px rgb(8 12 20 / 42%); }
.resize-handle { position: absolute; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; background: var(--color-primary); box-shadow: 0 1px 4px rgb(0 0 0 / 45%); }
.nw { top: -7px; left: -7px; cursor: nwse-resize; }.ne { top: -7px; right: -7px; cursor: nesw-resize; }.sw { bottom: -7px; left: -7px; cursor: nesw-resize; }.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
.region-size { position: absolute; top: 8px; left: 50%; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--color-primary); color: var(--text-on-primary); font: 600 12px var(--font-sans); transform: translateX(-50%); white-space: nowrap; }
.region-toolbar { position: fixed; z-index: 20; left: 50%; bottom: 24px; display: flex; align-items: center; gap: 20px; padding: 10px 12px 10px 16px; border: 1px solid color-mix(in srgb, var(--color-border-strong) 76%, transparent); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-bg-surface) 82%, transparent); box-shadow: var(--shadow-lg); backdrop-filter: blur(18px) saturate(1.15); -webkit-backdrop-filter: blur(18px) saturate(1.15); color: var(--text-primary); transform: translateX(-50%); }
.region-instruction { display: inline-flex; align-items: center; gap: 8px; font: 600 13px var(--font-sans); white-space: nowrap; }.region-actions { display: flex; align-items: center; gap: 4px; }
</style>
