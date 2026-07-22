<script setup lang="ts">
import { ref } from 'vue'
import { Monitor, Moon, Sun, Keyboard, ArrowLeft } from '@lucide/vue'
import { useThemeStore } from '~/stores/theme'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Select from '~/ui/select/Select.vue'
import ShortcutPreferences from './ShortcutPreferences.vue'

defineProps<{
  countdownSeconds: number
  recordingBarVisibility?: 'always' | 'auto-fade'
}>()

const emit = defineEmits<{
  (event: 'update:countdownSeconds', value: number): void
  (event: 'update:recordingBarVisibility', value: 'always' | 'auto-fade'): void
  (event: 'close'): void
}>()

const themeStore = useThemeStore()
const currentView = ref<'general' | 'shortcuts'>('general')

const countdownOptions = [
  { value: 0, label: 'Off' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
]
const recordingBarOptions = [
  { value: 'always', label: 'Always visible' },
  { value: 'auto-fade', label: 'Auto-fade' },
]
</script>

<template>
  <section class="preferences" aria-label="Preferences">
    <Transition name="slide-view" mode="out-in">
      <!-- Sub-page: Edit Shortcuts -->
      <div v-if="currentView === 'shortcuts'" key="shortcuts" class="view-container">
        <div class="view-header">
          <Button variant="outline" size="sm" @click="currentView = 'general'">
            <template #icon><ArrowLeft class="button-icon" /></template>
            Back
          </Button>
          <span class="view-title">Keyboard Shortcuts</span>
        </div>

        <div class="preferences-list">
          <ShortcutPreferences />
        </div>

        <Button variant="primary" size="md" block @click="currentView = 'general'">
          Done
        </Button>
      </div>

      <!-- Main Preferences View -->
      <div v-else key="general" class="view-container">
        <div class="preferences-list">
          <div class="preference-item clickable" @click="currentView = 'shortcuts'">
            <div>
              <p class="preference-title">Shortcuts</p>
              <p class="preference-description">Configure hotkeys & actions</p>
            </div>
            <Button variant="secondary" size="sm">
              <template #icon><Keyboard class="button-icon" /></template>
              Edit
            </Button>
          </div>

          <div class="preference-item">
            <div>
              <p class="preference-title">Recorder bar</p>
              <p class="preference-description">Visibility while recording</p>
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
              <p class="preference-title">Countdown</p>
              <p class="preference-description">Select delay before start</p>
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
              <p class="preference-title">Theme</p>
              <p class="preference-description">Choose color mode</p>
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
        </div>

        <Button variant="primary" size="md" block @click="emit('close')">
          Return to HUD
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
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
