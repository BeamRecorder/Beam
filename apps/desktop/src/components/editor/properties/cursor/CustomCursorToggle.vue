<script setup lang="ts">
import { computed, inject } from 'vue';
import Switch from '~/ui/switch/Switch.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { customCursorKey, screenCursorSelectionKey } from './custom-cursor-context';
const selection = inject(screenCursorSelectionKey, null);
const enabled = selection?.enabled ?? inject(customCursorKey, null);
const disabled = computed(() => selection?.disabled.value ?? false);
const { t } = useTranslate('CursorRecording');
</script>
<template>
  <div v-if="enabled !== null" class="custom-cursor-toggle">
    <InfoTooltip :content="t('overlayDescription')" />
    <Switch v-model="enabled" :disabled="disabled" :aria-label="t('customCursor')" />
  </div>
</template>
<style scoped>
.custom-cursor-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}
</style>
