<script setup lang="ts">
import { computed } from 'vue'
import { Crop, Check } from '@lucide/vue'
import PopoverMenuButton from '../../ui/popover/PopoverMenuButton.vue'
import Button from '../../ui/button/Button.vue'
import type { OutputCanvasPreset } from './output-canvas'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('CanvasToolbar')

const props = defineProps<{ preset: OutputCanvasPreset; canCrop: boolean; isCropping: boolean }>()
const emit = defineEmits<{ (event: 'select:preset', preset: Exclude<OutputCanvasPreset, 'custom'>): void; (event: 'toggle:crop'): void }>()
const presets: Exclude<OutputCanvasPreset, 'custom'>[] = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9']
const items = computed(() => presets.map((id) => ({ id, label: id, active: props.preset === id })))
</script>

<template>
  <div class="canvas-toolbar">
    <PopoverMenuButton transparent :label="preset" :aria-label="t('formatPreset', { preset })" :items="items" @select="emit('select:preset', $event as Exclude<OutputCanvasPreset, 'custom'>)" />
    <Button
      class="crop-button"
      :variant="isCropping ? 'primary' : 'outline'"
      size="xs"
      :icon="isCropping ? Check : Crop"
      :disabled="!canCrop"
      :tooltip="canCrop ? (isCropping ? t('confirmCrop') : t('cropSelected')) : t('selectElementToCrop')"
      @click="emit('toggle:crop')"
    >
      {{ isCropping ? t('ok') : t('crop') }}
    </Button>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  position: relative;
  z-index: 3;
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  background: transparent;
}

.canvas-toolbar :deep(.btn-container) {
  display: inline-flex;
  align-items: center;
  height: 28px;
}

.canvas-toolbar :deep(.crop-button),
.canvas-toolbar :deep(.btn) {
  height: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  padding: 0 10px !important;
  font: 600 12px var(--font-sans) !important;
  border-radius: var(--radius-md) !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  background: transparent;
  box-shadow: var(--shadow-sm);
}

.canvas-toolbar :deep(.crop-button:hover:not(:disabled)) {
  background: var(--color-primary-light) !important;
  border-color: var(--color-primary) !important;
  color: var(--color-primary) !important;
}
</style>
