<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePreferencesStore } from '~/stores/preferences'
import ShortcutInput from '~/ui/input/ShortcutInput.vue'

const preferencesStore = usePreferencesStore()
const shortcutErrors = ref<Record<string, string>>({})

const shortcutDefinitions = [
  { id: 'hud.startStopRecording', label: 'Start / Stop Recording', description: 'Global shortcut to toggle recording' },
  { id: 'hud.playPause', label: 'Pause / Resume', description: 'Global shortcut to pause or resume recording' },
  { id: 'hud.toggleMic', label: 'Microphone On / Off', description: 'Toggle microphone audio' },
  { id: 'hud.toggleCamera', label: 'Camera On / Off', description: 'Toggle camera overlay' },
  { id: 'hud.toggleSystemAudio', label: 'System Audio On / Off', description: 'Toggle internal system audio' },
]

const defaultShortcuts: Record<string, string> = {
  'hud.startStopRecording': 'Alt+Shift+R',
  'hud.playPause': 'Alt+Shift+P',
  'hud.toggleMic': 'Alt+Shift+M',
  'hud.toggleCamera': 'Alt+Shift+C',
  'hud.toggleSystemAudio': 'Alt+Shift+A',
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
      const name = match?.label || id
      errors[targetId] = `Conflict with "${name}"`
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
      [id]: err?.message || 'Failed to update shortcut',
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
        <span class="shortcut-label">{{ item.label }}</span>
        <span class="shortcut-desc">{{ item.description }}</span>
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
