<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import About from './About.vue';
import GeneralPreferences from './GeneralPreferences.vue';
import RecordingPreferences from './RecordingPreferences.vue';
import AccessibilityPreferences from './AccessibilityPreferences.vue';
import ShortcutPreferences from './ShortcutPreferences.vue';
import DeveloperPreferences from './DeveloperPreferences.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';
import { SETTINGS_CATEGORIES } from './settings-catalog';
import type { HudPreferenceProps, SettingsView } from './settings-types';
import type { RecordingBarVisibility } from '../recorder/recording-types';

const props = withDefaults(defineProps<HudPreferenceProps>(), {
  view: 'general',
  alwaysOnTop: true,
  recordingBarVisibility: 'always',
  recordInteractions: false,
  requestingInputAccess: false,
  platform: 'unknown',
  inputAccess: () => ({ state: 'checking', canRequest: false, clicks: false, shortcuts: false, recordsText: false }),
});
const emit = defineEmits<{
  'update:countdownSeconds': [number];
  'update:alwaysOnTop': [boolean];
  'update:recordingBarVisibility': [RecordingBarVisibility];
  'update:recordInteractions': [boolean];
  requestInputAccess: [];
  'update:view': [SettingsView];
  close: [];
}>();
const { t } = useTranslate('HudPreferences');
const root = ref<HTMLElement>();
const development = import.meta.env.DEV;
const direction = ref('next');
const category = computed(() => SETTINGS_CATEGORIES.find(({ id }) => id === props.view)!);
watch(
  () => props.view,
  (next, previous) => {
    const index = (view: SettingsView) => SETTINGS_CATEGORIES.findIndex(({ id }) => id === view);
    direction.value = index(next) > index(previous) ? 'next' : 'previous';
  },
);
const focusSetting = async () => {
  await nextTick();
  if (!props.focusedSetting) return;
  const target = [...(root.value?.querySelectorAll<HTMLElement>('[data-setting]') ?? [])].find(
    (element) => element.dataset.setting === props.focusedSetting,
  );
  if (!target) return;
  target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  (target.querySelector<HTMLElement>('button, input, [role="switch"]') ?? target).focus({ preventScroll: true });
};
watch(() => props.focusedSetting, focusSetting);
onMounted(focusSetting);
</script>

<template>
  <section ref="root" class="preferences" :aria-label="t(category.label)">
    <Transition :name="`settings-${direction}`" mode="out-in" @after-enter="focusSetting">
      <div :key="view" class="view-container">
        <header class="view-header">
          <h1>{{ t(category.label) }}</h1>
          <p>{{ t(category.description) }}</p>
        </header>
        <GeneralPreferences v-if="view === 'general'" :focused-setting="focusedSetting" @close="emit('close')" />
        <RecordingPreferences
          v-else-if="view === 'recording'"
          :countdown-seconds="countdownSeconds"
          :always-on-top="alwaysOnTop"
          :recording-bar-visibility="recordingBarVisibility"
          @update:countdown-seconds="emit('update:countdownSeconds', $event)"
          @update:always-on-top="emit('update:alwaysOnTop', $event)"
          @update:recording-bar-visibility="emit('update:recordingBarVisibility', $event)"
        />
        <AccessibilityPreferences
          v-else-if="view === 'accessibility'"
          :input-access="inputAccess"
          :record-interactions="recordInteractions"
          :requesting-input-access="requestingInputAccess"
          :platform="platform"
          @request-input-access="emit('requestInputAccess')"
          @update:record-interactions="emit('update:recordInteractions', $event)"
        />
        <ShortcutPreferences v-else-if="view === 'shortcuts'" />
        <div v-else-if="view === 'updates'" class="updates-card" data-setting="updates" tabindex="-1">
          <UpdateControls show-icon />
        </div>
        <DeveloperPreferences v-else-if="view === 'developer' && development" />
        <About v-else-if="view === 'about'" />
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.preferences {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
}
.view-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px;
}
.view-header {
  margin-bottom: 24px;
}
.view-header h1 {
  font-size: 24px;
  font-weight: var(--weight-display);
  letter-spacing: -0.5px;
  line-height: 1.2;
}
.view-header p {
  margin: 8px 0 0;
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  line-height: 1.5;
}
.updates-card {
  background: var(--color-bg-element);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.settings-next-enter-active,
.settings-next-leave-active,
.settings-previous-enter-active,
.settings-previous-leave-active {
  transition:
    opacity 120ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.settings-next-enter-from,
.settings-previous-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.settings-next-leave-to,
.settings-previous-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
@media (prefers-reduced-motion: reduce) {
  .settings-next-enter-active,
  .settings-next-leave-active,
  .settings-previous-enter-active,
  .settings-previous-leave-active {
    transition: none;
  }
  .settings-next-enter-from,
  .settings-next-leave-to,
  .settings-previous-enter-from,
  .settings-previous-leave-to {
    transform: none;
  }
}
@media (max-width: 700px) {
  .view-container {
    padding: 20px;
  }
}
</style>
