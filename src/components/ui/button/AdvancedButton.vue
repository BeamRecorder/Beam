<script setup lang="ts">
import { SlidersHorizontal } from '@lucide/vue';
import Button from './Button.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    controls: string;
    label: string;
  }>(),
  { open: false },
);

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();
</script>

<template>
  <Button
    class="advanced-toggle"
    variant="ghost"
    size="xs"
    :icon="SlidersHorizontal"
    :aria-expanded="open"
    :aria-controls="controls"
    :style="
      open
        ? { color: 'var(--color-primary)', background: 'var(--color-primary-light)' }
        : { color: 'var(--text-secondary)' }
    "
    @click="emit('update:open', !props.open)"
  >
    {{ label }}
  </Button>
</template>
