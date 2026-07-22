<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { capture } from '../../../api/capture'
import { Image, Upload, Video, Sparkles } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Switch from '~/ui/switch/Switch.vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import { type BackgroundMedia, type BackgroundMediaGroup, type BackgroundMediaKind } from '../composables/backgroundMedia'
import { OUTPUT_CANVAS_PRESETS, type OutputCanvasPreset, type OutputCanvasSettings } from '../canvas/output-canvas'

const props = defineProps<{ selectedBackground: string | null; backgroundGroups: BackgroundMediaGroup[]; projectId?: string | null; canvas: OutputCanvasSettings }>()
const emit = defineEmits<{ (e: 'update:selectedBackground', value: string): void; (e: 'import:background', value: BackgroundMedia): void; (e: 'update:canvas', value: OutputCanvasSettings): void }>()

const activeKind = ref<Extract<BackgroundMediaKind, 'image' | 'video'>>('image')
const loadedCount = ref(24)
const previewReady = ref(new Set<string>())
const isLoadingMore = ref(false)
const pageSize = 24

// Hovered background item ID to defer video load
const hoveredId = ref<string | null>(null)

// Intersection observer for lazy infinite scroll loading
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const filteredItems = computed(() => props.backgroundGroups
  .filter((group) => activeKind.value === 'image' ? group.kind !== 'video' : group.kind === 'video')
  .flatMap((group) => group.items))
const loadedItems = computed(() => filteredItems.value.slice(0, loadedCount.value))
const hasMore = computed(() => loadedCount.value < filteredItems.value.length)

