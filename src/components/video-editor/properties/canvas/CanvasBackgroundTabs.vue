<script setup lang="ts">
import { computed } from 'vue';
import { Image, Video } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { BackgroundKind } from '@beam/engine/shared/background-types';
const props = defineProps<{ modelValue: BackgroundKind; still?: boolean }>();
const kinds = computed<BackgroundKind[]>(() =>
  props.still ? ['image', 'color', 'gradient'] : ['image', 'video', 'color', 'gradient'],
);
const emit = defineEmits<{ 'update:modelValue': [value: BackgroundKind] }>();
const { t } = useTranslate('CanvasPanel');
</script>

<template>
  <ButtonGroup
    full
    size="xs"
    :selection="{ count: kinds.length, index: kinds.indexOf(modelValue) }"
    :aria-label="t('backgroundType')"
    class="kind-group"
  >
    <Button
      v-for="kind in kinds"
      :key="kind"
      size="xs"
      variant="tab"
      :class="{ active: modelValue === kind }"
      :aria-pressed="modelValue === kind"
      :icon="kind === 'image' ? Image : kind === 'video' ? Video : undefined"
      @click="emit('update:modelValue', kind)"
      >{{ t(kind) }}</Button
    >
  </ButtonGroup>
</template>

<style scoped>
.kind-group {
  width: 100%;
  border: 0;
  border-radius: var(--radius-sm);
}
</style>
