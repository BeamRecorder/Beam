<script setup lang="ts">
import { inject } from 'vue';
import Switch from '~/ui/switch/Switch.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { customCursorKey } from './custom-cursor-context';
const enabled = inject(customCursorKey, null);
const { t } = useTranslate('CursorRecording');
</script>
<template>
  <div v-if="enabled !== null" class="custom-cursor-toggle">
    <InfoTooltip :content="t('overlayDescription')" />
    <Switch v-model="enabled" :aria-label="t('customCursor')" />
  </div>
</template>
<style scoped>
.custom-cursor-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
