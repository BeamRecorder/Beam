<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Image, Upload, Video } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import { backgroundKindFor, type BackgroundMedia, type BackgroundMediaGroup, type BackgroundMediaKind } from '../composables/backgroundMedia'

const props = defineProps<{ selectedBackground: string | null; backgroundGroups: BackgroundMediaGroup[] }>()
const emit = defineEmits<{ (e: 'update:selectedBackground', value: string): void; (e: 'import:background', value: BackgroundMedia): void }>()

const activeKind = ref<Extract<BackgroundMediaKind, 'image' | 'video'>>('image')
const loadedCount = ref(24)
const previewReady = ref(new Set<string>())
const fileInput = ref<HTMLInputElement | null>(null)
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
const triggerImport = () => fileInput.value?.click()

const importBackground = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const kind = backgroundKindFor(file.name)
  if (!kind) return
  const path = URL.createObjectURL(file)
  emit('import:background', { id: `import:${path}`, name: file.name.replace(/\.[^.]+$/, ''), path, extension: file.name.split('.').pop()?.toLowerCase() ?? '', kind })
  ;(event.target as HTMLInputElement).value = ''
}

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
    <label class="prop-label">Background</label>
    <ButtonGroup aria-label="Background type">
      <Button size="sm" :variant="activeKind === 'video' ? 'primary' : 'ghost'" :icon="Video" @click="setKind('video')">Video</Button>
      <Button size="sm" :variant="activeKind === 'image' ? 'primary' : 'ghost'" :icon="Image" @click="setKind('image')">Image</Button>
    </ButtonGroup>

    <input ref="fileInput" class="file-input" type="file" accept="image/*,video/*" @change="importBackground" />
    
    <div class="background-grid-scroll">
      <div class="background-grid">
        <!-- Import Card -->
        <button type="button" class="background-card import-card" @click="triggerImport">
          <Upload class="import-icon" :size="22" />
          <span class="background-name">Import</span>
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
