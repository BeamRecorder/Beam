<script setup lang="ts">
import { computed } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import type { CaptureMode } from '~/api/types/capture-mode';
import type { EditorLoadingProgress } from '~/api/types/editor-window';
import Button from '~/components/ui/button/Button.vue';
import CopyButton from '~/components/ui/button/CopyButton.vue';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{
  error: string;
  errorCode?: string;
  progress: EditorLoadingProgress;
  appVersion: string;
  runtimePlatform: string;
  projectId?: string;
  projectMode?: CaptureMode;
  occurredAt: string;
}>();

defineEmits<{
  dismiss: [];
}>();

const { t } = useTranslate('EditorOpenError');
const { t: tStage } = useTranslate('EditorPreparingHud');
const stageLabel = computed(() => tStage(props.progress.stage));
const failureCode = computed(
  () =>
    props.errorCode ||
    props.error.match(/BEAM_EDITOR_(?:UNRESPONSIVE|TIMEOUT|LOAD_FAILED|RENDERER_GONE)/)?.[0] ||
    'BEAM_EDITOR_UNKNOWN',
);
const failureClassification = computed(() => failureCode.value.replace(/^BEAM_EDITOR_/, '').toLowerCase());
const failureMessage = computed(() => {
  if (failureCode.value === 'BEAM_EDITOR_UNRESPONSIVE') return t('unresponsive');
  if (failureCode.value === 'BEAM_EDITOR_TIMEOUT') return t('timeout');
  if (failureCode.value === 'BEAM_EDITOR_LOAD_FAILED') return t('loadFailed');
  if (failureCode.value === 'BEAM_EDITOR_RENDERER_GONE') return t('rendererGone');
  return t('unknownFailure');
});
const diagnosticReport = computed(() =>
  [
    '=== Beam Editor Open Diagnostics ===',
    `App version: ${props.appVersion || 'Unknown'}`,
    `Runtime platform: ${props.runtimePlatform || navigator.platform || 'Unknown'}`,
    `Project ID: ${props.projectId || 'Unknown'}`,
    `Project mode: ${props.projectMode || 'Unknown'}`,
    `Classification: ${failureClassification.value}`,
    `Failure code: ${failureCode.value}`,
    `Last confirmed step: ${props.progress.stage} (${Math.round(props.progress.value)}%)`,
    `Occurred at: ${props.occurredAt || 'Unknown'}`,
    `User agent: ${navigator.userAgent || 'Unknown'}`,
    `Error: ${props.error}`,
  ].join('\n'),
);
</script>

<template>
  <section class="editor-open-error" role="alert" aria-labelledby="editor-open-error-title">
    <div class="editor-open-error-icon" aria-hidden="true">
      <TriangleAlert :size="26" :stroke-width="1.8" />
    </div>
    <div class="editor-open-error-copy">
      <h2 id="editor-open-error-title">{{ t('title') }}</h2>
      <p class="editor-open-error-reason">{{ failureMessage }}</p>
      <p>{{ t('description') }}</p>
      <p class="editor-open-error-stage">{{ t('lastStage', { stage: stageLabel }) }}</p>
    </div>
    <div class="editor-open-error-actions">
      <CopyButton
        :text="diagnosticReport"
        :label="t('copyDetails')"
        :copied-label="t('detailsCopied')"
        :error-label="t('copyFailed')"
        variant="secondary"
        size="sm"
        tooltip-mode="native"
      />
      <Button variant="outline" size="sm" @click="$emit('dismiss')">{{ t('back') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.editor-open-error {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 28px 24px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  text-align: center;
}

.editor-open-error-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-error) 28%, var(--color-border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-error) 10%, var(--color-bg-element));
  color: var(--color-error);
}

.editor-open-error-copy {
  max-width: 420px;
  display: grid;
  gap: 8px;
}

.editor-open-error-copy h2,
.editor-open-error-copy p {
  margin: 0;
}

.editor-open-error-copy h2 {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.25px;
}

.editor-open-error-copy p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}

.editor-open-error-copy .editor-open-error-stage {
  color: var(--text-secondary);
  font-weight: 600;
}

.editor-open-error-copy .editor-open-error-reason {
  color: var(--text-primary);
}

.editor-open-error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
</style>
