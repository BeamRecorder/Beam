<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ count: number }>();
const emit = defineEmits<{ toggle: [opened: boolean] }>();
const { t } = useTranslate('HUD');
</script>

<template>
  <Popover
    v-if="count > 0"
    align="right"
    :match-trigger-width="false"
    interaction="hover-focus-click"
    @toggle="emit('toggle', $event)"
  >
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="xs"
        :icon="TriangleAlert"
        class="issues-indicator"
        :aria-label="`${t('issues')} (${count})`"
        :title="t('issues')"
        aria-haspopup="dialog"
        :aria-expanded="isOpen"
      >
        {{ count }}
      </Button>
    </template>
    <section class="issues-popup" role="dialog" :aria-label="t('issues')">
      <h2>{{ t('issues') }}</h2>
      <div class="issues-list"><slot /></div>
    </section>
  </Popover>
</template>

<style scoped>
:deep(.issues-indicator) {
  height: 26px;
  color: var(--color-warning);
  gap: 4px;
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
  -webkit-app-region: no-drag;
}
.issues-popup {
  width: 340px;
  max-width: calc(100vw - 32px);
}
h2 {
  margin: 0;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.issues-list {
  display: grid;
  gap: 6px;
  max-height: min(224px, calc(var(--popover-available-height, 260px) - 36px));
  padding: 0 8px 8px;
  overflow-y: auto;
}
</style>
