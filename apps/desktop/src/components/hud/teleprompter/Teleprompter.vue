<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import TeleprompterView from './TeleprompterView.vue';
import { useThemeStore } from '~/stores/theme';
import TeleprompterResizeHandle from './TeleprompterResizeHandle.vue';
import ToastProvider from '~/ui/toast/ToastProvider.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import { useTeleprompter } from './useTeleprompter';

const { t } = useTranslate('Teleprompter');
const state = useTeleprompter();
const theme = useThemeStore();
const toast = useToastStore();
const reset = () => {
  state.resetSettings();
  toast.success(t('settingsReset'), 2400);
};
state.setVisible(false);
const isAutoscrolling = computed(
  () => !state.isEditing.value && state.document.value.autoscroll && !state.isPaused.value,
);
const initialOpacity = document.body.style.opacity;
watch(
  () => state.document.value.windowOpacity,
  (value) => {
    document.body.style.opacity = String(value ?? 1);
  },
  { immediate: true },
);
const hide = () => capture.hideTeleprompter();
const onSession = (event: Event) => {
  const context = (event as CustomEvent).detail ?? null;
  // A session is created when recording starts. The script should immediately
  // become a clean reader, while remaining editable before recording.
  if (context) state.isEditing.value = false;
  void state.applySession(context);
};
const onShortcut = (event: Event) => state.handleShortcut(String((event as CustomEvent).detail ?? ''));
let mounted = false;
let unsubscribeSuspend: (() => void) | null = null;
let unsubscribeVisibility: (() => void) | null = null;
let nativeVisible = false;
const updateVisibility = () => state.setVisible(nativeVisible && !document.hidden);
onMounted(async () => {
  mounted = true;
  updateVisibility();
  document.addEventListener('visibilitychange', updateVisibility);
  unsubscribeVisibility = capture.onTeleprompterVisibility((visible) => {
    nativeVisible = visible;
    updateVisibility();
  });
  unsubscribeSuspend = capture.onTeleprompterSuspend(async (id) => {
    capture.acknowledgeTeleprompterSuspend(id, await state.suspendState());
  });
  try {
    const resume = await capture.getTeleprompterResumeState();
    if (!mounted) return;
    if (resume) await state.restoreState(resume);
  } catch (error) {
    state.error.value = error instanceof Error ? error.message : String(error);
  }
  if (!mounted) return;
  window.addEventListener('teleprompter-session', onSession);
  window.addEventListener('teleprompter-shortcut', onShortcut);
  capture.notifyTeleprompterReady?.();
});
onBeforeUnmount(() => {
  mounted = false;
  document.body.style.opacity = initialOpacity;
  unsubscribeSuspend?.();
  unsubscribeVisibility?.();
  document.removeEventListener('visibilitychange', updateVisibility);
  window.removeEventListener('teleprompter-session', onSession);
  window.removeEventListener('teleprompter-shortcut', onShortcut);
});
</script>

<template>
  <TeleprompterView
    :document="state.document.value"
    :editing="state.isEditing.value"
    :playing="isAutoscrolling"
    :active-line="state.activeLine.value"
    :error="state.error.value"
    :default-text-color="theme.isDarkMode ? '#f8fafc' : '#1e1e1e'"
    @display="state.setDisplayElement"
    @close="hide"
    @update="state.updateDocument"
    @reset="reset"
    @edit="state.editScript"
    @play="state.togglePlayback"
  >
    <TeleprompterResizeHandle @error="state.error.value = $event" />
    <ToastProvider class="teleprompter-toasts" :dismiss-label="t('close')" />
  </TeleprompterView>
</template>
<style scoped src="./Teleprompter.css"></style>
