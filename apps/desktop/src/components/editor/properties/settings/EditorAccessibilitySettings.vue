<script setup lang="ts">
import TogglePreference from '~/components/settings/TogglePreference.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineInsertPreference } from '../../timeline/composables/useTimelineInsertPreference';
const { t } = useTranslate('EditorAccessibility');
withDefaults(defineProps<{ showTitle?: boolean }>(), { showTitle: true });
const { doubleClick, setDoubleClick, saving, error } = useTimelineInsertPreference();
</script>
<template>
  <section class="accessibility">
    <h4 v-if="showTitle">{{ t('title') }}</h4>
    <TogglePreference
      :model-value="doubleClick"
      :disabled="saving"
      :label="t('doubleClick')"
      :description="t('doubleClickDescription')"
      @update:model-value="setDoubleClick"
    />
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.accessibility {
  display: grid;
  gap: 12px;
}
h4 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
}
p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-error);
}
</style>
