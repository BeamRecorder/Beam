<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { computed } from 'vue';
import { CircleDot, MoveDown, MoveDownRight, MoveUpLeft } from '@lucide/vue';
import type { ShadowDirection } from '@beam/runtime/cursor/shadow-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('ShadowDirectionGroup');

defineProps<{ modelValue: ShadowDirection }>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: ShadowDirection): void;
}>();

const directions = computed(() => [
  { id: 'all' as const, label: t('around'), icon: CircleDot },
  { id: 'bottom' as const, label: t('bottom'), icon: MoveDown },
  { id: 'bottom-right' as const, label: t('bottomRight'), icon: MoveDownRight },
  { id: 'top-left' as const, label: t('topLeft'), icon: MoveUpLeft },
]);
</script>

<template>
  <ButtonGroup full variant="neutral" size="xs" role="group" :aria-label="t('shadowDirection')">
    <Button
      v-for="direction in directions"
      :key="direction.id"
      size="xs"
      icon-only
      :variant="modelValue === direction.id ? 'selected' : 'ghost'"
      :icon="direction.icon"
      :tooltip="direction.label"
      :aria-label="direction.label"
      :aria-pressed="modelValue === direction.id"
      @click="emit('update:modelValue', direction.id)"
    />
  </ButtonGroup>
</template>
