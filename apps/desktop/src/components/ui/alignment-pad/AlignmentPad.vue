<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dot, Plus } from '@lucide/vue';
import Button from '../button/Button.vue';
import type { AlignmentPadLabels, AlignmentPoint } from './alignment-pad-types';

const props = defineProps<{
  modelValue: AlignmentPoint | null;
  labels: AlignmentPadLabels;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: AlignmentPoint] }>();
const root = ref<HTMLElement | null>(null);
const axes = [0, 0.5, 1] as const;
const choices = computed(() =>
  axes.flatMap((y) =>
    axes.map((x) => ({
      x,
      y,
      label: `${[props.labels.top, props.labels.middle, props.labels.bottom][y * 2]}, ${[props.labels.left, props.labels.center, props.labels.right][x * 2]}`,
    })),
  ),
);
const active = (point: AlignmentPoint) => props.modelValue?.x === point.x && props.modelValue.y === point.y;
const choose = (point: AlignmentPoint) => {
  if (!props.disabled) emit('update:modelValue', { x: point.x, y: point.y });
};
const navigate = (event: KeyboardEvent, index: number) => {
  if (props.disabled) return;
  const col = index % 3,
    row = Math.floor(index / 3);
  const next =
    event.key === 'ArrowLeft'
      ? row * 3 + Math.max(0, col - 1)
      : event.key === 'ArrowRight'
        ? row * 3 + Math.min(2, col + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, row - 1) * 3 + col
          : event.key === 'ArrowDown'
            ? Math.min(2, row + 1) * 3 + col
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? 8
                : null;
  if (next === null) return;
  event.preventDefault();
  root.value?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  choose(choices.value[next]!);
};
</script>

<template>
  <div ref="root" class="alignment-pad" role="group" :aria-label="labels.group">
    <Button
      v-for="(point, index) in choices"
      :key="index"
      :variant="active(point) ? 'selected' : 'ghost'"
      size="xs"
      icon-only
      :icon="active(point) ? Plus : Dot"
      :disabled="disabled"
      :aria-pressed="active(point)"
      :aria-label="point.label"
      :title="point.label"
      :style="{
        width: '24px',
        height: '24px',
        padding: '0',
        ...(active(point) ? { color: 'var(--color-primary)' } : {}),
      }"
      @click="choose(point)"
      @keydown="navigate($event, index)"
    />
  </div>
</template>

<style scoped>
.alignment-pad {
  display: grid;
  grid-template-columns: repeat(3, 24px);
  gap: 2px;
  padding: 4px;
  width: fit-content;
  box-sizing: border-box;
  border-radius: var(--radius-md);
  background: var(--color-bg-field);
}
</style>
