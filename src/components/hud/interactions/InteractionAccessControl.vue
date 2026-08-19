<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import Badge from '~/ui/badge/Badge.vue';
import Switch from '~/ui/switch/Switch.vue';
import type { InteractionAccessViewState } from './interaction-access-types';

defineProps<{
  status: InteractionAccessViewState;
  enabled: boolean;
  requesting: boolean;
  enableLabel: string;
  enablingLabel: string;
  checkingLabel: string;
  unavailableLabel: string;
}>();

const emit = defineEmits<{
  request: [];
  'update:enabled': [value: boolean];
}>();
</script>

<template>
  <Switch
    v-if="status.state === 'available'"
    :model-value="enabled"
    @update:model-value="emit('update:enabled', $event)"
  />
  <Badge v-else-if="status.state === 'checking'" variant="outline">
    {{ checkingLabel }}
  </Badge>
  <Button
    v-else-if="status.canRequest"
    variant="secondary"
    size="xs"
    :loading="requesting"
    :disabled="requesting"
    @click="emit('request')"
  >
    {{ requesting ? enablingLabel : enableLabel }}
  </Button>
  <Badge v-else variant="outline">
    {{ unavailableLabel }}
  </Badge>
</template>
