<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import Button from '../button/Button.vue';
import Input from '../input/Input.vue';
import Dialog from './Dialog.vue';

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    title: string;
    initialValue?: string;
    label: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    maxLength?: number;
    validate?: (value: string) => string | null;
  }>(),
  {
    initialValue: '',
    placeholder: '',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    maxLength: 80,
    validate: undefined,
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [value: string];
}>();

const value = ref('');
const submitted = ref(false);
const input = ref<InstanceType<typeof Input> | null>(null);
const inputId = `text-input-dialog-${useId()}`;
const normalizedValue = computed(() => value.value.trim());
const validationError = computed(() => {
  if (!normalizedValue.value) return `${props.label} is required.`;
  if (normalizedValue.value.length > props.maxLength)
    return `${props.label} must be ${props.maxLength} characters or less.`;
  return props.validate?.(normalizedValue.value) ?? null;
});

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (!isOpen) return;
    value.value = props.initialValue;
    submitted.value = false;
    await nextTick();
    input.value?.focus();
  },
  { immediate: true },
);

const confirm = () => {
  submitted.value = true;
  if (validationError.value) return;
  emit('confirm', normalizedValue.value);
};
</script>

<template>
  <Dialog :is-open="isOpen" :title="title" size="sm" @close="emit('close')">
    <form class="text-input-dialog" @submit.prevent="confirm">
      <label class="field-label" :for="inputId">{{ label }}</label>
      <Input
        :id="inputId"
        ref="input"
        v-model="value"
        :placeholder="placeholder"
        :error="submitted && Boolean(validationError)"
        :maxlength="maxLength"
        autocomplete="off"
        select-on-focus
      />
      <p v-if="submitted && validationError" class="field-error" role="alert">
        {{ validationError }}
      </p>
    </form>

    <template #footer>
      <div class="dialog-actions">
        <Button variant="ghost" size="sm" @click="emit('close')">{{ cancelLabel }}</Button>
        <Button variant="primary" size="sm" @click="confirm">{{ confirmLabel }}</Button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.text-input-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-weight: 600;
}

.field-error {
  margin: 0;
  color: var(--color-error);
  font-size: 0.75rem;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
</style>
