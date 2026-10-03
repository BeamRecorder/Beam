<script setup lang="ts">
import { Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ name: string; disabled?: boolean }>();
const emit = defineEmits<{ delete: [] }>();
const { t } = useTranslate('Elements');
</script>
<template>
  <Button block size="sm" variant="danger" :icon="Trash2" :disabled="disabled" @click="emit('delete')">
    {{ t('deleteNamed', { name }) }}
  </Button>
</template>
