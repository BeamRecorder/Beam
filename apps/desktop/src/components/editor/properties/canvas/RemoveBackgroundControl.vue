<script setup lang="ts">
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ modelValue: boolean; description?: string }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();
const { t: tComposition } = useTranslate('ScreenshotComposition');
</script>

<template>
  <div class="remove-background-row">
    <div class="copy">
      <span class="title">{{ tComposition('show', { name: tComposition('background') }) }}</span>
      <span v-if="description" class="description">{{ description }}</span>
    </div>
    <Switch
      :model-value="!modelValue"
      :aria-label="tComposition('show', { name: tComposition('background') })"
      @update:model-value="emit('update:modelValue', !$event)"
    />
  </div>
</template>

<style scoped>
.remove-background-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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
