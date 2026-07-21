<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
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
const loadMoreSentinel = ref<HTMLElement | null>(null)
const pageSize = 24
const columns = 3

const filteredItems = computed(() => props.backgroundGroups
  .filter((group) => activeKind.value === 'image' ? group.kind !== 'video' : group.kind === 'video')
  .flatMap((group) => group.items))
const loadedItems = computed(() => filteredItems.value.slice(0, loadedCount.value))
const gridItems = computed<(BackgroundMedia | null)[]>(() => [null, ...loadedItems.value])
const rows = computed(() => Array.from({ length: Math.ceil(gridItems.value.length / columns) }, (_, index) => gridItems.value.slice(index * columns, index * columns + columns)))
const { list, containerProps, wrapperProps } = useVirtualList(rows, { itemHeight: 108, overscan: 3 })
const hasMore = computed(() => loadedCount.value < filteredItems.value.length)
const rowStyle = (index: number) => ({ position: 'absolute' as const, top: `${index * 108}px`, left: '0' })

const setKind = (kind: Extract<BackgroundMediaKind, 'image' | 'video'>) => { activeKind.value = kind; loadedCount.value = pageSize }
const loadMore = () => { loadedCount.value = Math.min(filteredItems.value.length, loadedCount.value + pageSize) }
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

let loadMoreObserver: IntersectionObserver | null = null
const observeLoadMore = async () => {
  await nextTick()
  loadMoreObserver?.disconnect()
  if (!loadMoreSentinel.value || !hasMore.value) return
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore()
  }, { rootMargin: '160px 0px' })
  loadMoreObserver.observe(loadMoreSentinel.value)
}

onMounted(observeLoadMore)
onBeforeUnmount(() => loadMoreObserver?.disconnect())
watch([loadedCount, activeKind, hasMore], observeLoadMore)
</script>

<template>
  <div class="options-group">
    <label class="prop-label">Background</label>
    <ButtonGroup aria-label="Background type">
      <Button size="sm" :variant="activeKind === 'video' ? 'primary' : 'ghost'" :icon="Video" @click="setKind('video')">Video</Button>
      <Button size="sm" :variant="activeKind === 'image' ? 'primary' : 'ghost'" :icon="Image" @click="setKind('image')">Image</Button>
    </ButtonGroup>

    <input ref="fileInput" class="file-input" type="file" accept="image/*,video/*" @change="importBackground" />
    <div v-bind="containerProps" class="background-grid-scroll">
      <div v-bind="wrapperProps" class="background-grid-wrapper">
        <div v-for="row in list" :key="row.index" class="background-grid-row" :style="rowStyle(row.index)">
          <template v-for="item in row.data" :key="item?.id ?? 'import'">
            <button v-if="!item" type="button" class="background-card import-card" @click="triggerImport">
              <Upload class="import-icon" :size="22" />
              <span class="background-name">Import</span>
            </button>
            <button v-else class="background-card" :class="{ active: item.path === selectedBackground }" type="button" :title="item.name" @click="emit('update:selectedBackground', item.path)">
              <div class="background-preview">
                <Skeleton v-if="!isReady(item.id)" width="100%" height="100%" radius="sm" />
                <video v-if="item.kind === 'video'" :src="item.path" muted playsinline preload="metadata" class="preview-media" :class="{ ready: isReady(item.id) }" @loadeddata="markReady(item.id)" />
                <img v-else :src="item.path" :alt="item.name" loading="lazy" decoding="async" class="preview-media" :class="{ ready: isReady(item.id) }" @load="markReady(item.id)" />
              </div>
              <span class="background-name">{{ item.name }}</span>
            </button>
          </template>
        </div>
      </div>
      <div v-if="hasMore" ref="loadMoreSentinel" class="load-more-sentinel" aria-label="Loading more backgrounds">
        <Skeleton width="100%" height="12px" radius="sm" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.options-group { display: flex; flex-direction: column; gap: 12px; }
.prop-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.file-input { display: none; }
.background-grid-scroll { height: 292px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-surface); padding: 6px; }
.background-grid-wrapper { position: relative; width: 100%; }
.load-more-sentinel { height: 32px; padding: 10px 4px; }
.background-grid-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
.background-card { min-width: 0; padding: 4px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text-primary); cursor: pointer; text-align: left; }
.import-card { display: flex; height: 76px; align-items: center; justify-content: center; gap: 5px; flex-direction: column; border-style: dashed; color: var(--text-muted); }
.import-icon { color: var(--text-secondary); }
.background-card:hover { background: var(--color-bg-surface-hover); }
.background-card.active { border-color: var(--color-primary-border); background: var(--color-primary-light); }
.background-preview { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 4px; background: #000; }
.preview-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 120ms ease; }
.preview-media.ready { opacity: 1; }
.background-name { display: block; margin-top: 4px; overflow: hidden; color: var(--text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
</style>
