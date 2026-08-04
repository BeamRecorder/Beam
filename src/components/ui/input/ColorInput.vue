<script setup lang="ts">
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';

defineProps<{
  modelValue: string;
  label?: string;
  showLabel?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>

<template>
  <div class="color-input-container">
    <span v-if="label && showLabel !== false" class="color-input-label">{{ label }}</span>
    <ColorPicker
      :model-value="modelValue"
      :show-label="false"
      :disabled="disabled"
      @update:modelValue="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.color-input-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.color-input-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
