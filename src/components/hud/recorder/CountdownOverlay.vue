<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '../../../api/capture';
import type { PreferenceSettings } from '../../../api/types/capture-api';
import KeyboardChip from '../../ui/Kbd/KeyboardChip.vue';
import { useTranslate } from '../../../i18n/useTranslate';

const { t } = useTranslate('RecorderBar');
const seconds = ref<number | null>(null);
const startStopShortcut = ref('');
const pauseResumeShortcut = ref('');
const hasShortcutHints = computed(() => Boolean(startStopShortcut.value || pauseResumeShortcut.value));
let unsubscribeCountdown: (() => void) | null = null;
let unsubscribePreferences: (() => void) | null = null;
let receivedPreferenceUpdate = false;
let mounted = false;

const shortcutKeys = (preferences: PreferenceSettings, id: string) => {
  const shortcut = preferences.shortcuts[id];
  return shortcut?.scope === 'global' ? shortcut.keys.trim() : '';
};
const applyPreferences = (preferences: PreferenceSettings) => {
  startStopShortcut.value = shortcutKeys(preferences, 'hud.startStopRecording');
  pauseResumeShortcut.value = shortcutKeys(preferences, 'hud.playPause');
};

onMounted(() => {
  mounted = true;
  unsubscribeCountdown = capture.onCountdown((value) => {
    seconds.value = value;
  });
  unsubscribePreferences = capture.onPreferencesChanged((preferences) => {
    receivedPreferenceUpdate = true;
    applyPreferences(preferences);
  });
  void capture
    .getPreferences()
    .then((preferences) => {
      if (mounted && !receivedPreferenceUpdate) applyPreferences(preferences);
    })
    .catch(() => undefined);
});
onBeforeUnmount(() => {
  mounted = false;
  unsubscribeCountdown?.();
  unsubscribePreferences?.();
});
</script>

<template>
  <main class="countdown-overlay">
    <div class="countdown" role="timer" aria-live="assertive" aria-atomic="true">{{ seconds ?? '' }}</div>
    <div v-if="hasShortcutHints" class="shortcut-hints" role="group" :aria-label="t('recordingControls')">
      <div v-if="startStopShortcut" class="shortcut-hint">
        <span>{{ t('stopRecording') }}</span>
        <KeyboardChip :shortcut="startStopShortcut" size="sm" />
      </div>
      <span v-if="startStopShortcut && pauseResumeShortcut" class="shortcut-separator" aria-hidden="true">·</span>
      <div v-if="pauseResumeShortcut" class="shortcut-hint">
        <span>{{ t('pauseRecording') }}</span>
        <KeyboardChip :shortcut="pauseResumeShortcut" size="sm" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.countdown-overlay {
  width: calc(100vw - 32px);
  height: calc(100vh - 32px);
  margin: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  pointer-events: none;
  user-select: none;
}
.countdown {
  width: 160px;
  height: 160px;
  flex: 0 0 160px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-surface);
  color: var(--text-primary);
  font-size: 88px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--shadow-lg);
}
.shortcut-hints,
.shortcut-hint {
  display: flex;
  align-items: center;
}
.shortcut-hints {
  width: max-content;
  max-width: 100%;
  min-height: 34px;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.shortcut-hint {
  min-width: 0;
  gap: 6px;
}
.shortcut-hint > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.shortcut-separator {
  color: var(--text-muted);
}
</style>
