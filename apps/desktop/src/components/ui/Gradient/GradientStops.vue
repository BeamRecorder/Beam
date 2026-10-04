<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { clampGradientPosition, gradientCss, gradientStopColor } from './gradient-stops';
import { useGradientDrag } from './composables/useGradientDrag';
import type { GradientStop, GradientStopsProps } from './gradient-types';

const props = defineProps<GradientStopsProps>();
const emit = defineEmits<{
  select: [id: string];
  add: [position: number];
  move: [id: string, position: number];
  remove: [id: string];
}>();
const { t } = useTranslate('Gradient');
const track = ref<HTMLElement | null>(null);
const fill = computed(() => gradientCss({ stops: props.stops }, true));
const { draggingId, start } = useGradientDrag(
  props,
  track,
  (id) => emit('select', id),
  (id, position) => emit('move', id, position),
);

function add(event: PointerEvent): void {
  if (!props.canAdd || props.disabled || event.button !== 0 || !event.isPrimary) return;
  const bounds = track.value?.getBoundingClientRect();
  if (bounds?.width && Number.isFinite(event.clientX))
    emit('add', clampGradientPosition((event.clientX - bounds.left) / bounds.width));
}

function onKeyDown(event: KeyboardEvent, stop: GradientStop): void {
  if (props.disabled) return;
  const increment = event.shiftKey ? 0.1 : 0.01;
  const position =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? 1
        : ['ArrowLeft', 'ArrowDown'].includes(event.key)
          ? stop.position - increment
          : ['ArrowRight', 'ArrowUp'].includes(event.key)
            ? stop.position + increment
            : null;
  if (position !== null) {
    event.preventDefault();
    emit('select', stop.id);
    emit('move', stop.id, clampGradientPosition(position));
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    emit('remove', stop.id);
  }
}
</script>

<template>
  <div class="gradient-stops" :class="{ 'is-disabled': disabled }">
    <div ref="track" class="gradient-track">
      <div
        class="gradient-track-bar transparency-grid"
        :class="{ 'can-add': canAdd }"
        :title="t('addAtPosition')"
        @pointerdown="add"
      >
        <div class="gradient-track-fill" :style="{ background: fill }" />
      </div>
      <div
        v-for="(stop, index) in stops"
        :key="stop.id"
        class="stop-handle"
        :class="{ 'is-selected': selectedId === stop.id, 'is-dragging': draggingId === stop.id }"
        :style="{ left: `${stop.position * 100}%` }"
      >
        <Button
          size="xs"
          icon-only
          :variant="selectedId === stop.id ? 'selected' : 'secondary'"
          :disabled="disabled"
          :style="{ cursor: draggingId === stop.id ? 'grabbing' : 'grab', touchAction: 'none' }"
          role="slider"
          :aria-label="t('stop', { number: index + 1 })"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="Number((stop.position * 100).toFixed(2))"
          :aria-valuetext="`${Number((stop.position * 100).toFixed(2))}%`"
          :aria-orientation="'horizontal'"
          @pointerdown="start($event, stop)"
          @click="emit('select', stop.id)"
          @keydown="onKeyDown($event, stop)"
        >
          <template #icon
            ><span class="stop-swatch transparency-grid"><span :style="{ background: gradientStopColor(stop) }" /></span
          ></template>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gradient-stops {
  padding: 0 12px;
}
.gradient-track {
  position: relative;
  height: 46px;
}
.gradient-track-bar {
  position: absolute;
  top: 0;
  width: 100%;
  height: 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-strong);
  overflow: hidden;
}
.gradient-track-bar.can-add {
  cursor: crosshair;
}
.gradient-track-fill,
.stop-swatch > span {
  position: absolute;
  inset: 0;
}
.stop-handle {
  position: absolute;
  top: 20px;
  transform: translate3d(-50%, 0, 0);
  touch-action: none;
}
.stop-handle.is-selected {
  z-index: 1;
}
.stop-handle.is-dragging {
  z-index: 2;
  cursor: grabbing;
}
.stop-swatch {
  position: relative;
  display: block;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-xs);
  overflow: hidden;
}
.is-disabled {
  opacity: 0.6;
}
</style>
