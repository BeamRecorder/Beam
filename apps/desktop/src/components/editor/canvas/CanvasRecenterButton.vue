<script setup lang="ts">
import { RotateCcw } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';

const emit = defineEmits<{ click: [] }>();
const { t } = useTranslate('EditorCanvas');
</script>

<template>
  <Button
    variant="frosted"
    size="xs"
    :icon="RotateCcw"
    class="recenter-button"
    style="
      border-radius: var(--radius-full);
      height: 26px;
      padding: 0 12px;
      font-size: 11px;
      box-shadow: var(--shadow-sm);
    "
    @click.stop="emit('click')"
  >
    {{ t('recenter') }}
  </Button>
</template>
