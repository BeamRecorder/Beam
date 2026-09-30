<script setup lang="ts">
import type { Component } from 'vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
defineProps<{ label: string; icon: Component; tooltipDisabled: boolean }>();
defineEmits<{ toggle: [open: boolean] }>();
</script>

<template>
  <Popover align="center" direction="up" :match-trigger-width="false" @toggle="$emit('toggle', $event)">
    <template #trigger="{ isOpen }">
      <Button
        style="width: var(--teleprompter-button-size); height: var(--teleprompter-button-size)"
        variant="ghost"
        size="sm"
        icon-only
        :icon="icon"
        :aria-label="label"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        :tooltip="label"
        tooltip-position="top"
        :tooltip-disabled="tooltipDisabled || isOpen"
      />
    </template>
    <div class="teleprompter-control" role="dialog" :aria-label="label">
      <span class="control-label">{{ label }}</span>
      <slot />
    </div>
  </Popover>
</template>

<style scoped>
.teleprompter-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 204px;
  max-width: calc(100vw - 48px);
  padding: 4px;
}
.control-label {
  color: var(--text-secondary);
  font: 500 12px var(--font-sans);
}
</style>
