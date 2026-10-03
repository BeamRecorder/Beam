<script setup lang="ts">
import type { VNodeRef } from 'vue';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { ScrollText, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Textarea from '~/ui/textarea/Textarea.vue';
import TeleprompterToolbar from './TeleprompterToolbar.vue';
import TeleprompterResizeHandle from './TeleprompterResizeHandle.vue';
import ToastProvider from '~/ui/toast/ToastProvider.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import { useTeleprompter } from './useTeleprompter';

const { t } = useTranslate('Teleprompter');
const state = useTeleprompter();
const toast = useToastStore();
const reset = () => {
  state.resetSettings();
  toast.success(t('settingsReset'), 2400);
};
state.setVisible(false);
const setDisplayElement: VNodeRef = (element) => {
  state.setDisplayElement(element instanceof HTMLElement ? element : null);
};
const isAutoscrolling = computed(
  () => !state.isEditing.value && state.document.value.autoscroll && !state.isPaused.value,
);
const updateText = (text: string) => state.updateDocument({ text });
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
  <main
    class="teleprompter-window"
    :style="{
      '--teleprompter-font-size': state.document.value.fontSize + 'px',
      '--teleprompter-line-height': state.document.value.lineHeight,
      '--teleprompter-text': state.document.value.textColor ?? 'var(--text-primary)',
    }"
  >
    <header class="teleprompter-header">
      <div class="teleprompter-title">
        <ScrollText :size="14" aria-hidden="true" />
        <h1>{{ t('title') }}</h1>
      </div>
      <div class="teleprompter-close">
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="X"
          :aria-label="t('close')"
          :tooltip="t('close')"
          tooltip-position="bottom"
          @click="hide"
        />
      </div>
    </header>
    <section class="reader-view">
      <p v-if="state.error.value" class="teleprompter-error" role="alert">
        {{ state.error.value }}
      </p>
      <Textarea
        v-if="state.isEditing.value"
        class="teleprompter-editor"
        :model-value="state.document.value.text"
        :placeholder="t('placeholder')"
        :aria-label="t('editorLabel')"
        @update:model-value="updateText"
      />
      <section
        v-show="!state.isEditing.value"
        :ref="setDisplayElement"
        class="teleprompter-display"
        :class="{ 'is-centered': state.document.value.textAlign === 'center' }"
        :aria-label="t('readerLabel')"
      >
        <p
          v-for="(line, index) in state.lines.value"
          :key="index + '-' + line"
          :data-line-index="index"
          class="teleprompter-line"
          :class="{
            active: state.document.value.mode === 'line-by-line' && state.activeLine.value === index,
            past: state.document.value.mode === 'line-by-line' && index < state.activeLine.value,
          }"
        >
          {{ line || '\u00a0' }}
        </p>
      </section>
    </section>
    <TeleprompterToolbar
      :document="state.document.value"
      :editing="state.isEditing.value"
      :playing="isAutoscrolling"
      @update="state.updateDocument"
      @reset="reset"
      @edit="state.editScript"
      @play="state.togglePlayback"
    />
    <TeleprompterResizeHandle @error="state.error.value = $event" />
    <ToastProvider class="teleprompter-toasts" :dismiss-label="t('close')" />
  </main>
</template>
<style scoped src="./Teleprompter.css"></style>
