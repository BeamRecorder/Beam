<script setup lang="ts">
import { ref } from 'vue';
import { Monitor, Moon, Sun, Keyboard, ArrowLeft } from '@lucide/vue';
import { useThemeStore } from '~/stores/theme';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Select from '~/ui/select/Select.vue';
import Badge from '~/ui/badge/Badge.vue';
import Switch from '~/ui/switch/Switch.vue';
import ShortcutPreferences from './ShortcutPreferences.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';
import SocialLinks from '~/components/socials/SocialLinks.vue';
import { localeOptions } from '~/i18n/locales';
import type { RecordingBarVisibility } from '../recorder/recording-types';
import type { InteractionAccessViewState } from '../interactions/interaction-access-types';

const { t } = useTranslate('HudPreferences');

const props = withDefaults(
  defineProps<{
    countdownSeconds: number;
    recordingBarVisibility?: RecordingBarVisibility;
    inputAccess?: InteractionAccessViewState;
    recordInteractions?: boolean;
    requestingInputAccess?: boolean;
  }>(),
  {
    recordingBarVisibility: 'always',
    inputAccess: () => ({
      state: 'checking',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    }),
    recordInteractions: false,
    requestingInputAccess: false,
  },
);

const emit = defineEmits<{
  (event: 'update:countdownSeconds', value: number): void;
  (event: 'update:recordingBarVisibility', value: RecordingBarVisibility): void;
  (event: 'update:recordInteractions', value: boolean): void;
  (event: 'requestInputAccess'): void;
  (event: 'close'): void;
}>();

const themeStore = useThemeStore();
const localeStore = useLocaleStore();
const currentView = ref<'general' | 'shortcuts'>('general');
const countdownOptions = [
  { value: 0, label: t('off') },
  { value: 3, label: t('option3s') },
  { value: 5, label: t('option5s') },
  { value: 10, label: t('option10s') },
];
const recordingBarOptions = [
  { value: 'always', label: t('alwaysVisible') },
  { value: 'auto-fade', label: t('autoFade') },
  { value: 'hover-only', label: t('hiddenUntilHovered') },
];
</script>

