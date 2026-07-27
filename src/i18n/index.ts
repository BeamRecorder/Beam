import { createI18n } from 'vue-i18n'
import enHUD from './en/HUD.json'
import enTopbarHUD from './en/TopbarHUD.json'
import enHudPreferences from './en/HudPreferences.json'
import enSettingsPanel from './en/SettingsPanel.json'
import frHUD from './fr/HUD.json'
import frTopbarHUD from './fr/TopbarHUD.json'
import frHudPreferences from './fr/HudPreferences.json'
import frSettingsPanel from './fr/SettingsPanel.json'

const messages = {
  en: {
    HUD: enHUD,
    TopbarHUD: enTopbarHUD,
    HudPreferences: enHudPreferences,
    SettingsPanel: enSettingsPanel,
  },
  fr: {
    HUD: frHUD,
    TopbarHUD: frTopbarHUD,
    HudPreferences: frHudPreferences,
    SettingsPanel: frSettingsPanel,
  },
}

function detectLocale(): string {
  try {
    const stored = localStorage.getItem('locale')
    if (stored === 'en' || stored === 'fr') return stored
    const navLang = navigator.language
    if (navLang.startsWith('fr')) return 'fr'
  } catch {
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages,
})

export function initI18n() {
  return i18n
}

export function getCurrentLocale(): string {
  return i18n.global.locale.value
}

export function setCurrentLocale(locale: 'en' | 'fr') {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem('locale', locale)
  } catch {
  }
}