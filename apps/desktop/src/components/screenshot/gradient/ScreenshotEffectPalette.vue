<script setup lang="ts">
import { ref, watch } from 'vue';
import Gradient from '~/ui/Gradient/Gradient.vue';
import type { GradientValue } from '~/ui/Gradient/gradient-types';
import type { EffectPaletteProps } from './gradient-panel-types';

const props = defineProps<EffectPaletteProps>();
const emit = defineEmits<{ update: [colors: string[]] }>();
const palette = ref<GradientValue>({ stops: [] });
watch(
  () => props.colors,
  (colors) => {
    if (
      colors.length === palette.value.stops.length &&
      colors.every((color, index) => color === palette.value.stops[index]!.color)
    )
      return;
    palette.value = {
      stops: colors.map((color, index) => ({
        id: String(index),
        position: index / (colors.length - 1),
        color,
        alpha: 1,
      })),
    };
  },
  { deep: true, immediate: true },
);
const updatePalette = (value: GradientValue) => {
  if (
    props.disabled ||
    value.stops.length < 2 ||
    value.stops.length > 8 ||
    value.stops.some((stop) => !/^#[\da-f]{6}$/i.test(stop.color))
  )
    return;
  palette.value = value;
  emit(
    'update',
    value.stops.map((stop) => stop.color),
  );
};
</script>

<template>
  <Gradient
    :model-value="palette"
    palette
    :min-stops="2"
    :max-stops="8"
    :disabled="disabled"
    @update:model-value="updatePalette"
  >
    <template v-if="$slots.preview" #preview><slot name="preview" /></template>
  </Gradient>
</template>
