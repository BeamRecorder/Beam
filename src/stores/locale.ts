import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getCurrentLocale, setCurrentLocale } from '../i18n'

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<'en' | 'fr'>(getCurrentLocale() as 'en' | 'fr')

  function setLocale(lang: 'en' | 'fr') {
    locale.value = lang
    setCurrentLocale(lang)
  }

  return {
    locale,
    setLocale,
  }
})