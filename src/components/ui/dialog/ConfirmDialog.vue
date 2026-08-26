<script setup lang="ts">
import Button from '../button/Button.vue';
import Dialog from './Dialog.vue';

withDefaults(
  defineProps<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false,
    busy: false,
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <Dialog :is-open="isOpen" :title="title" size="sm" :close-on-overlay-click="!busy" @close="emit('close')">
    <p class="confirm-description">{{ description }}</p>

    <template #footer>
      <div class="dialog-actions">
        <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">{{ cancelLabel }}</Button>
        <Button :variant="destructive ? 'danger' : 'primary'" size="sm" :loading="busy" @click="emit('confirm')">{{
          confirmLabel
        }}</Button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.confirm-description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
</style>
