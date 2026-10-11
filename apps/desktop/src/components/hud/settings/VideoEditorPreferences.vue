<script setup lang="ts">
import EditorAccessibilitySettings from '~/components/editor/properties/settings/EditorAccessibilitySettings.vue';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import { useExportBackendPreference } from '~/components/export/useExportBackendPreference';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ExportPopover');
const backend = useExportBackendPreference();
</script>
<template>
  <div class="preference-stack">
    <div class="preference-item preview-preference" data-setting="timeline-insertion" tabindex="-1">
      <EditorAccessibilitySettings :show-title="false" />
    </div>
    <div
      v-if="backend.available"
      class="preference-item preview-preference"
      data-setting="video-export-backend"
      tabindex="-1"
    >
      <TogglePreference
        :model-value="backend.enabled.value"
        :disabled="!backend.ready.value"
        :busy="backend.busy.value"
        :label="t('experimentalFfmpeg')"
        :description="t('experimentalFfmpegDesc')"
        @update:model-value="backend.setEnabled"
      />
      <p v-if="backend.error.value" class="preference-error" role="alert">{{ backend.error.value }}</p>
    </div>
  </div>
</template>
<style scoped src="./settings-content.css"></style>
<style scoped>
.preference-error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
