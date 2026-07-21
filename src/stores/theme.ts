import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  // A deterministic light default prevents the HUD from following an OS dark
  // scheme before the user has explicitly chosen a preference.
  const theme = ref<'light' | 'dark' | 'system'>('light')

  // Initialize theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
    theme.value = savedTheme
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const applyTheme = () => {
    const root = document.documentElement
    const isDark = theme.value === 'dark' || (theme.value === 'system' && mediaQuery.matches)
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // Watch for changes in select choice
  watch(theme, () => {
    localStorage.setItem('theme', theme.value)
    applyTheme()
  }, { immediate: true })

  // Listen to OS scheme changes
  mediaQuery.addEventListener('change', () => {
    if (theme.value === 'system') {
      applyTheme()
    }
  })

  // The camera overlay is a separate Electron renderer. Sync a preference
  // changed in the main window immediately instead of waiting for reload.
  window.addEventListener('storage', (event) => {
    if (event.key !== 'theme') return
    if (event.newValue === 'light' || event.newValue === 'dark' || event.newValue === 'system') {
      theme.value = event.newValue
    }
  })

  return {
    theme,
    applyTheme,
  }
})
