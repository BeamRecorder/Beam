<script setup lang="ts">
import Checkbox from '~/ui/checkbox/Checkbox.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TrackPropertyScope } from './track-property-types';
defineProps<{ scope: TrackPropertyScope | null; hint: string }>();
const { t } = useTranslate('ClipPropertiesPanel');
</script>
<template>
  <div v-if="scope?.available.value" class="track-property-scope">
    <Checkbox
      :model-value="scope.enabled.value"
      :disabled="scope.disabled.value"
      :label="t('applyToTrack')"
      :aria-label="t('applyToTrack')"
      @update:model-value="scope.enabled.value = $event"
    />
    <p>{{ hint }}</p>
  </div>
</template>
<style scoped>
.track-property-scope {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
}
p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}
</style>
