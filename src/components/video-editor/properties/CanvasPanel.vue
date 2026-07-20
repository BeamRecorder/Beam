<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import { WALLPAPERS } from '../composables/useVideoPlayer'

defineProps<{
  selectedWallpaper: string
}>()

const emit = defineEmits<{
  (e: 'update:selectedWallpaper', value: string): void
}>()

const { list, containerProps, wrapperProps } = useVirtualList(
  WALLPAPERS,
  {
    itemHeight: 56,
  }
)
</script>

<template>
  <div class="options-group">
    <label class="prop-label">Desktop Wallpaper</label>
    <div v-bind="containerProps" class="wallpaper-scroll-container">
      <ul v-bind="wrapperProps" class="wallpaper-list">
        <li 
          v-for="item in list" 
          :key="item.data.path" 
          class="wallpaper-item"
          :class="{ active: item.data.path === selectedWallpaper }"
          @click="emit('update:selectedWallpaper', item.data.path)"
        >
          <div class="wallpaper-preview">
            <img :src="item.data.path" class="preview-img" />
          </div>
          <span class="wallpaper-name">{{ item.data.name }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.wallpaper-scroll-container {
  height: 280px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-light-blue);
  width: 100%;
}

.wallpaper-list {
  list-style: none;
  padding: 4px;
  margin: 0;
}

.wallpaper-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  height: 56px;
  transition: background-color 0.15s ease;
}

.wallpaper-item:hover {
  background-color: var(--color-light-blue-hover);
}

.wallpaper-item.active {
  background-color: var(--color-orange-light);
  border: 1px solid var(--color-orange-border);
}

.wallpaper-preview {
  width: 64px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: #000;
  flex-shrink: 0;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wallpaper-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
