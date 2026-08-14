<script setup lang="ts">
import Throbber, { type ThrobberVariant, type ThrobberColor, type ThrobberSize } from '~/ui/throbber/Throbber.vue';

withDefaults(
  defineProps<{
    text: string;
    variant?: ThrobberVariant;
    color?: ThrobberColor;
    size?: ThrobberSize;
  }>(),
  {
    variant: 'wave',
    color: 'default',
    size: 'md',
  },
);
</script>

<template>
  <Throbber :text="text" :variant="variant" :color="color" :size="size" />
</template>
