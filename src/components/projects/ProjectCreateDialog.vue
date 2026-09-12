<script setup lang="ts">
import { useTranslate } from '~/i18n/useTranslate';
import Dialog from '~/ui/dialog/Dialog.vue';
import Input from '~/ui/input/Input.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
const { t } = useTranslate('ProjectPicker');
defineProps<{ busy: boolean; error: string }>();
const open = defineModel<boolean>('open', { required: true });
const name = defineModel<string>('name', { required: true });
const emit = defineEmits<{ create: [] }>();
</script>
<template>
  <Dialog :is-open="open" :title="t('newProject')" size="sm" @close="open = false">
    <form class="project-create" @submit.prevent="!busy && emit('create')">
      <Input v-model="name" :placeholder="t('projectName')" :disabled="busy" autofocus />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
    <template #footer="{ close }">
      <ButtonGroup>
        <Button variant="ghost" size="sm" :disabled="busy" @click="close">{{ t('cancel') }}</Button>
        <Button variant="primary" size="sm" :loading="busy" @click="emit('create')">{{ t('create') }}</Button>
      </ButtonGroup>
    </template>
  </Dialog>
</template>
<style scoped>
.project-create {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}
.error {
  color: var(--color-error);
  font-size: 11px;
  margin: 0;
}
</style>
