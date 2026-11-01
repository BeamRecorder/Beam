<script setup lang="ts">
import type { CropPixels } from '@beam/engine/shared/crop-types';
import { nextTick, ref, watch, type CSSProperties } from 'vue';
import { Check, Settings2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { useTranslate } from '~/i18n/useTranslate';
import Popover from '~/ui/popover/Popover.vue';
import CropNumericFields from './CropNumericFields.vue';
import { useCropHudPosition } from './composables/useCropHudPosition';
import type { NormalizedCrop } from '@beam/engine/shared/composition-types';
import '~/ui/floating-surface.css';

const props = defineProps<{
  containerStyle: CSSProperties;
  overlayStyle: CSSProperties;
  measurements?: CropPixels | null;
}>();
const emit = defineEmits<{
  (event: 'move-start', value: PointerEvent): void;
  (event: 'move', value: PointerEvent): void;
  (event: 'move-end', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
  (event: 'done'): void;
  (event: 'crop-edit', value: NormalizedCrop): void;
}>();
const { t } = useTranslate('EditorCanvas');
const overlay = ref<HTMLElement | null>(null);
const hud = ref<HTMLElement | null>(null);
const numeric = ref<InstanceType<typeof CropNumericFields> | null>(null);
const blurCropField = () => {
  numeric.value?.flush();
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.closest('.crop-numeric-fields')) active.blur();
};
const finish = () => {
  numeric.value?.flush();
  emit('done');
};
const { hudStyle, scheduleHudPosition } = useCropHudPosition(overlay, hud);
watch(
  () => [props.containerStyle, props.overlayStyle, props.measurements],
  () => void nextTick(scheduleHudPosition),
  { deep: true, flush: 'post' },
);
</script>

<template>
  <div class="crop-container" :style="containerStyle">
    <div class="crop-mask-wrapper">
      <div class="crop-mask-hole" :style="overlayStyle" />
    </div>
    <div
      ref="overlay"
      class="crop-overlay-box"
      :style="overlayStyle"
      @pointerdown="emit('move-start', $event)"
      @pointermove="emit('move', $event)"
      @pointerup="emit('move-end', $event)"
      @pointercancel="emit('move-end', $event)"
      @lostpointercapture="emit('move-end', $event)"
    >
      <div class="crop-grid">
        <div class="grid-line vertical line-1" />
        <div class="grid-line vertical line-2" />
        <div class="grid-line horizontal line-1" />
        <div class="grid-line horizontal line-2" />
      </div>
      <ResizeHandle
        @resize-start="(corner, event) => emit('resize-start', corner, event)"
        @resize-move="(_corner, event) => emit('resize-move', event)"
        @resize-end="(_corner, event) => emit('resize-end', event)"
      />
    </div>
    <Teleport to="body">
      <div
        ref="hud"
        class="crop-hud floating-surface"
        :class="{ 'has-measurements': measurements }"
        :style="hudStyle"
        @pointerdown.stop
        @mousedown.stop
      >
        <div v-if="measurements" class="crop-hud-measurements" aria-hidden="true">
          <strong class="crop-dimensions">{{ measurements.width }} × {{ measurements.height }} px</strong>
          <span class="crop-hud-divider" />
          <span class="crop-measurement">↑ {{ measurements.top }}</span>
          <span class="crop-measurement">→ {{ measurements.right }}</span>
          <span class="crop-measurement">↓ {{ measurements.bottom }}</span>
          <span class="crop-measurement">← {{ measurements.left }}</span>
        </div>
        <Popover v-if="measurements" direction="up" :match-trigger-width="false" @toggle="!$event && numeric?.flush()">
          <template #trigger="{ isOpen }">
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Settings2"
              :aria-label="t('editCrop')"
              :tooltip="t('editCrop')"
              aria-haspopup="dialog"
              :aria-expanded="isOpen"
            />
          </template>
          <CropNumericFields ref="numeric" :measurements="measurements" @update="emit('crop-edit', $event)" />
        </Popover>
        <Button
          variant="primary"
          size="xs"
          :icon="Check"
          class="crop-ok-button"
          @pointerdown.stop="blurCropField"
          @click.stop="finish"
        >
          {{ t('ok') }}
        </Button>
      </div>
    </Teleport>
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
.grid-line.horizontal.line-2 {
  top: 66.666%;
}
.crop-hud {
  position: fixed;
  z-index: 2100;
  display: flex;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.crop-hud-measurements {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding-left: 5px;
  color: var(--text-primary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.crop-dimensions {
  font-weight: 650;
}
.crop-measurement {
  color: var(--text-secondary);
}
.crop-hud-divider {
  width: 1px;
  height: 14px;
  background: var(--color-border);
}
.crop-ok-button {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .crop-hud.has-measurements {
    align-items: stretch;
  }
  .crop-hud-measurements {
    flex-wrap: wrap;
    gap: 3px 7px;
    white-space: normal;
  }
  .crop-hud-divider {
    display: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .crop-hud {
    --floating-surface-background: var(--color-bg-surface);
    --popover-backdrop-filter: none;
  }
}
</style>
