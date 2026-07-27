<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import type { MediaCompositionLayer } from '../composition/composition-types'
import { useThumbnails } from './waveform/useThumbnails'

const props = defineProps<{
  layer: MediaCompositionLayer & { kind: 'video' }
  source: string
  duration: number
  visibleSeconds: number[]
  selected: boolean
}>()
const emit = defineEmits<{
  (event: 'select'): void
  (event: 'move', value: PointerEvent): void
  (event: 'trim', value: { event: PointerEvent; edge: 'start' | 'end' }): void
}>()

const source = computed(() => props.source)
const { thumbnails, requestVisibleFrames } = useThumbnails(source)
let marqueeFrame = 0
let marqueeTimer = 0
const stopMarquee = (target?: HTMLElement) => {
  window.cancelAnimationFrame(marqueeFrame)
  window.clearTimeout(marqueeTimer)
  marqueeFrame = 0
  marqueeTimer = 0
  const label = target?.querySelector<HTMLElement>('.clip-label-text')
  if (label) label.style.transform = ''
}
const startMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement
  const label = target.querySelector<HTMLElement>('.clip-label-text')
  if (!label) return
  const distance = label.scrollWidth - label.clientWidth
  if (distance <= 0) return
  stopMarquee(target)
  marqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now()
    const travelMs = Math.max(3000, distance / 36 * 1000)
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`
      marqueeFrame = window.requestAnimationFrame(tick)
    }
    marqueeFrame = window.requestAnimationFrame(tick)
  }, 300)
}
onUnmounted(() => stopMarquee())
const frames = computed(() => props.visibleSeconds.flatMap((timelineSecond) => {
  const timelineMs = timelineSecond * 1000
  if (timelineMs < props.layer.startMs || timelineMs >= props.layer.endMs) return []
  const mediaSecond = Math.max(0, Math.floor(((timelineMs - props.layer.startMs) * (props.layer.playbackRate ?? 1) + (props.layer.sourceOffsetMs ?? 0)) / 1000))
  return [{ timelineSecond, mediaSecond }]
}))
watch(frames, (value) => requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))]), { immediate: true })
const clipStyle = computed(() => ({
  left: `${props.duration > 0 ? props.layer.startMs / (props.duration * 10) : 0}%`,
  width: `${props.duration > 0 ? (props.layer.endMs - props.layer.startMs) / (props.duration * 10) : 0}%`,
}))
const frameStyle = (frame: { timelineSecond: number }) => ({
  left: `${((frame.timelineSecond * 1000 - props.layer.startMs) / Math.max(1, props.layer.endMs - props.layer.startMs)) * 100}%`,
  width: `${(1000 / Math.max(1, props.layer.endMs - props.layer.startMs)) * 100}%`,
})
</script>

<template>
  <button type="button" class="timeline-video-clip" :class="{ selected }" :style="clipStyle" @click.stop="emit('select')" @pointerdown="emit('move', $event)" @pointerenter="startMarquee" @pointerleave="stopMarquee($event.currentTarget)">
    <div class="thumbnails-track">
      <div v-for="frame in frames" :key="`${frame.timelineSecond}:${frame.mediaSecond}`" class="thumbnail-frame" :style="frameStyle(frame)">
        <img v-if="thumbnails[frame.mediaSecond]" :src="thumbnails[frame.mediaSecond]" class="thumbnail-img" alt="" draggable="false" />
        <Skeleton v-else width="100%" height="100%" radius="0" />
      </div>
    </div>
    <span class="trim-handle start" title="Trim start" @pointerdown="emit('trim', { event: $event, edge: 'start' })" />
    <span class="clip-label-overlay"><span class="clip-label-text">{{ layer.name }}</span></span>
    <span class="trim-handle end" title="Trim end" @pointerdown="emit('trim', { event: $event, edge: 'end' })" />
  </button>
</template>

<style scoped>
.timeline-video-clip { position: absolute; inset-block: 0; min-width: 14px; padding: 0; border: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg-surface); cursor: grab; }
.timeline-video-clip:active { cursor: grabbing; }
.timeline-video-clip.selected { outline: 1px solid var(--color-primary); }
.thumbnails-track { position: relative; width: 100%; height: 100%; }
.thumbnail-frame { position: absolute; top: 0; height: 100%; overflow: hidden; background: var(--color-bg-surface); border-right: 1px solid rgba(0, 0, 0, .08); }
.thumbnail-img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.trim-handle { position: absolute; top: 0; bottom: 0; z-index: 10; width: 6px; background: rgba(255, 255, 255, .25); cursor: col-resize; }
.trim-handle.start { left: 0; }
.trim-handle.end { right: 0; }
.clip-label-overlay { display: block; max-width: calc(100% - 16px); overflow: hidden; white-space: nowrap; }
.clip-label-text { display: inline-block; white-space: nowrap; transition: transform .05s linear; }
</style>
