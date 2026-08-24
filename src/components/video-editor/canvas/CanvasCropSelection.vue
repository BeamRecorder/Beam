<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { Check } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ containerStyle: CSSProperties; overlayStyle: CSSProperties }>();
const emit = defineEmits<{
  (event: 'move-start', value: PointerEvent): void;
  (event: 'move', value: PointerEvent): void;
  (event: 'move-end', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
  (event: 'done'): void;
}>();
const { t } = useTranslate('EditorCanvas');
</script>

<template>
  <div class="crop-container" :style="containerStyle">
    <div class="crop-mask-wrapper">
      <div class="crop-mask-hole" :style="overlayStyle" />
    </div>
    <div
      class="crop-overlay-box"
      :style="overlayStyle"
      @pointerdown="emit('move-start', $event)"
      @pointermove="emit('move', $event)"
      @pointerup="emit('move-end', $event)"
      @pointercancel="emit('move-end', $event)"
    >
      <div class="crop-grid">
        <div class="grid-line vertical line-1" />
        <div class="grid-line vertical line-2" />
        <div class="grid-line horizontal line-1" />
        <div class="grid-line horizontal line-2" />
      </div>
      <div class="crop-done-wrapper" @pointerdown.stop @mousedown.stop>
        <Button variant="primary" size="xs" :icon="Check" class="crop-ok-button" @click.stop="emit('done')">
          {{ t('ok') }}
        </Button>
      </div>
      <ResizeHandle
        @resize-start="(corner, event) => emit('resize-start', corner, event)"
        @resize-move="(_corner, event) => emit('resize-move', event)"
        @resize-end="(_corner, event) => emit('resize-end', event)"
      />
    </div>
  </div>
</template>

<style scoped>
.crop-container {
  position: absolute;
  z-index: 20;
  pointer-events: none;
}
.crop-mask-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: var(--radius-sm, 4px);
}
.crop-mask-hole {
  position: absolute;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
.crop-overlay-box {
  position: absolute;
  border: 2px solid var(--color-primary, #ff5a1f);
  cursor: move;
  box-sizing: border-box;
  pointer-events: auto;
}
.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.35);
}
.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.grid-line.vertical.line-1 {
  left: 33.333%;
}
.grid-line.vertical.line-2 {
  left: 66.666%;
}
.grid-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
}
.grid-line.horizontal.line-1 {
  top: 33.333%;
}
.crop-done-wrapper {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 10;
  white-space: nowrap;
  pointer-events: auto;
}
</style>
