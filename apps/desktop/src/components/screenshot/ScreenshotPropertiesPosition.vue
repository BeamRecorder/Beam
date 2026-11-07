<script setup lang="ts">
import { computed } from 'vue';
import { PanelLeft, PanelRight, Pin, PinOff } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotPropertiesPosition } from './screenshot-properties-types';
const props = defineProps<{ modelValue: ScreenshotPropertiesPosition; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: ScreenshotPropertiesPosition] }>();
const { t } = useTranslate('ScreenshotEditor');
const items = computed(() => [
  { id: 'left', label: t('dockProperties'), icon: PanelLeft, checked: props.modelValue === 'left' },
  { id: 'right', label: t('dockPropertiesRight'), icon: PanelRight, checked: props.modelValue === 'right' },
  { id: 'floating', label: t('floatProperties'), icon: PinOff, checked: props.modelValue === 'floating' },
]);
const select = (id: string, close: () => void) => {
  if (props.disabled || (id !== 'left' && id !== 'right' && id !== 'floating')) return;
  emit('update:modelValue', id);
  close();
};
</script>
<template>
  <Popover :disabled="disabled" :match-trigger-width="false">
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="xs"
        icon-only
        :icon="modelValue === 'floating' ? PinOff : Pin"
        :disabled="disabled"
        :aria-label="t('propertiesPosition')"
        :tooltip="t('propertiesPosition')"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
      />
    </template>
    <template #default="{ close }">
      <PopoverMenuList :items="items" @select="select($event, close)" @dismiss="close" />
    </template>
  </Popover>
</template>
