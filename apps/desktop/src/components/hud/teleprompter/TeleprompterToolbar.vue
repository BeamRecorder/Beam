<script setup lang="ts">
import { computed, ref } from 'vue';
import { Blend, Gauge, Palette, Pause, Pencil, Play, RotateCcw, Type } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Slider from '~/ui/slider/Slider.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import TeleprompterControl from './TeleprompterControl.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { TELEPROMPTER_FONT_SIZE } from './teleprompter-types';
import type { TeleprompterDocument } from './teleprompter-types';

const props = defineProps<{
  document: TeleprompterDocument;
  editing: boolean;
  playing: boolean;
  defaultTextColor: string;
}>();
const emit = defineEmits<{
  update: [patch: Partial<TeleprompterDocument>];
  reset: [];
  edit: [];
  play: [];
}>();
const { t } = useTranslate('Teleprompter');
const openControls = ref(new Set<string>());
const tooltipDisabled = computed(() => openControls.value.size > 0);
const setOpen = (control: string, open: boolean) => {
  if (open) openControls.value.add(control);
  else openControls.value.delete(control);
};
const color = computed(() => props.document.textColor ?? props.defaultTextColor);
</script>

<template>
  <nav class="teleprompter-toolbar" :aria-label="t('playbackControls')">
    <TeleprompterControl
      :label="t('speed')"
      :icon="Gauge"
      :tooltip-disabled="tooltipDisabled"
      @toggle="setOpen('speed', $event)"
    >
      <Slider
        :model-value="document.scrollSpeed"
        :min="5"
        :max="200"
        size="compact"
        value-suffix=" px/s"
        :label="t('speed')"
        @update:model-value="emit('update', { scrollSpeed: $event })"
      />
    </TeleprompterControl>
    <TeleprompterControl
      :label="t('fontSize')"
      :icon="Type"
      :tooltip-disabled="tooltipDisabled"
      @toggle="setOpen('font', $event)"
    >
      <Slider
        :model-value="document.fontSize"
        :min="16"
        :max="TELEPROMPTER_FONT_SIZE"
        size="compact"
        value-suffix=" px"
        :label="t('fontSize')"
        @update:model-value="emit('update', { fontSize: $event })"
      />
    </TeleprompterControl>
    <TeleprompterControl
      :label="t('textColor')"
      :icon="Palette"
      :tooltip-disabled="tooltipDisabled"
      @toggle="setOpen('color', $event)"
    >
      <ColorPicker
        :model-value="color"
        :label="t('textColor')"
        :show-label="false"
        :eyedropper-label="t('eyedropper')"
        :format-label="t('colorFormat')"
        type="triangle"
        inline
        hide-header
        @update:model-value="emit('update', { textColor: $event })"
      />
    </TeleprompterControl>
    <TeleprompterControl
      :label="t('transparency')"
      :icon="Blend"
      :tooltip-disabled="tooltipDisabled"
      @toggle="setOpen('opacity', $event)"
    >
      <Slider
        :model-value="Math.round((1 - (document.windowOpacity ?? 1)) * 100)"
        :min="0"
        :max="80"
        size="compact"
        value-suffix="%"
        :label="t('transparency')"
        @update:model-value="emit('update', { windowOpacity: (100 - $event) / 100 })"
      />
    </TeleprompterControl>
    <Button
      style="width: var(--teleprompter-button-size); height: var(--teleprompter-button-size)"
      variant="ghost"
      size="sm"
      icon-only
      :icon="RotateCcw"
      :aria-label="t('reset')"
      :tooltip="t('reset')"
      :tooltip-disabled="tooltipDisabled"
      @click="emit('reset')"
    />
    <span class="toolbar-divider" aria-hidden="true" />
    <Button
      v-if="!editing"
      style="width: var(--teleprompter-button-size); height: var(--teleprompter-button-size)"
      variant="ghost"
      size="sm"
      icon-only
      :icon="Pencil"
      :aria-label="t('edit')"
      :tooltip="t('edit')"
      :tooltip-disabled="tooltipDisabled"
      @click="emit('edit')"
    />
    <Button
      style="width: var(--teleprompter-button-size); height: var(--teleprompter-button-size)"
      variant="primary"
      size="sm"
      icon-only
      :icon="playing ? Pause : Play"
      :aria-label="playing ? t('pause') : t('play')"
      :tooltip="playing ? t('pause') : t('play')"
      :tooltip-disabled="tooltipDisabled"
      @click="emit('play')"
    />
  </nav>
</template>

<style scoped>
.teleprompter-toolbar {
  --teleprompter-button-size: 32px;
  position: absolute;
  z-index: 3;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 3px;
  width: max-content;
  max-width: calc(100% - 16px);
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-surface) 82%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-md);
  -webkit-app-region: no-drag;
}
.toolbar-divider {
  width: 1px;
  height: 20px;
  margin: 0 3px;
  background: var(--color-border-strong);
}
@media (max-width: 270px) {
  .teleprompter-toolbar {
    --teleprompter-button-size: 28px;
    gap: 0;
    padding: 4px;
  }
  .toolbar-divider {
    margin: 0 2px;
  }
}
</style>
