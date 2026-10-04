<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ message: string }>();
defineEmits<{ retry: [] }>();
const { t } = useTranslate('ProjectPicker');
</script>

<template>
  <div class="catalog-error" role="alert">
    <p>{{ message }}</p>
    <Button variant="link" size="sm" @click="$emit('retry')">{{ t('tryAgain') }}</Button>
  </div>
</template>

<style scoped>
.catalog-error {
  padding: 12px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
