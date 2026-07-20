<script setup lang="ts">
import type { BackgroundMediaGroup } from '../composables/backgroundMedia'

const props = defineProps<{
  selectedBackground: string | null
  backgroundGroups: BackgroundMediaGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedBackground', value: string): void
}>()
</script>

<template>
  <div class="options-group">
    <label class="prop-label">Background</label>
    <div v-if="props.backgroundGroups.length" class="background-groups">
      <section v-for="group in props.backgroundGroups" :key="group.kind" class="background-group">
        <h4 class="group-label">{{ group.label }}</h4>
        <ul class="background-list">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="background-item"
            :class="{ active: item.path === props.selectedBackground }"
            @click="emit('update:selectedBackground', item.path)"
          >
            <div class="background-preview">
              <video
                v-if="item.kind === 'video'"
                :src="item.path"
                muted
                loop
                playsinline
                preload="metadata"
                class="preview-media"
              />
              <img v-else :src="item.path" :alt="item.name" class="preview-media" />
            </div>
            <span class="background-name">{{ item.name }}</span>
          </li>
        </ul>
      </section>
    </div>
    <p v-else class="empty-state">No background media found in public/.</p>
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

.background-groups {
  height: 280px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  width: 100%;
}

.background-group {
  padding: 8px 4px 0;
}

.group-label {
  margin: 0 8px 4px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.background-list {
  list-style: none;
  padding: 4px;
  margin: 0;
}

.background-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  height: 56px;
  transition: background-color 0.15s ease;
}

.background-item:hover {
  background-color: var(--color-bg-surface-hover);
}

.background-item.active {
  background-color: var(--color-primary-light);
  border: 1px solid var(--color-primary-border);
}

.background-preview {
  width: 64px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: #000;
  flex-shrink: 0;
}

.preview-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