const setKind = (kind: Extract<BackgroundMediaKind, 'image' | 'video'>) => { activeKind.value = kind; loadedCount.value = pageSize }
const loadMore = () => {
  if (isLoadingMore.value || !hasMore.value) return
  isLoadingMore.value = true
  requestAnimationFrame(() => {
    loadedCount.value = Math.min(filteredItems.value.length, loadedCount.value + pageSize)
    isLoadingMore.value = false
  })
}
const markReady = (id: string) => { previewReady.value = new Set([...previewReady.value, id]) }
const isReady = (id: string) => previewReady.value.has(id)
const triggerImport = async () => {
  if (!props.projectId) return
  const background = await capture.pickProjectBackgroundMedia(props.projectId)
  if (background) emit('import:background', background)
}
const setCanvasPreset = (preset: OutputCanvasPreset) => {
  if (preset === 'custom') return emit('update:canvas', { ...props.canvas, preset })
  emit('update:canvas', { ...OUTPUT_CANVAS_PRESETS[preset], showBackground: props.canvas.showBackground })
}
const updateCustomDimension = (key: 'width' | 'height', value: string) => {
  const dimension = Math.round(Number(value))
  if (!Number.isFinite(dimension) || dimension < 1) return
  emit('update:canvas', { ...props.canvas, preset: 'custom', [key]: dimension })
}
const ratioLabel = computed(() => `${props.canvas.width} × ${props.canvas.height} (${(props.canvas.width / props.canvas.height).toFixed(2)}:1)`)
const setShowBackground = (showBackground: boolean) => emit('update:canvas', { ...props.canvas, showBackground })

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadMore()
    }
  }, {
    root: document.querySelector('.background-grid-scroll'),
    rootMargin: '120px', // Pre-load items 120px before they enter view
  })

  watch(sentinelRef, (newEl) => {
    if (newEl) {
      observer?.observe(newEl)
    } else {
      observer?.disconnect()
    }
  })
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="options-group">
    <label class="prop-label">Output format</label>
    <ButtonGroup aria-label="Output format">
      <Button v-for="preset in ['16:9', '9:16', '1:1', '4:5'] as const" :key="preset" size="sm" :variant="canvas.preset === preset ? 'primary' : 'ghost'" @click="setCanvasPreset(preset)">{{ preset }}</Button>
    </ButtonGroup>
    <Button size="sm" :variant="canvas.preset === 'custom' ? 'primary' : 'ghost'" @click="setCanvasPreset('custom')">Custom</Button>
    <div v-if="canvas.preset === 'custom'" class="canvas-dimensions">
      <label>Width <input :value="canvas.width" type="number" min="1" @change="updateCustomDimension('width', ($event.target as HTMLInputElement).value)"></label>
      <label>Height <input :value="canvas.height" type="number" min="1" @change="updateCustomDimension('height', ($event.target as HTMLInputElement).value)"></label>
    </div>
    <p class="canvas-ratio">{{ ratioLabel }}</p>
    <div class="prop-row"><span class="prop-label">Show background</span><Switch :model-value="canvas.showBackground" @update:model-value="setShowBackground" /></div>
    <label class="prop-label">Background</label>
    <ButtonGroup aria-label="Background type">
      <Button size="sm" :variant="activeKind === 'video' ? 'primary' : 'ghost'" :icon="Video" @click="setKind('video')">Video</Button>
      <Button size="sm" :variant="activeKind === 'image' ? 'primary' : 'ghost'" :icon="Image" @click="setKind('image')">Image</Button>
    </ButtonGroup>

    <div class="background-grid-scroll">
      <div class="background-grid">
        <!-- Import Card -->
        <button type="button" class="background-card import-card" @click="triggerImport">
          <Upload class="import-icon" :size="22" />
          <span class="background-name">Import</span>
        </button>

        <!-- Blur Card -->
        <button 
          type="button" 
          class="background-card blur-card" 
          :class="{ active: selectedBackground === 'blur' }"
          @click="emit('update:selectedBackground', 'blur')"
          title="Flou d'arrière-plan"
        >
          <div class="background-preview blur-preview">
            <Sparkles class="blur-icon" :size="22" />
          </div>
          <span class="background-name">Flou</span>
        </button>

        <!-- Background Cards -->
        <button 
          v-for="item in loadedItems" 
          :key="item.id" 
          class="background-card" 
          :class="{ active: item.path === selectedBackground }" 
          type="button" 
          :title="item.name" 
          @click="emit('update:selectedBackground', item.path)"
          @mouseenter="hoveredId = item.id"
          @mouseleave="hoveredId = null"
        >
          <div class="background-preview">
            <Skeleton v-if="!isReady(item.id) && item.kind !== 'video'" width="100%" height="100%" radius="sm" />
            
            <!-- Render video only if hovered or selected -->
            <template v-if="item.kind === 'video'">
              <video 
                v-if="hoveredId === item.id || item.path === selectedBackground"
                :src="item.path" 
                muted 
                playsinline 
                autoplay
                loop
                preload="auto" 
                class="preview-media ready" 
              />
              <div v-else class="video-placeholder">
                <Video class="placeholder-icon" :size="20" />
              </div>
            </template>
            
            <!-- Standard Image load with native lazy loading -->
            <img 
              v-else 
              :src="item.path" 
              :alt="item.name" 
              loading="lazy" 
              decoding="async" 
              class="preview-media" 
              :class="{ ready: isReady(item.id) }" 
              @load="markReady(item.id)" 
            />
          </div>
          <span class="background-name">{{ item.name }}</span>
        </button>
      </div>

      <div v-if="hasMore" ref="sentinelRef" class="load-more-sentinel" aria-label="Loading more backgrounds">
        <Skeleton width="100%" height="12px" radius="sm" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.options-group { 
  display: flex; 
  flex-direction: column; 
  gap: 12px; 
}
.prop-label { 
  font-size: 12px; 
  font-weight: 600; 
  color: var(--text-secondary); 
}
.canvas-dimensions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.canvas-dimensions label { display: grid; gap: 4px; font-size: 11px; color: var(--text-secondary); }
.canvas-dimensions input { min-width: 0; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-surface); color: var(--text-primary); padding: 6px; }
.canvas-ratio { margin: -4px 0 2px; color: var(--text-muted); font-size: 11px; }
.prop-row { display: flex; align-items: center; justify-content: space-between; }
.file-input { 
  display: none; 
}
.background-grid-scroll { 
  height: 292px; 
  overflow-y: auto; 
  border: 1px solid var(--color-border); 
  border-radius: var(--radius-md); 
  background: var(--color-bg-surface); 
  padding: 6px; 
}
.background-grid { 
  display: grid; 
  grid-template-columns: repeat(3, minmax(0, 1fr)); 
  gap: 6px; 
  width: 100%; 
}
.background-card { 
  min-width: 0; 
  padding: 4px; 
  border: 1px solid transparent; 
  border-radius: var(--radius-sm); 
  background: transparent; 
  color: var(--text-primary); 
  cursor: pointer; 
  text-align: left; 
}
.import-card { 
  display: flex; 
  height: 76px; 
  align-items: center; 
  justify-content: center; 
  gap: 5px; 
  flex-direction: column; 
  border-style: dashed; 
  color: var(--text-muted); 
}
.import-icon { 
  color: var(--text-secondary); 
}
.blur-preview {
  background: linear-gradient(135deg, rgba(255, 90, 31, 0.4) 0%, rgba(99, 102, 241, 0.4) 100%);
  backdrop-filter: blur(8px);
}
.blur-icon {
  color: #fff;
}
.background-card:hover { 
  background: var(--color-bg-surface-hover); 
}
.background-card.active { 
  border-color: var(--color-primary-border); 
  background: var(--color-primary-light); 
}
.background-preview { 
  position: relative; 
  aspect-ratio: 4 / 3; 
  overflow: hidden; 
  border-radius: 4px; 
  background: #000; 
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-media { 
  position: absolute; 
  inset: 0; 
  width: 100%; 
  height: 100%; 
  object-fit: cover; 
  opacity: 0; 
  transition: opacity 120ms ease; 
}
.preview-media.ready { 
  opacity: 1; 
}
.video-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #141416;
  color: var(--text-muted);
}
.placeholder-icon {
  opacity: 0.6;
}
.background-name { 
  display: block; 
  margin-top: 4px; 
  overflow: hidden; 
  color: var(--text-secondary); 
  font-size: 10px; 
  text-overflow: ellipsis; 
  white-space: nowrap; 
}
.load-more-sentinel { 
  height: 32px; 
  padding: 10px 4px; 
}
</style>