<template>
  <section class="preferences" :aria-label="t('preferences')">
    <Transition name="slide-view" mode="out-in">
      <!-- Sub-page: Edit Shortcuts -->
      <div v-if="currentView === 'shortcuts'" key="shortcuts" class="view-container">
        <div class="view-header">
          <Button variant="outline" size="sm" @click="currentView = 'general'">
            <template #icon><ArrowLeft class="button-icon" /></template>
            {{ t('back') }}
          </Button>
          <span class="view-title">{{ t('keyboardShortcuts') }}</span>
        </div>

        <div class="preferences-list">
          <ShortcutPreferences />
        </div>

        <Button variant="primary" size="md" block @click="currentView = 'general'">
          {{ t('done') }}
        </Button>
      </div>

      <!-- Main Preferences View -->
      <div v-else key="general" class="view-container">
        <div class="preferences-list">
          <div class="preference-item clickable" @click="currentView = 'shortcuts'">
            <div>
              <p class="preference-title">{{ t('shortcuts') }}</p>
              <p class="preference-description">{{ t('configureHotkeys') }}</p>
            </div>
            <Button variant="secondary" size="sm">
              <template #icon><Keyboard class="button-icon" /></template>
              {{ t('edit') }}
            </Button>
          </div>

          <div class="preference-item input-access-item">
            <div class="preference-copy">
              <p class="preference-title">{{ t('recordInteractions') }}</p>
              <p class="preference-description">
                {{
                  props.inputAccess.state === 'available'
                    ? t('recordInteractionsDescription')
                    : props.inputAccess.state === 'unavailable'
                      ? t('interactionAccessUnavailableDescription')
                      : t('interactionAccessDescription')
                }}
              </p>
            </div>
            <div class="input-access-actions" role="status" aria-live="polite">
              <Switch
                v-if="props.inputAccess.state === 'available'"
                :model-value="recordInteractions"
                :label="t('recordInteractions')"
                @update:model-value="emit('update:recordInteractions', $event)"
              />
              <Badge v-else-if="props.inputAccess.state === 'checking'" variant="outline">
                {{ t('checkingAccess') }}
              </Badge>
              <Button
                v-else-if="props.inputAccess.canRequest"
                variant="secondary"
                size="sm"
                :disabled="requestingInputAccess"
                @click="emit('requestInputAccess')"
              >
                <template #icon><Keyboard class="button-icon" /></template>
                {{ requestingInputAccess ? t('requestingAccess') : t('allowAccess') }}
              </Button>
              <Badge v-else variant="outline">{{ t('accessUnavailable') }}</Badge>
            </div>
          </div>

          <div class="preference-item">
            <div>
              <p class="preference-title">{{ t('recorderBar') }}</p>
              <p class="preference-description">{{ t('visibilityWhileRecording') }}</p>
            </div>
            <div class="recorder-bar-select">
              <Select
                :model-value="recordingBarVisibility ?? 'always'"
                :options="recordingBarOptions"
                direction="up"
                @update:model-value="emit('update:recordingBarVisibility', $event)"
              />
            </div>
          </div>

          <div class="preference-item">
            <div>
              <p class="preference-title">{{ t('countdown') }}</p>
              <p class="preference-description">{{ t('selectDelay') }}</p>
            </div>
            <div class="countdown-select">
              <Select
                :model-value="countdownSeconds"
                :options="countdownOptions"
                direction="up"
                @update:model-value="emit('update:countdownSeconds', $event)"
              />
            </div>
          </div>

          <div class="preference-item">
            <div>
              <p class="preference-title">{{ t('language') }}</p>
              <p class="preference-description">{{ t('chooseLanguage') }}</p>
            </div>
            <div class="countdown-select">
              <Select
                :model-value="localeStore.locale"
                :options="localeOptions"
                direction="up"
                @update:model-value="localeStore.setLocale($event)"
              />
            </div>
          </div>

          <div class="preference-item">
            <div>
              <p class="preference-title">{{ t('theme') }}</p>
              <p class="preference-description">{{ t('chooseColorMode') }}</p>
            </div>
            <ButtonGroup class="theme-controls">
              <Button
                :class="{ active: themeStore.theme === 'light' }"
                variant="tab"
                size="sm"
                @click="themeStore.theme = 'light'"
              >
                <template #icon><Sun class="button-icon" /></template>
              </Button>
              <Button
                :class="{ active: themeStore.theme === 'dark' }"
                variant="tab"
                size="sm"
                @click="themeStore.theme = 'dark'"
              >
                <template #icon><Moon class="button-icon" /></template>
              </Button>
              <Button
                :class="{ active: themeStore.theme === 'system' }"
                variant="tab"
                size="sm"
                @click="themeStore.theme = 'system'"
              >
                <template #icon><Monitor class="button-icon" /></template>
              </Button>
            </ButtonGroup>
          </div>

          <div class="preference-item update-preference-item">
            <UpdateControls />
          </div>

          <SocialLinks />
        </div>

        <Button variant="primary" size="md" block @click="emit('close')">
          {{ t('returnToHud') }}
        </Button>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.preferences {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.view-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  height: 100%;
}
.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.view-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.preferences-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
}
.preference-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.preference-copy {
  min-width: 0;
}
.input-access-item {
  gap: 10px;
}
.input-access-actions {
  flex: 0 0 auto;
}
.update-preference-item {
  min-width: 0;
  padding: 8px;
}
.update-preference-item :deep(.update-actions) {
  flex-direction: column;
  gap: 6px;
}
.update-preference-item :deep(.update-btn) {
  width: 100%;
  min-width: 0;
  white-space: normal;
  line-height: 1.15;
}
.preference-item.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.preference-item.clickable:hover {
  background-color: var(--color-bg-surface-hover);
}
.preference-title,
.preference-description {
  margin: 0;
}
.preference-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.preference-description {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}
.countdown-select {
  width: 80px;
}
.recorder-bar-select {
  width: 148px;
}
.theme-controls {
  width: auto;
  max-width: 140px;
}
.button-icon {
  width: 16px;
  height: 16px;
}

/* View Slide Transition */
.slide-view-enter-active,
.slide-view-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-view-enter-from {
  opacity: 0;
  transform: translateX(12px) scale(0.98);
}

.slide-view-leave-to {
  opacity: 0;
  transform: translateX(-12px) scale(0.98);
}
</style>
