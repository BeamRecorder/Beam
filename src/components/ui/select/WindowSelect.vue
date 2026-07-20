<script setup lang="ts">
import { computed } from 'vue'
import { useVirtualList } from '@vueuse/core'
import Popover from '../popover/Popover.vue'
import Skeleton from '../skeleton/Skeleton.vue'
import { ChevronDown, Check } from '@lucide/vue'

interface WindowOption {
  id: string
  name: string
  thumbnail: string
  appIcon?: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null
    options: WindowOption[]
    placeholder?: string
    disabled?: boolean
    direction?: 'up' | 'down'
  }>(),
  {
    placeholder: 'Select a window',
    disabled: false,
    direction: 'down',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'toggle', isOpen: boolean): void
}>()

const selectedOption = computed(() => {
  return props.options.find(opt => opt.id === props.modelValue) || null
})

const handleSelect = (option: WindowOption, close: () => void) => {
  if (props.disabled) return
  emit('update:modelValue', option.id)
  close()
}

// Virtual list configuration
const { list, containerProps, wrapperProps } = useVirtualList(
  computed(() => props.options),
  {
    itemHeight: 52, // 44px thumbnail aspect height + padding
  }
)

const labelStyle = computed(() => {
  const text = selectedOption.value ? selectedOption.value.name : props.placeholder
  const len = text.length
  if (len > 28) return { fontSize: '0.75rem' }
  if (len > 20) return { fontSize: '0.85rem' }
  return {}
})
</script>

<template>
  <Popover align="left" :direction="direction" :block="true" class="select-popover" @toggle="$emit('toggle', $event)">
    <template #trigger="{ isOpen }">
      <button 
        type="button" 
        class="select-trigger" 
        :class="{ 'is-open': isOpen, 'is-disabled': disabled }" 
        :disabled="disabled"
      >
        <div class="trigger-content-wrapper">
          <div class="selected-thumbnail-wrapper">
            <template v-if="selectedOption">
              <img :src="selectedOption.thumbnail" class="trigger-thumbnail-img" />
              <img v-if="selectedOption.appIcon" :src="selectedOption.appIcon" class="trigger-app-icon" />
            </template>
            <template v-else>
              <Skeleton variant="linear" width="100%" height="100%" />
            </template>
          </div>
          <span 
            class="select-label" 
            :class="{ 'is-placeholder': !selectedOption }"
            :style="labelStyle"
          >
            {{ selectedOption ? selectedOption.name : placeholder }}
          </span>
        </div>
        <ChevronDown class="select-chevron" :class="{ 'rotate': isOpen }" />
      </button>
    </template>
    
    <template #default="{ close }">
      <div v-if="options.length === 0" class="options-empty">
        No windows detected
      </div>
      <div v-else v-bind="containerProps" class="virtual-scroll-container">
        <ul v-bind="wrapperProps" class="select-options">
          <li 
            v-for="item in list" 
            :key="item.data.id" 
            class="select-option"
            :class="{ 'is-selected': item.data.id === modelValue }"
            @click="handleSelect(item.data, close)"
            style="height: 52px;"
          >
            <div class="option-content">
              <div class="thumbnail-wrapper">
                <img :src="item.data.thumbnail" class="thumbnail-img" />
                <img v-if="item.data.appIcon" :src="item.data.appIcon" class="app-icon" />
              </div>
              <span class="option-label">{{ item.data.name }}</span>
            </div>
            <Check v-if="item.data.id === modelValue" class="option-check" />
          </li>
        </ul>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.select-popover {
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 80px;
  height: 2.75rem;
  padding: 0.4rem 0.8rem;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 1rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.select-trigger:hover:not(.is-disabled) {
  border-color: var(--color-border-strong);
}

.select-trigger.is-open {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.select-trigger.is-disabled {
  background-color: var(--color-bg-surface);
  color: var(--text-muted);
  cursor: not-allowed;
}

.trigger-content-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex: 1;
}

.selected-thumbnail-wrapper {
  position: relative;
  width: 38px;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.trigger-thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.trigger-app-icon {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 1px;
}

.select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-label.is-placeholder {
  color: var(--text-muted);
}

.select-chevron {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--text-secondary);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.select-chevron.rotate {
  transform: rotate(180deg);
}

.virtual-scroll-container {
  height: 200px;
  overflow-y: auto;
  width: 100%;
}

.select-options {
  list-style: none;
  padding: 0 4px;
  margin: 0;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.select-option:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.select-option.is-selected {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.option-content {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  flex: 1;
}

.thumbnail-wrapper {
  position: relative;
  width: 60px;
  height: 38px;
  background: #0f172a;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-icon {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 2px;
  padding: 1px;
}

.option-label {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-check {
  width: 1rem;
  height: 1rem;
  color: var(--color-primary);
  flex-shrink: 0;
}

.options-empty {
  padding: 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
