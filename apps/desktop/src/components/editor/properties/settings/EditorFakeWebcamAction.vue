<script setup lang="ts">
import { Webcam } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useEditorWorkspaceContext } from '../../workspace/workspace-context';
import { visualClipDefaultProps } from '../../composables/editor-defaults';
import { useFakeWebcamOverlay } from './useFakeWebcamOverlay';
const { t } = useTranslate('SettingsPanel');
const workspace = useEditorWorkspaceContext();
const { busy, error, unavailable, add } = useFakeWebcamOverlay({
  composition: workspace.composition,
  projectId: () => workspace.props.project?.id ?? null,
  selectedClipId: () => workspace.selectedClipId.value,
  currentTimeMs: () => workspace.currentTime.value * 1000,
  appearance: () => visualClipDefaultProps(workspace.editorDefaults.value, 'webcam', 8000).appearance,
  onAdded: () => workspace.commitNow(workspace.createEditorSnapshot()),
});
</script>

<template>
  <div class="fake-webcam-action">
    <span class="option-label">{{ t('fakeWebcamTitle') }}</span>
    <p class="option-description">{{ t('fakeWebcamDescription') }}</p>
    <Button size="sm" variant="secondary" :icon="Webcam" :loading="busy" :disabled="!!unavailable" @click="add">
      {{ t('addFakeWebcamOverlay') }}
    </Button>
    <p v-if="unavailable" class="option-description">{{ unavailable }}</p>
    <p v-if="error" class="option-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.fake-webcam-action {
  display: grid;
  gap: 8px;
}
.option-label {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.option-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.option-error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
