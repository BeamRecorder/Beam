<script setup lang="ts">
import { computed } from 'vue';
import { Keyboard, Info, Sparkles } from '@lucide/vue';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import Badge from '~/ui/badge/Badge.vue';
import Switch from '~/ui/switch/Switch.vue';
import Divider from '~/ui/divider/Divider.vue';
import ShortcutPreferences from './ShortcutPreferences.vue';
import About from './About.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';
import SocialLinks from '~/components/socials/SocialLinks.vue';
import AppearanceSettings from '~/components/settings/AppearanceSettings.vue';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';
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
    platform?: string;
    alwaysOnTop?: boolean;
    view?: 'general' | 'shortcuts' | 'about';
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
    platform: 'unknown',
    alwaysOnTop: true,
    view: 'general',
  },
);

const emit = defineEmits<{
  (event: 'update:countdownSeconds', value: number): void;
  (event: 'update:recordingBarVisibility', value: RecordingBarVisibility): void;
  (event: 'update:recordInteractions', value: boolean): void;
  (event: 'requestInputAccess'): void;
  (event: 'update:alwaysOnTop', value: boolean): void;
  (event: 'update:view', value: 'general' | 'shortcuts' | 'about'): void;
  (event: 'close'): void;
}>();

const localeStore = useLocaleStore();
const currentView = computed({
  get: () => props.view,
  set: (val) => emit('update:view', val),
});
const inputDescription = computed(() => {
  if (props.inputAccess.state === 'unavailable') return t('interactionAccessUnavailableDescription');
  if (props.inputAccess.state === 'available') {
    return t(props.platform === 'linux' ? 'recordInteractionsDescriptionLinux' : 'recordInteractionsDescription');
  }
  return t(props.platform === 'linux' ? 'interactionAccessDescriptionLinux' : 'interactionAccessDescription');
});

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
const updateRecordingBarVisibility = (value: string | number) => {
  if (typeof value === 'string') emit('update:recordingBarVisibility', value as RecordingBarVisibility);
};
const updateCountdownSeconds = (value: string | number) => {
  if (typeof value === 'number') emit('update:countdownSeconds', value);
};
const updateLocale = (value: string | number) => {
  if (typeof value === 'string' && isSupportedLocale(value)) localeStore.setLocale(value);
};

const openOnboarding = () => {
  void capture.openOnboarding();
  emit('close');
};
</script>

