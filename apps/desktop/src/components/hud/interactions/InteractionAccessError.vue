<script setup lang="ts">
import type { InteractionAccessViewState } from './interaction-access-types';

defineProps<{ status: InteractionAccessViewState }>();
</script>

<template>
  <p v-if="'error' in status && status.error" class="interaction-access-error" role="alert">
    {{ status.error.message }}
  </p>
</template>

<style scoped>
.interaction-access-error {
  margin: 6px 0 0;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.4;
  max-height: 96px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  user-select: text;
}
</style>
