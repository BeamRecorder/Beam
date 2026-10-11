<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RotateCcw, X } from '@lucide/vue';
import KeyboardChip from '../Kbd/KeyboardChip.vue';
import Button from '../button/Button.vue';
import ContextMenu from '../context-menu/ContextMenu.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import { isMacKeyboard } from '~/shortcuts/action-bindings';
const props = withDefaults(
  defineProps<{
    modelValue: string;
    inputId?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean | string;
    kind?: 'keyboard' | 'modifier';
    customized?: boolean;
  }>(),
  { kind: 'keyboard' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string]; reset: [] }>();
const { t } = useTranslate('ActionShortcuts');
const recording = ref(false);
const draft = ref('');
const menu = ref<InstanceType<typeof ContextMenu>>();
const menuItems = computed(() => [
  { id: 'reset', label: t('restore'), icon: RotateCcw, disabled: !props.customized },
  { id: 'clear', label: t('clear'), icon: X, disabled: !props.modelValue },
]);
let generation = 0;
let captureRequested = false;
let restoration: Promise<boolean> | null = null;
const localError = ref('');
const restoreNativeShortcuts = async () => {
  try {
    await capture.setShortcutCaptureActive(false);
    return true;
  } catch (reason) {
    localError.value = String(reason);
    return false;
  } finally {
    restoration = null;
  }
};
const stop = async () => {
  generation++;
  recording.value = false;
  draft.value = '';
  if (!captureRequested) return restoration ?? true;
  captureRequested = false;
  restoration = restoreNativeShortcuts();
  return restoration;
};
const start = async () => {
  if (props.disabled || captureRequested || restoration) return;
  captureRequested = true;
  const current = ++generation;
  localError.value = '';
  try {
    await capture.setShortcutCaptureActive(true);
    if (current === generation) recording.value = true;
  } catch (reason) {
    captureRequested = false;
    localError.value = String(reason);
  }
};
onMounted(() => window.addEventListener('blur', stop));
onBeforeUnmount(() => {
  stop();
  window.removeEventListener('blur', stop);
});
const commit = async (keys: string) => {
  if (!(await stop())) return;
  emit('update:modelValue', keys);
  emit('change', keys);
};
const reset = async () => {
  if (props.disabled || !props.customized) return;
  if (await stop()) emit('reset');
};
const modifiers = (event: KeyboardEvent) => [
  ...(event.ctrlKey ? [isMacKeyboard() ? 'Control' : 'Ctrl'] : []),
  ...(event.altKey ? ['Alt'] : []),
  ...(event.shiftKey ? ['Shift'] : []),
  ...(event.metaKey ? [isMacKeyboard() ? 'Command' : 'Super'] : []),
];
const keydown = (event: KeyboardEvent) => {
  if (props.disabled) return;
  if (event.key === 'Tab') {
    stop();
    return;
  }
  if (event.key === 'F10' && event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu.value?.open({ x: bounds.left, y: bounds.bottom });
    return;
  }
  if (!recording.value) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void start();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      commit('');
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    stop();
    return;
  }
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    ['Backspace', 'Delete'].includes(event.key)
  ) {
    commit('');
    return;
  }
  const parts = modifiers(event);
  const modifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key);
  if (props.kind === 'modifier' || modifier) {
    draft.value = parts.join('+');
    return;
  }
  const keys: Record<string, string> = {
    ' ': 'Space',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    '+': 'Plus',
  };
  const physical = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1];
  const key =
    keys[event.key] ??
    (physical && !/^[a-z0-9]$/i.test(event.key)
      ? physical
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key);
  commit([...parts, key].join('+'));
};
const keyup = (event: KeyboardEvent) => {
  if (recording.value && props.kind === 'modifier' && draft.value && !modifiers(event).length) commit(draft.value);
};
const contextmenu = (event: MouseEvent) => {
  if (props.disabled) return;
  stop();
  menu.value?.open(event);
};
</script>
<template>
  <div class="shortcut-field" data-shortcut-input>
    <div class="shortcut-controls">
      <div class="shortcut-trigger" :class="{ recording }">
        <Button
          variant="ghost"
          size="sm"
          :disabled="disabled"
          :id="inputId"
          :aria-label="label"
          :aria-pressed="recording"
          :aria-invalid="Boolean(error)"
          @click="start"
          @keydown="keydown"
          @keyup="keyup"
          @blur="stop"
          @contextmenu.prevent="contextmenu"
        >
          <KeyboardChip v-if="recording && draft" :shortcut="draft" size="md" />
          <span v-else-if="recording" class="shortcut-prompt">{{ t('recordShortcut') }}</span>
          <KeyboardChip v-else-if="modelValue" :shortcut="modelValue" size="md" />
          <span v-else class="shortcut-prompt">{{ placeholder || t('unassigned') }}</span>
        </Button>
      </div>
      <Button
        v-if="customized"
        variant="ghost"
        size="xs"
        icon-only
        :icon="RotateCcw"
        :disabled="disabled"
        :aria-label="t('restore')"
        :tooltip="t('restore')"
        @click="reset"
      />
    </div>
    <span v-if="typeof error === 'string' && error" class="shortcut-error" role="alert">{{ error }}</span>
    <span v-if="localError" class="shortcut-error" role="alert">{{ localError }}</span>
    <ContextMenu ref="menu" :items="menuItems" @select="$event === 'reset' ? reset() : commit('')" />
  </div>
</template>
<style scoped>
.shortcut-field {
  --text-muted: var(--text-secondary);
  display: grid;
  gap: 6px;
  justify-items: end;
  min-width: 0;
}
.shortcut-controls {
  display: grid;
  grid-template-columns: minmax(0, auto) 24px;
  align-items: center;
  gap: 4px;
}
.shortcut-trigger {
  display: flex;
  justify-content: flex-end;
  border-radius: var(--radius-md);
}
.shortcut-trigger.recording,
.shortcut-trigger:focus-within {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}
.shortcut-prompt {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
.shortcut-error {
  font-size: var(--font-size-sm);
  color: var(--color-error);
}
</style>