<template>
  <section class="preferences" :aria-label="t('preferences')">
    <Transition name="slide-view" mode="out-in">
      <!-- Sub-page: Edit Shortcuts -->
      <div v-if="currentView === 'shortcuts'" key="shortcuts" class="view-container">
        <div class="preferences-list shortcut-view-list">
          <ShortcutPreferences />
        </div>
      </div>

      <!-- Sub-page: About -->
      <div v-else-if="currentView === 'about'" key="about" class="view-container">
        <About />
      </div>

      <!-- Main Preferences View -->
      <div v-else key="general" class="view-container">
        <div class="preferences-list">
          <!-- Category: Recording -->
          <div class="preference-category-divider">
            <Divider :label="t('categoryRecording')" spacing="none" />
          </div>

          <div class="preference-item clickable" @click="currentView = 'shortcuts'">
            <div class="preference-copy">
              <p class="preference-title">{{ t('shortcuts') }}</p>
              <p class="preference-description">{{ t('configureHotkeys') }}</p>
            </div>
            <Button variant="secondary" size="sm" class="preference-control">
              <template #icon><Keyboard class="button-icon" /></template>
              {{ t('edit') }}
            </Button>
          </div>

          <div class="preference-item input-access-item">
            <div class="preference-copy">
              <p class="preference-title">{{ t('recordInteractions') }}</p>
              <p class="preference-description">{{ inputDescription }}</p>
            </div>
            <div class="input-access-actions" role="status" aria-live="polite">
              <Switch
                v-if="props.inputAccess.state === 'available'"
                :model-value="recordInteractions"
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
            <div class="preference-copy">
              <p class="preference-title">{{ t('recorderBar') }}</p>
              <p class="preference-description">{{ t('visibilityWhileRecording') }}</p>
            </div>
            <div class="recorder-bar-select preference-control">
              <Select
                :model-value="recordingBarVisibility ?? 'always'"
                :options="recordingBarOptions"
                size="sm"
                direction="up"
                @update:model-value="updateRecordingBarVisibility"
              />
            </div>
          </div>

          <div class="preference-item">
            <div class="preference-copy">
              <p class="preference-title">{{ t('countdown') }}</p>
              <p class="preference-description">{{ t('selectDelay') }}</p>
            </div>
            <div class="countdown-select preference-control">
              <Select
                :model-value="countdownSeconds"
                :options="countdownOptions"
                size="sm"
                direction="up"
                @update:model-value="updateCountdownSeconds"
              />
            </div>
          </div>

          <!-- Category: General -->
          <div class="preference-category-divider">
            <Divider :label="t('categoryGeneral')" spacing="none" />
          </div>

          <div class="preference-item">
            <div class="preference-copy">
              <p class="preference-title">{{ t('alwaysOnTop') }}</p>
              <p class="preference-description">{{ t('alwaysOnTopDesc') }}</p>
            </div>
            <div class="preference-control">
              <Switch :model-value="alwaysOnTop ?? true" @update:model-value="emit('update:alwaysOnTop', $event)" />
            </div>
          </div>

          <div class="preference-item">
            <div class="preference-copy">
              <p class="preference-title">{{ t('language') }}</p>
              <p class="preference-description">{{ t('chooseLanguage') }}</p>
            </div>
            <div class="language-select preference-control">
              <Select
                :model-value="localeStore.locale"
                :options="localeOptions"
                size="sm"
                direction="up"
                @update:model-value="updateLocale"
              />
            </div>
          </div>

          <div class="preference-item preference-appearance-item">
            <AppearanceSettings :show-title="false" :compact="true" />
          </div>

          <!-- Category: About -->
          <div class="preference-category-divider">
            <Divider :label="t('categoryAbout')" spacing="none" />
          </div>

          <div class="preference-item update-preference-item">
            <UpdateControls />
          </div>

          <div class="preference-socials">
            <SocialLinks />
          </div>

          <div class="preference-item clickable" @click="currentView = 'about'">
            <div class="preference-copy">
              <p class="preference-title">{{ t('about') }}</p>
              <p class="preference-description">{{ t('aboutDesc') }}</p>
            </div>
            <Button variant="secondary" size="sm" class="preference-control">
              <template #icon><Info class="button-icon" /></template>
              {{ t('view') }}
            </Button>
          </div>

          <div class="preference-item clickable" @click="openOnboarding">
            <div class="preference-copy">
              <p class="preference-title">{{ t('onboarding') }}</p>
              <p class="preference-description">{{ t('onboardingDesc') }}</p>
            </div>
            <Button variant="secondary" size="sm" class="preference-control">
              <template #icon><Sparkles class="button-icon" /></template>
              {{ t('relaunchOnboarding') }}
            </Button>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.preferences {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  min-height: 0;
  width: 100%;
}
.view-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
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
  gap: 0;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  width: 100%;
  padding: 0 0 12px 0;
}
.preference-category-divider {
  padding: 14px 16px 6px;
  box-sizing: border-box;
  width: 100%;
}
.preference-category-divider:first-child {
  padding-top: 10px;
}
.shortcut-view-list {
  padding: 16px;
}
.preference-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  background: transparent;
  border-bottom: 1px solid var(--color-border);
  box-sizing: border-box;
  width: 100%;
  transition: background-color 0.15s ease;
}
.preference-appearance-item {
  flex-direction: column;
  align-items: stretch;
}
.preference-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preference-control {
  flex-shrink: 0;
}
.input-access-item {
  gap: 12px;
}
.input-access-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.update-preference-item {
  min-width: 0;
  padding: 11px 16px;
}
.preference-socials {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  box-sizing: border-box;
  width: 100%;
}
.preference-item.clickable {
  cursor: pointer;
}
.preference-item:hover {
  background-color: color-mix(in srgb, var(--color-bg-surface-hover) 50%, transparent);
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
  line-height: 1.3;
  color: var(--text-primary);
}
.preference-description {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}
.countdown-select {
  width: 84px;
}
.language-select {
  width: 136px;
}
.recorder-bar-select {
  width: 140px;
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
