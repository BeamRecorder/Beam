import { defineStore } from 'pinia'
import { ref } from 'vue'
import { capture } from '../api/capture'
import type { PreferenceSettings } from '../api/types/capture-api'

export const usePreferencesStore = defineStore('preferences', () => {
  const settings = ref<PreferenceSettings | null>(null)
  let unsubscribe: (() => void) | null = null
  const load = async () => {
    settings.value = await capture.getPreferences()
    unsubscribe ??= capture.onPreferencesChanged((next) => { settings.value = next })
    return settings.value
  }
  const update = async (patch: Partial<PreferenceSettings>) => { settings.value = await capture.updatePreferences(patch); return settings.value }
  return { settings, load, update }
})
