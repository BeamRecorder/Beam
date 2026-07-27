import { useI18n } from 'vue-i18n'
import type { WrappedI18n } from './types'

export function useTranslate(component: string): WrappedI18n {
  const { t, locale, availableLocales } = useI18n()

  const scopedT = (key: string, params?: Record<string, unknown>): string => {
    return params ? t(`${component}.${key}`, params as Record<string, any>) : t(`${component}.${key}`)
  }

  return {
    t: scopedT,
    locale,
    availableLocales,
  }
}