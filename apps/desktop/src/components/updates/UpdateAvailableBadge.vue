<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useAppUpdates } from './useAppUpdates';

defineProps<{ inline?: boolean }>();
const { t } = useTranslate('Updates');
const { state, attention } = useAppUpdates();
const label = computed(() =>
  state.value?.availableVersion
    ? t('updateAvailable', { version: state.value.availableVersion })
    : t('updateAvailableGeneric'),
);
</script>

<template>
  <span
    v-if="attention"
    class="update-badge"
    :class="{ 'badge-inline': inline }"
    :title="inline ? undefined : label"
    :aria-label="label"
    role="img"
  />
</template>

<style scoped>
.update-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border: 2px solid var(--color-bg-element);
  border-radius: 50%;
  background: var(--color-error);
  pointer-events: none;
}
.badge-inline {
  position: static;
  display: inline-block;
  vertical-align: middle;
  margin-left: 8px;
  border: none;
  flex: none;
}
</style>
