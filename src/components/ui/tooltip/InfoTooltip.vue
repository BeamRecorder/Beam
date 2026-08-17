<script setup lang="ts">
import { Info } from '@lucide/vue';
import Button from '../button/Button.vue';
import Tooltip from './Tooltip.vue';

withDefaults(
  defineProps<{
    content: string;
    label?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    maxWidth?: number;
    delay?: number;
  }>(),
  {
    label: undefined,
    position: 'top',
    maxWidth: 260,
    delay: 100,
  },
);
</script>

<template>
  <Tooltip :content="content" :position="position" :max-width="maxWidth" :delay="delay" as="span">
    <Button
      variant="ghost"
      size="xs"
      :icon="Info"
      icon-only
      class="info-tooltip-trigger"
      :aria-label="label ?? content"
    />
  </Tooltip>
</template>

<style scoped>
.info-tooltip-trigger {
  flex: 0 0 auto;
}

.info-tooltip-trigger :deep(.btn) {
  width: 20px;
  min-width: 20px;
  height: 20px;
  padding: 0;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.info-tooltip-trigger :deep(.btn:hover) {
  color: var(--text-primary);
}

.info-tooltip-trigger :deep(.btn-icon) {
  width: 13px;
  height: 13px;
}
</style>
