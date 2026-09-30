<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import { usePreferencesStore } from '~/stores/preferences';
import { useTranslate } from '~/i18n/useTranslate';
import { useInteractionAccess } from '../interactions/useInteractionAccess';
import type { PreferencePatch } from '~/api/types/capture-api';
import Button from '~/ui/button/Button.vue';
import HudPreferences from './HudPreferences.vue';

const emit = defineEmits<{ ready: [] }>();
const { t } = useTranslate('HudPreferences');
const preferences = usePreferencesStore();
const view = ref<'general' | 'shortcuts' | 'about'>('general');
const error = ref('');
const access = useInteractionAccess();
const countdown = computed(() => {
  const value = preferences.settings?.extras.recordingCountdownSeconds;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10 ? value : 3;
});
const save = async (patch: PreferencePatch) => {
  try {
    await preferences.update(patch);
    error.value = '';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
};
const saveInteractionAccess = async (enabled: boolean) => {
  try {
    await access.setEnabled(enabled);
    error.value = '';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
};
const refreshAccess = async () => {
  try {
    if (preferences.settings) access.hydrate(preferences.settings);
    await access.refresh();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
};
let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = capture.onPreferencesChanged((next) => access.hydrate(next));
  window.addEventListener('focus', refreshAccess);
  void refreshAccess();
  emit('ready');
});
onBeforeUnmount(() => {
  unsubscribe?.();
  window.removeEventListener('focus', refreshAccess);
});
</script>

<template>
  <div class="settings-window">
    <nav class="settings-navigation" :aria-label="t('preferences')">
      <Button variant="tab" :class="{ active: view === 'general' }" @click="view = 'general'">{{
        t('preferences')
      }}</Button>
      <Button variant="tab" :class="{ active: view === 'shortcuts' }" @click="view = 'shortcuts'">{{
        t('keyboardShortcuts')
      }}</Button>
      <Button variant="tab" :class="{ active: view === 'about' }" @click="view = 'about'">{{ t('about') }}</Button>
    </nav>
    <section class="settings-content">
      <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
      <HudPreferences
        v-model:view="view"
        :countdown-seconds="countdown"
        :recording-bar-visibility="preferences.settings?.recordingBar.visibility"
        :input-access="access.status.value"
        :record-interactions="access.enabled.value"
        :requesting-input-access="access.requesting.value"
        :platform="capture.platform"
        @update:countdown-seconds="save({ extras: { recordingCountdownSeconds: $event } })"
        @update:recording-bar-visibility="save({ recordingBar: { visibility: $event } })"
        @update:record-interactions="saveInteractionAccess"
        @request-input-access="access.request"
        @close="capture.close()"
      />
    </section>
  </div>
</template>

<style scoped>
.settings-window {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.settings-navigation {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 10px;
  background: var(--color-bg-app);
}
.settings-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.settings-error {
  color: var(--color-error);
  font-size: var(--font-size-body);
  padding: 12px 16px;
}
</style>
