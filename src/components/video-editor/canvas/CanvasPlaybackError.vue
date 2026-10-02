<script setup lang="ts">
import { computed, inject } from 'vue';
import Beamy from '~/components/brand/Beamy/Beamy.vue';
import CopyButton from '~/components/ui/button/CopyButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { MediaError } from '@beam/runtime/shared/index';
import { PLAYBACK_ERROR_REPORT } from '../composables/playback-error-diagnostics';

const props = defineProps<{ error: MediaError }>();
const { t } = useTranslate('EditorCanvas');
const { t: errorText } = useTranslate('EditorOpenError');
const createReport = inject(PLAYBACK_ERROR_REPORT, null);
if (!createReport) throw new Error('Playback error diagnostics provider is missing.');
const diagnosticReport = computed(() => createReport(props.error));
const message = computed(() => {
  const error = props.error;
  if (error.kind === 'unsupported-codec') return t('videoFormatUnsupported');
  if (error.kind === 'missing') return t('videoFileUnavailable');
  if (error.kind === 'decode-failure')
    return t(error.context?.operation === 'seek-frame' ? 'videoSeekFailed' : 'videoDecodeFailed');
  return t('videoPreviewUnavailable');
});
</script>

<template>
  <div class="canvas-playback-error" role="alert" @pointerdown.stop @dblclick.stop @wheel.stop>
    <Beamy phase="failed" :size="72" portrait aria-hidden="true" />
    <p>{{ message }}</p>
    <CopyButton
      :text="diagnosticReport"
      :label="errorText('copyDetails')"
      :copied-label="errorText('detailsCopied')"
      :error-label="errorText('copyFailed')"
      variant="ghost"
      size="sm"
      tooltip-mode="native"
    />
  </div>
</template>

<style scoped>
.canvas-playback-error {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  overflow: auto;
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  text-align: center;
}

.canvas-playback-error p {
  margin: 0;
  font-size: 13px;
}
</style>
