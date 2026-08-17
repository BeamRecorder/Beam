<script setup lang="ts">
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();
const { t } = useTranslate('CanvasPanel');
</script>

<template>
  <div class="remove-background-row">
    <div class="copy">
      <span class="title">{{ t('removeBackground') }}</span>
      <span class="description">{{ t('removeBackgroundDescription') }}</span>
    </div>
    <Switch
      :model-value="modelValue"
      :aria-label="t('removeBackground')"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.remove-background-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.description {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}
</style>
