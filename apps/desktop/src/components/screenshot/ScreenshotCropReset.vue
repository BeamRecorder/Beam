<script setup lang="ts">
import { RotateCcw } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

defineProps<{ disabled?: boolean }>();
defineEmits<{ reset: [] }>();
const { t } = useTranslate('ScreenshotEditor');
</script>

<template>
  <Button
    variant="ghost"
    size="xs"
    :icon="RotateCcw"
    icon-only
    :aria-label="t('resetCrop')"
    :tooltip="t('resetCrop')"
    :disabled="disabled"
    @click="$emit('reset')"
  />
</template>
