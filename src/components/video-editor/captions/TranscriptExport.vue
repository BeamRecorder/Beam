<script setup lang="ts">
import { computed, ref } from 'vue';
import { FileJson } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import { buildCaptionTranscript, hasCaptionTranscript } from './caption-transcript';

const props = defineProps<{ composition: ClipComposition; timelineDurationMs: number; disabled?: boolean }>();
const { t } = useTranslate('CaptionPanel');
const exporting = ref(false);
const error = ref('');
const saved = ref(false);
const available = computed(() => hasCaptionTranscript(props.composition, props.timelineDurationMs));
const exportTranscript = async () => {
  if (exporting.value || props.disabled || !available.value) return;
  exporting.value = true;
  error.value = '';
  saved.value = false;
  try {
    const transcript = buildCaptionTranscript(props.composition, props.timelineDurationMs);
    const result = await capture.exportTranscript({ projectName: 'Beam', transcript });
    saved.value = !result.canceled;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('transcriptExportFailed');
  } finally {
    exporting.value = false;
  }
};
</script>

<template>
  <div class="transcript-export">
    <Button
      variant="secondary"
      size="sm"
      :icon="FileJson"
      block
      :loading="exporting"
      :disabled="disabled || exporting || !available"
      @click="exportTranscript"
      >{{ t('exportTranscript') }}</Button
    >
    <p class="description">{{ t('transcriptDescription') }}</p>
    <p v-if="saved" class="description" role="status">{{ t('transcriptSaved') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.transcript-export {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.description {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}
.error {
  margin: 0;
  color: var(--color-error);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
