<script setup lang="ts">
import { computed } from 'vue'
import { CircleDot, MoveDown, MoveDownRight, MoveUpLeft } from '@lucide/vue'
import type { ShadowDirection } from './shadow-types'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('ShadowDirectionGroup')

defineProps<{ modelValue: ShadowDirection }>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: ShadowDirection): void
}>()

const directions = computed(() => [
  { id: 'all' as const, label: t('around'), icon: CircleDot },
  { id: 'bottom' as const, label: t('bottom'), icon: MoveDown },
  { id: 'bottom-right' as const, label: t('bottomRight'), icon: MoveDownRight },
  { id: 'top-left' as const, label: t('topLeft'), icon: MoveUpLeft },
])
</script>

<template>
  <div class="direction-group" :aria-label="t('shadowDirection')">
    <button
      v-for="direction in directions"
      :key="direction.id"
      type="button"
      class="direction-btn"
      :class="{ active: modelValue === direction.id }"
      :title="direction.label"
      :aria-label="direction.label"
      @click="emit('update:modelValue', direction.id)"
    >
      <component :is="direction.icon" :size="15" />
    </button>
  </div>
</template>

<style scoped>
.direction-group {
  display: flex;
  gap: 4px;
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px;
  box-sizing: border-box;
}

.direction-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  height: 26px;
  cursor: pointer;
  color: var(--text-secondary);
  transition:
    background var(--fast) ease,
    color var(--fast) ease;
}

.direction-btn:hover {
  background: var(--color-bg-surface);
  color: var(--text-primary);
}

.direction-btn.active {
  background: var(--color-primary);
  color: white;
}
</style>
