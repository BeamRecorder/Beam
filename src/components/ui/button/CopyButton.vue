<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertCircle, Check, Copy } from '@lucide/vue';
import Button from './Button.vue';

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

const props = withDefaults(
  defineProps<{
    text: string;
    display?: 'icon' | 'text';
    label?: string;
    copiedLabel?: string;
    errorLabel?: string;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    disabled?: boolean;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  {
    display: 'text',
    label: 'Copy',
    copiedLabel: 'Copied',
    errorLabel: 'Copy failed',
    variant: 'secondary',
    size: 'sm',
    disabled: false,
    tooltipPosition: 'top',
  },
);

const emit = defineEmits<{
  copied: [];
  error: [error: Error];
}>();

const state = ref<CopyState>('idle');

watch(
  () => props.text,
  () => {
    state.value = 'idle';
  },
);

const stateLabel = computed(() => {
  if (state.value === 'copied') return props.copiedLabel;
  if (state.value === 'error') return props.errorLabel;
  return props.label;
});

const stateIcon = computed(() => {
  if (state.value === 'copied') return Check;
  if (state.value === 'error') return AlertCircle;
  return Copy;
});

const copyWithSelection = (text: string) => {
  if (typeof document.execCommand !== 'function') return false;
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  try {
    return document.execCommand('copy');
  } finally {
    input.remove();
  }
};

const writeText = async (text: string) => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
    await navigator.clipboard.writeText(text);
  } catch (clipboardError) {
    if (!copyWithSelection(text)) throw clipboardError;
  }
};

const copy = async () => {
  state.value = 'copying';
  try {
    await writeText(props.text);
    state.value = 'copied';
    emit('copied');
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    state.value = 'error';
    emit('error', error);
  }
};
</script>

<template>
  <Button
    v-if="display === 'icon'"
    :variant="variant"
    :size="size"
    :icon="stateIcon"
    icon-only
    :loading="state === 'copying'"
    :disabled="disabled"
    :tooltip="stateLabel"
    :tooltip-position="tooltipPosition"
    :tooltip-variant="state === 'error' ? 'error' : 'default'"
    :aria-label="stateLabel"
    :aria-busy="state === 'copying'"
    :data-state="state"
    :class="[`copy-button-${state}`]"
    @click="copy"
  />
  <Button
    v-else
    :variant="variant"
    :size="size"
    :icon="stateIcon"
    :loading="state === 'copying'"
    :disabled="disabled"
    :tooltip-position="tooltipPosition"
    :tooltip-variant="state === 'error' ? 'error' : 'default'"
    :aria-label="stateLabel"
    :aria-busy="state === 'copying'"
    :data-state="state"
    :class="[`copy-button-${state}`]"
    @click="copy"
  >
    {{ stateLabel }}
  </Button>
</template>

<style scoped>
.copy-button-copied {
  color: var(--color-success);
}

.copy-button-error {
  color: var(--color-error);
}
</style>
