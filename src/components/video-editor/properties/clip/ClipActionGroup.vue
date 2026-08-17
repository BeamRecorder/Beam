<script setup lang="ts">
import { Eye, EyeOff, Trash2, Blend } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Divider from '~/ui/divider/Divider.vue';

withDefaults(
  defineProps<{
    enabled: boolean;
    deleteLabel: string;
    enabledLabel: string;
    disabledLabel: string;
    toggleable?: boolean;
    transitionable?: boolean;
    transitionLabel?: string;
    transitionActive?: boolean;
  }>(),
  { toggleable: true, transitionable: false, transitionLabel: 'Clip transitions', transitionActive: false },
);

const emit = defineEmits<{
  (event: 'toggle'): void;
  (event: 'delete'): void;
  (event: 'transition'): void;
}>();
</script>

<template>
  <ButtonGroup size="xs">
    <Button
      v-if="toggleable"
      variant="ghost"
      size="xs"
      :icon="enabled ? Eye : EyeOff"
      icon-only
      :tooltip="enabled ? enabledLabel : disabledLabel"
      :aria-label="enabled ? enabledLabel : disabledLabel"
      :class="{ 'is-muted': !enabled }"
      @click="emit('toggle')"
    />
    <Divider v-if="toggleable" orientation="vertical" spacing="none" />
    <Button
      v-if="transitionable"
      variant="ghost"
      size="xs"
      :icon="Blend"
      icon-only
      :tooltip="transitionLabel"
      :aria-label="transitionLabel"
      :class="{ 'is-active': transitionActive }"
      @click="emit('transition')"
    />
    <Divider v-if="transitionable" orientation="vertical" spacing="none" />
    <Button
      variant="ghost"
      size="xs"
      :icon="Trash2"
      icon-only
      :tooltip="deleteLabel"
      :aria-label="deleteLabel"
      class="delete-button"
      @click="emit('delete')"
    />
  </ButtonGroup>
</template>

<style scoped>
.delete-button:hover {
  color: var(--color-error) !important;
  background: var(--color-error-light) !important;
}

.is-muted {
  color: var(--text-muted) !important;
  opacity: 0.6;
}
.is-active { color: var(--text-primary) !important; background: var(--surface-active) !important; }
</style>
