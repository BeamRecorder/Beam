<script setup lang="ts">
import { capture } from '~/api/capture';
import CopyButton from '~/ui/button/CopyButton.vue';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{ message: string; phase?: string; recordingTime?: string }>();
const { t } = useTranslate('HUD');
const report = () =>
  capture.getRecordingDiagnosticReport({
    message: props.message,
    phase: props.phase,
    recordingTime: props.recordingTime,
  });
</script>

<template>
  <CopyButton
    :text="message"
    :get-text="report"
    display="icon"
    size="xs"
    :label="t('copyDiagnostics')"
    :copied-label="t('copied')"
    :error-label="t('copyDiagnosticsFailed')"
    tooltip-mode="native"
  />
</template>
