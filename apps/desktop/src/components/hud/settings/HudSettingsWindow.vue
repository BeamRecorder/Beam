<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, X } from '@lucide/vue';
import { capture } from '~/api/capture';
import { usePreferencesStore } from '~/stores/preferences';
import { useTranslate } from '~/i18n/useTranslate';
import { useInteractionAccess } from '../interactions/useInteractionAccess';
import type { PreferencePatch } from '~/api/types/capture-api';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import HudPreferences from './HudPreferences.vue';
import SettingsSearchResults from './SettingsSearchResults.vue';
import { settingsCategories, settingsSearchEntries } from './settings-catalog';
import { createSettingsSearch, normalizeSettingsSearch } from './settings-search';
import type { SettingsSearchEntry, SettingsView } from './settings-types';

const emit = defineEmits<{ ready: [] }>();
const { t } = useTranslate('HudPreferences');
const { t: translate, locale } = useI18n();
const preferences = usePreferencesStore();
const categories = settingsCategories(import.meta.env.DEV);
const view = ref<SettingsView>('general');
const query = ref('');
const searchInput = ref<InstanceType<typeof Input>>();
const focusedSetting = ref<string>();
const searching = computed(() => Boolean(normalizeSettingsSearch(query.value)));
const searchIndex = computed(() => {
  // Locale is an explicit dependency: Vue I18n's English lookup must not replace it.
  void locale.value;
  return createSettingsSearch(
    settingsSearchEntries(
      (key) => translate(key, { version: '' }),
      (key) => translate(key, { version: '' }, { locale: 'en' }),
      import.meta.env.DEV,
      capture.platform,
    ),
  );
});
const results = computed(() => searchIndex.value.search(query.value));
const navigate = (next: SettingsView) => {
  view.value = next;
  query.value = '';
  focusedSetting.value = undefined;
};
const openResult = (entry: SettingsSearchEntry) => {
  view.value = entry.view;
  focusedSetting.value = entry.id;
  query.value = '';
};
let windowActive = document.hasFocus();
const windowBlurred = () => {
  windowActive = false;
};
const searchKeydown = (event: KeyboardEvent) => {
  if (!windowActive || event.defaultPrevented || event.isComposing) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    searchInput.value?.focus();
  } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
    )
      return;
    event.preventDefault();
    query.value += event.key;
    searchInput.value?.focus();
  } else if (event.key === 'Escape' && query.value) {
    event.preventDefault();
    query.value = '';
    searchInput.value?.focus();
  }
};
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
const windowFocused = () => {
  windowActive = true;
  searchInput.value?.focus();
  void refreshAccess();
};
let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = capture.onPreferencesChanged((next) => access.hydrate(next));
  window.addEventListener('focus', windowFocused);
  window.addEventListener('blur', windowBlurred);
  searchInput.value?.focus();
  void refreshAccess();
  emit('ready');
});
onBeforeUnmount(() => {
  unsubscribe?.();
  window.removeEventListener('focus', windowFocused);
  window.removeEventListener('blur', windowBlurred);
});
</script>

<template>
  <div class="settings-window" @keydown="searchKeydown">
    <nav class="settings-navigation" :aria-label="t('preferences')">
      <div class="settings-search">
        <Input
          ref="searchInput"
          :model-value="query"
          size="sm"
          type="search"
          :placeholder="t('searchSettings')"
          :aria-label="t('searchSettings')"
          autocomplete="off"
          :spellcheck="false"
          @update:model-value="query = String($event)"
        >
          <template #prefix><Search :size="15" aria-hidden="true" /></template>
          <template v-if="query" #suffix
            ><Button
              variant="ghost"
              size="xs"
              :icon="X"
              icon-only
              :aria-label="t('clearSearch')"
              @click="
                query = '';
                searchInput?.focus();
              "
          /></template>
        </Input>
      </div>
      <Button
        v-for="category in categories"
        :key="category.id"
        variant="ghost"
        size="sm"
        block
        :aria-current="!searching && view === category.id ? 'page' : undefined"
        :style="{
          justifyContent: 'flex-start',
          height: '42px',
          padding: '0 10px',
          color: 'var(--text-primary)',
          background: !searching && view === category.id ? 'var(--color-bg-field-active)' : 'transparent',
        }"
        @click="navigate(category.id)"
      >
        <template #icon
          ><span class="category-icon" :style="{ background: category.color }"
            ><component :is="category.icon" :size="15" aria-hidden="true" /></span
        ></template>
        {{ t(category.label) }}
      </Button>
    </nav>
    <section class="settings-content">
      <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
      <SettingsSearchResults v-if="searching" :query="query" :results="results" @select="openResult" />
      <HudPreferences
        v-else
        v-model:view="view"
        :focused-setting="focusedSetting"
        :countdown-seconds="countdown"
        :show-real-cursor="preferences.settings?.extras.showRealCursor === true"
        :hide-taskbar="preferences.settings?.extras.hideTaskbar === true"
        :hide-desktop-icons="preferences.settings?.extras.hideDesktopIcons === true"
        @update:hide-taskbar="save({ extras: { hideTaskbar: $event } })"
        @update:hide-desktop-icons="save({ extras: { hideDesktopIcons: $event } })"
        @update:show-real-cursor="save({ extras: { showRealCursor: $event } })"
        :always-on-top="preferences.settings?.alwaysOnTop ?? true"
        :recording-bar-visibility="preferences.settings?.recordingBar.visibility"
        :input-access="access.status.value"
        :record-interactions="access.enabled.value"
        :requesting-input-access="access.requesting.value"
        :platform="capture.platform"
        @update:countdown-seconds="save({ extras: { recordingCountdownSeconds: $event } })"
        @update:always-on-top="save({ alwaysOnTop: $event })"
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
  grid-template-columns: 210px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  background: var(--color-bg-surface);
  color: var(--text-primary);
}
.settings-navigation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 12px;
  overflow-y: auto;
  background: var(--color-bg-field);
}
.settings-search {
  margin-bottom: 18px;
  min-width: 0;
}
.category-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--text-light);
  flex: none;
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
@media (max-width: 700px) {
  .settings-window {
    grid-template-columns: 190px minmax(0, 1fr);
  }
}
</style>
