<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { EditorLoadingProgress } from '~/api/types/editor-window';
import { useTranslate } from '~/i18n/useTranslate';
import Beamy from '~/components/brand/Beamy/Beamy.vue';
import Button from '~/ui/button/Button.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import { useRecordingFinalizationStatus } from './recorder/useRecordingFinalizationStatus';

const props = defineProps<{ progress: EditorLoadingProgress; finalizingRecording?: boolean }>();
const emit = defineEmits<{ cancel: [] }>();
const { t } = useTranslate('EditorPreparingHud');
const { t: recordingText } = useTranslate('RecorderBar');
const { takingLonger } = useRecordingFinalizationStatus(
  () => (props.finalizingRecording ? 'finalizing' : 'idle'),
  () => window.capture?.platform,
);
const stageLabel = computed(() =>
  props.finalizingRecording
    ? recordingText('finalizing')
    : t(props.progress.value >= 90 ? 'almostThere' : props.progress.stage),
);
const onKeyDown = (event: KeyboardEvent) => {
  if (props.finalizingRecording) return;
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  emit('cancel');
};
onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

<template>
  <section class="editor-preparing-hud" aria-busy="true" :aria-label="t('title')">
    <Beamy phase="loading" :size="120" portrait />
    <p class="editor-preparing-status">
      <Throbber :text="stageLabel" variant="glow" color="default" size="sm" />
    </p>
    <p v-if="finalizingRecording && takingLonger" class="editor-preparing-note" role="status">
      {{ recordingText('finalizingSlow') }}
    </p>
    <Button
      :disabled="finalizingRecording"
      variant="ghost"
      size="sm"
      autofocus
      style="-webkit-app-region: no-drag"
      @click="emit('cancel')"
      >{{ t('cancel') }}</Button
    >
  </section>
</template>

<style scoped>
.editor-preparing-hud {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 24px;
  color: var(--text-primary);
  text-align: center;
  -webkit-app-region: drag;
}
.editor-preparing-status {
  margin: 0;
  min-height: 20px;
  font-size: var(--font-size-body);
}
.editor-preparing-note {
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
</style>
