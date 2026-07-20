import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<'light' | 'dark' | 'system'>('system')

  // Initialize theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
    theme.value = savedTheme as any
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

  return {
    theme,
    applyTheme,
  }
})
