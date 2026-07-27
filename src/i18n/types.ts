import type { ComposerTranslation, Locale } from 'vue-i18n'
import type { Ref } from 'vue'

export interface WrappedI18n {
  t: (key: string, params?: Record<string, unknown>) => string
  locale: Ref<Locale>
  availableLocales: Locale[]
}