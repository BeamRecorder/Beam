<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import { Video, Webcam, Terminal } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { SettingsEditorAction } from '~/api/types/hud-panel';
const { t } = useTranslate('SettingsPanel');
const available = ref(false);
const pending = ref<SettingsEditorAction | null>(null);
const error = ref('');
onMounted(async () => {
  try {
    const context = await capture.getSettingsEditorContext();
    available.value = !!context && context.kind !== 'screenshot';
  } catch (reason) {
    error.value = String(reason);
  }
});
const actions = [
  { id: 'recorder', label: 'recorderTool', description: 'recorderDesc', icon: Video, button: 'launchRecorder' },
  {
    id: 'webcam',
    label: 'fakeWebcamTitle',
    description: 'fakeWebcamDescription',
    icon: Webcam,
    button: 'addFakeWebcamOverlay',
  },
  { id: 'devtools', label: 'devToolsTool', description: 'devToolsDesc', icon: Terminal, button: 'openDevTools' },
] as const;
const run = async (action: SettingsEditorAction) => {
  if (pending.value) return;
  pending.value = action;
  error.value = '';
  try {
    await capture.runSettingsEditorAction(action);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    pending.value = null;
  }
};
</script>
<template>
  <section v-if="available || error" class="preference-stack">
    <div v-for="action in available ? actions : []" :key="action.id" class="preference-item">
      <div class="preference-copy">
        <p class="preference-title">{{ t(action.label) }}</p>
        <p class="preference-description">{{ t(action.description) }}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        :icon="action.icon"
        :loading="pending === action.id"
        :disabled="pending !== null"
        @click="run(action.id)"
        >{{ t(action.button) }}</Button
      >
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped src="./settings-content.css"></style>
<style scoped>
p[role='alert'] {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
