<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import { Check } from '@lucide/vue';
import Popover from '../popover/Popover.vue';
import type { InputUnitSelectProps } from './input-types';
const props = defineProps<InputUnitSelectProps>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; open: [] }>();
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const id = useId();
const opened = (value: boolean) => {
  if (!value) return;
  emit('open');
  void nextTick(() => menu.value?.querySelector<HTMLElement>('[aria-checked="true"], button')?.focus());
};
const choose = (value: string, close: () => void) => {
  if (props.disabled) return;
  if (value !== props.modelValue) emit('update:modelValue', value);
  close();
  void nextTick(() => trigger.value?.focus());
};
const navigate = (event: KeyboardEvent, close: () => void) => {
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') {
      event.preventDefault();
      void nextTick(() => trigger.value?.focus());
    }
    close();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const options = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  if (!options.length) return;
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
};
</script>
<template>
  <Popover block align="right" :match-trigger-width="false" :disabled="disabled" :gap="4" @toggle="opened">
    <template #trigger="{ isOpen }">
      <button
        ref="trigger"
        type="button"
        class="unit-trigger"
        :disabled="disabled"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
        :aria-controls="id"
      >
        {{ options.find((option) => option.value === modelValue)?.label ?? modelValue }}
      </button>
    </template>
    <template #default="{ close }">
      <div :id="id" ref="menu" class="unit-menu" role="menu" :aria-label="label" @keydown="navigate($event, close)">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="option.value === modelValue"
          :disabled="disabled"
          @click="choose(option.value, close)"
        >
          <span>{{ option.label }}</span
          ><Check v-if="option.value === modelValue" :size="12" />
        </button>
      </div>
    </template>
  </Popover>
</template>
<style scoped>
.unit-trigger {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  height: 22px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.unit-trigger:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--color-bg-surface-hover);
}
.unit-trigger:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: 1px;
}
.unit-trigger:disabled {
  cursor: not-allowed;
}
.unit-menu {
  min-width: 70px;
  padding: 4px;
}
.unit-menu button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  padding: 6px 8px;
  cursor: pointer;
}
.unit-menu button:hover,
.unit-menu button:focus-visible {
  background: var(--color-bg-surface-hover);
  outline: none;
}
</style>
