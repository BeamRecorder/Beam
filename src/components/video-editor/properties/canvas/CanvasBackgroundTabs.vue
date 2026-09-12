<script setup lang="ts">
import { Image, Video } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { BackgroundKind } from '../../composables/backgroundCatalog';
defineProps<{ modelValue: BackgroundKind; still?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: BackgroundKind] }>();
const { t } = useTranslate('CanvasPanel');
</script>

<template>
  <ButtonGroup :aria-label="t('backgroundType')" class="kind-group">
    <Button
      v-for="kind in (still
        ? ['image', 'color', 'gradient']
        : ['image', 'video', 'color', 'gradient']) as BackgroundKind[]"
      :key="kind"
      size="xs"
      :variant="modelValue === kind ? 'primary' : 'ghost'"
      :icon="kind === 'image' ? Image : kind === 'video' ? Video : undefined"
      @click="emit('update:modelValue', kind)"
      >{{ t(kind) }}</Button
    >
  </ButtonGroup>
</template>

<style scoped>
.kind-group {
  width: 100%;
}
</style>
