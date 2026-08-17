<script setup lang="ts">
import { Info } from '@lucide/vue';
import Button from '../button/Button.vue';

withDefaults(
  defineProps<{
    content: string;
    label?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
  }>(),
  {
    label: undefined,
    position: 'top',
    delay: 100,
  },
);
</script>

<template>
  <Button
    variant="ghost"
    size="xs"
    :icon="Info"
    icon-only
    class="info-tooltip-trigger"
    :tooltip="content"
    :tooltip-position="position"
    :tooltip-delay="delay"
    :aria-label="label ?? content"
  />
</template>

<style scoped>
.info-tooltip-trigger {
  flex: 0 0 auto;
  width: 20px;
  min-width: 20px;
  height: 20px;
  padding: 0;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.info-tooltip-trigger:hover {
  color: var(--text-primary);
}

.info-tooltip-trigger :deep(.btn-icon) {
  width: 13px;
  height: 13px;
}
</style>
