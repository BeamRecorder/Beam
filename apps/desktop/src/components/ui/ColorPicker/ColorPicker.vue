<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import ColorPickerCustom from './ColorPickerCustom.vue';
import Popover from '../popover/Popover.vue';
import Input from '../input/Input.vue';
import Button from '../button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { parseColorHex } from './color-hex';
import type { ColorPickerProps } from './color-picker-types';

const props = withDefaults(defineProps<ColorPickerProps>(), {
  modelValue: '#f57600',
  inline: false,
  hideHeader: true,
  type: 'standard',
  alphaValue: 1,
  showAlpha: false,
  showLabel: false,
  disabled: false,
});
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:alpha': [value: number];
  'drag-start': [];
  'drag-end': [];
}>();
const { t } = useTranslate('ColorPicker');
const displayLabel = computed(() => props.label ?? t('color'));
const pickerContent = ref<HTMLElement | null>(null);
let trigger: HTMLElement | null = null;

function updateColor(value: string | number): void {
  const color = parseColorHex(String(value));
  if (!props.disabled && color) emit('update:modelValue', color);
}
function updateAlpha(value: number): void {
  if (!props.disabled && Number.isFinite(value)) emit('update:alpha', Math.max(0, Math.min(1, value)));
}
function onTrigger(event: MouseEvent): void {
  trigger = event.currentTarget as HTMLElement;
  // Mouse interaction keeps focus on its swatch; keyboard activation enters the picker.
  if (!event.detail) void nextTick(() => pickerContent.value?.querySelector<HTMLInputElement>('input')?.focus());
}
function closePicker(close: () => void): void {
  close();
  trigger?.focus();
}
</script>

<template>
  <div
    class="color-picker-wrapper"
    :class="{ 'is-disabled': disabled }"
    :inert="disabled || undefined"
    :title="disabled ? disabledReason : undefined"
    :data-disabled-reason-key="disabled ? disabledReasonKey : undefined"
  >
    <span v-if="showLabel && !inline" class="color-picker-label">{{ displayLabel }}</span>
    <ColorPickerCustom
      v-if="inline"
      :hide-header="hideHeader"
      :eyedropper-label="eyedropperLabel"
      :format-label="formatLabel"
      :model-value="modelValue"
      :type="type"
      :alpha-value="alphaValue"
      :show-alpha="showAlpha"
      @update:model-value="updateColor"
      @update:alpha="updateAlpha"
      @drag-start="emit('drag-start')"
      @drag-end="emit('drag-end')"
    />
    <div v-else class="color-picker-trigger-container">
      <Popover align="left" :match-trigger-width="false" :disabled="disabled" :gap="4">
        <template #trigger="{ isOpen }">
          <Button
            variant="secondary"
            size="xs"
            icon-only
            :disabled="disabled"
            :aria-label="displayLabel"
            aria-haspopup="dialog"
            :aria-expanded="isOpen"
            @click="onTrigger"
          >
            <template #icon
              ><span class="color-picker-bubble transparency-grid"
                ><span :style="{ background: modelValue, opacity: showAlpha ? alphaValue : 1 }" /></span
            ></template>
          </Button>
        </template>
        <template #default="{ close }">
          <div
            ref="pickerContent"
            class="popover-picker-content"
            role="dialog"
            :aria-label="displayLabel"
            @keydown.esc.stop.prevent="closePicker(close)"
          >
            <ColorPickerCustom
              hide-header
              :eyedropper-label="eyedropperLabel"
              :format-label="formatLabel"
              :model-value="modelValue"
              :type="type"
              :alpha-value="alphaValue"
              :show-alpha="showAlpha"
              flat
              @update:model-value="updateColor"
              @update:alpha="updateAlpha"
              @drag-start="emit('drag-start')"
              @drag-end="emit('drag-end')"
              @close="closePicker(close)"
            />
          </div>
        </template>
      </Popover>
      <div class="color-hex-field">
        <Input
          :model-value="modelValue.toUpperCase()"
          size="xs"
          appearance="neutral"
          commit-on-blur
          :disabled="disabled"
          :aria-label="displayLabel"
          spellcheck="false"
          @update:model-value="updateColor"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.color-picker-wrapper.is-disabled {
  opacity: 0.6;
}
.color-picker-label {
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
.color-picker-trigger-container {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  width: 100%;
}
.color-picker-bubble {
  display: block;
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  overflow: hidden;
}
.color-picker-bubble > span {
  position: absolute;
  inset: 0;
}
.color-hex-field {
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.popover-picker-content {
  max-width: calc(100vw - 32px);
}
</style>
