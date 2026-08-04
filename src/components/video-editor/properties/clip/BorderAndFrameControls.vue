<script setup lang="ts">
import { computed } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Input from '~/ui/input/Input.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { ClipFrame } from '../../composition/composition-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('BorderAndFrameControls');

const props = defineProps<{
  borderEnabled?: boolean;
  borderColor?: string;
  borderWidth?: number;
  frame?: ClipFrame;
  frameTitle?: string;
  frameColor?: string;
  frameShowMenu?: boolean;
  frameShowScrollbars?: boolean;
  frameChromeScale?: number;
}>();
const emit = defineEmits<{
  (
    event: 'update',
    value: {
      borderEnabled?: boolean;
      borderColor?: string;
      borderWidth?: number;
      frame?: ClipFrame;
      frameTitle?: string;
      frameColor?: string;
      frameShowMenu?: boolean;
      frameShowScrollbars?: boolean;
      frameChromeScale?: number;
    },
  ): void;
}>();
const activeFrame = computed(() => props.frame ?? 'none');
const frames = computed(() => [
  { id: 'none' as ClipFrame, label: t('none') },
  { id: 'safari' as ClipFrame, label: 'Safari' },
  { id: 'windows-95' as ClipFrame, label: 'Windows 95' },
]);
</script>

<template>
  <div class="appearance-controls">
    <div class="section-header">
      <span class="section-title">{{ t('border') }}</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">{{ t('showBorder') }}</span>
      <Switch :model-value="borderEnabled ?? false" @update:modelValue="emit('update', { borderEnabled: $event })" />
    </div>
    <div v-if="borderEnabled" class="sub-group margin-top-sm">
      <span class="sub-label">{{ t('borderColor') }}</span>
      <ColorPicker
        :model-value="borderColor ?? '#000000'"
        :show-label="false"
        @update:modelValue="emit('update', { borderColor: $event })"
      />
      <BigSlider
        :model-value="borderWidth ?? 1"
        :min="1"
        :max="32"
        :step="1"
        :label="t('width')"
        :format-value="(value) => `${Math.round(value)}px`"
        @update:modelValue="emit('update', { borderWidth: $event })"
      />
    </div>
    <Divider spacing="sm" />
    <div class="section-header">
      <span class="section-title">{{ t('frame') }}</span>
    </div>
    <ButtonGroup full>
      <Button
        v-for="item in frames"
        :key="item.id"
        :variant="activeFrame === item.id ? 'primary' : 'ghost'"
        size="xs"
        @click="emit('update', { frame: item.id })"
        >{{ item.label }}</Button
      >
    </ButtonGroup>
    <div v-if="activeFrame !== 'none'" class="sub-group margin-top-sm">
      <label class="sub-label" for="frame-title">{{ t('windowTitle') }}</label>
      <Input
        id="frame-title"
        :model-value="frameTitle ?? ''"
        :placeholder="t('screenRecording')"
        @update:modelValue="emit('update', { frameTitle: String($event) })"
      />
      <BigSlider
        :model-value="(frameChromeScale ?? 1) * 100"
        :min="50"
        :max="200"
        :step="5"
        :label="t('windowSize')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:modelValue="emit('update', { frameChromeScale: $event / 100 })"
      />
      <template v-if="activeFrame === 'windows-95'">
        <span class="sub-label">{{ t('windowColor') }}</span>
        <ColorPicker
          :model-value="frameColor ?? '#c0c0c0'"
          :show-label="false"
          @update:modelValue="emit('update', { frameColor: $event })"
        />
        <div class="prop-row">
          <span class="prop-label">{{ t('menuBar') }}</span
          ><Switch
            :model-value="frameShowMenu ?? true"
            @update:modelValue="emit('update', { frameShowMenu: $event })"
          />
        </div>
        <div class="prop-row">
          <span class="prop-label">{{ t('scrollbars') }}</span
          ><Switch
            :model-value="frameShowScrollbars ?? true"
            @update:modelValue="emit('update', { frameShowScrollbars: $event })"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.appearance-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.section-header {
  display: flex;
  align-items: center;
  min-height: 20px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.prop-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.sub-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.margin-top-sm {
  margin-top: 4px;
}
.margin-top-md {
  margin-top: 8px;
}
</style>
