<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePreferencesStore } from '~/stores/preferences'
import ShortcutInput from '~/ui/input/ShortcutInput.vue'
import { useTranslate } from '~/i18n/useTranslate'
import { TELEPROMPTER_SHORTCUTS } from '../teleprompter/shortcut-definitions'

const { t } = useTranslate('ShortcutPreferences')
const preferencesStore = usePreferencesStore()
const shortcutErrors = ref<Record<string, string>>({})

const shortcutDefinitions = [
  { id: 'hud.startStopRecording', label: () => t('startStopRecording'), description: () => t('startStopRecordingDesc') },
  { id: 'hud.playPause', label: () => t('pauseResume'), description: () => t('pauseResumeDesc') },
  { id: 'hud.toggleMic', label: () => t('micOnOff'), description: () => t('micOnOffDesc') },
  { id: 'hud.toggleCamera', label: () => t('cameraOnOff'), description: () => t('cameraOnOffDesc') },
  { id: 'hud.toggleSystemAudio', label: () => t('systemAudioOnOff'), description: () => t('systemAudioOnOffDesc') },
  { id: 'teleprompter.toggleVisibility', label: () => t('teleprompterVisibility'), description: () => t('teleprompterVisibilityDesc') },
  { id: 'teleprompter.toggleAutoscroll', label: () => t('teleprompterAutoscroll'), description: () => t('teleprompterAutoscrollDesc') },
  { id: 'teleprompter.nextLine', label: () => t('teleprompterNextLine'), description: () => t('teleprompterNextLineDesc') },
  { id: 'teleprompter.previousLine', label: () => t('teleprompterPreviousLine'), description: () => t('teleprompterPreviousLineDesc') },
]

const defaultShortcuts: Record<string, string> = {
  'hud.startStopRecording': 'Alt+Shift+R',
  'hud.playPause': 'Alt+Shift+P',
  'hud.toggleMic': 'Alt+Shift+M',
  'hud.toggleCamera': 'Alt+Shift+C',
  'hud.toggleSystemAudio': 'Alt+Shift+A',
  ...Object.fromEntries(TELEPROMPTER_SHORTCUTS.map(({ id, defaultKeys }) => [id, defaultKeys])),
}

onMounted(() => {
  preferencesStore.load()
})

const getShortcutValue = (id: string): string => {
  return preferencesStore.settings?.shortcuts?.[id]?.keys ?? defaultShortcuts[id] ?? ''
}

const checkDuplicates = (targetId: string, value: string) => {
  const errors: Record<string, string> = { ...shortcutErrors.value }
  delete errors[targetId]

  if (!value) {
    shortcutErrors.value = errors
    return false
  }

  const normalizedVal = value.toLowerCase()

  const shortcuts = preferencesStore.settings?.shortcuts || {}
  for (const [id, s] of Object.entries(shortcuts)) {
    if (id !== targetId && s.keys && s.keys.toLowerCase() === normalizedVal) {
      const match = shortcutDefinitions.find((def) => def.id === id)
      const name = match ? match.label() : id
      errors[targetId] = t('conflictWith', { name })
      shortcutErrors.value = errors
      return true
    }
  }

  shortcutErrors.value = errors
  return false
}

const updateShortcut = async (id: string, keys: string) => {
  const hasConflict = checkDuplicates(id, keys)
  if (hasConflict) return

  const currentShortcuts = preferencesStore.settings?.shortcuts || {}
  const existing = currentShortcuts[id] || { scope: 'global', category: 'hud' }

  if (existing.keys === keys) {
    // If setting to same value, clear any error and return cleanly
    const errors = { ...shortcutErrors.value }
    delete errors[id]
    shortcutErrors.value = errors
    return
  }

  // Create plain shortcuts copy without reactivity proxies
  const updatedShortcuts = JSON.parse(JSON.stringify(currentShortcuts))
  updatedShortcuts[id] = {
    ...existing,
    keys,
  }

  try {
    await preferencesStore.update({
      shortcuts: updatedShortcuts,
    })
  } catch (err: any) {
    shortcutErrors.value = {
      ...shortcutErrors.value,
      [id]: err?.message || t('failedToUpdate'),
    }
  }
}

const resetShortcut = async (id: string) => {
  const defaultKey = defaultShortcuts[id] || ''
  await updateShortcut(id, defaultKey)
}
</script>

<template>
  <div class="shortcut-preferences">
    <div
      v-for="item in shortcutDefinitions"
      :key="item.id"
      class="shortcut-row"
    >
      <div class="shortcut-info">
        <span class="shortcut-label">{{ item.label() }}</span>
        <span class="shortcut-desc">{{ item.description() }}</span>
      </div>
      <div class="shortcut-input-container">
        <ShortcutInput
          :model-value="getShortcutValue(item.id)"
          :error="shortcutErrors[item.id]"
          @update:model-value="updateShortcut(item.id, $event)"
          @reset="resetShortcut(item.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcut-preferences {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.shortcut-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.shortcut-desc {
  font-size: 10px;
  color: var(--text-muted);
}

.shortcut-input-container {
  width: 160px;
  flex-shrink: 0;
}
</style>
