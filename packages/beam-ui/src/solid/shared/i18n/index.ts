import { loadI18n, selectLocale, getI18nState, type I18nArgs } from '@argui/i18n'
import { useI18n } from '@argui/i18n/solid'
import catalogs from './catalogs.generated.json'
import type { BeamApi } from '../beamApi'
import localeOptions from './localeOptions.generated.json'
export { localeOptions }

/** Native formatting is installed before any Solid owner translates a label. */
export function initializeBeamI18n(): void { loadI18n(catalogs) }

/** Event snapshots take precedence over an older, pending initial read. */
export function observeBeamI18n(api: BeamApi): () => void {
  let revision = 0
  let disposed = false
  const select = (locale: string) => {
    if (getI18nState().locale !== locale) selectLocale(locale)
  }
  const off = api.onEvent(event => {
    if (event.type === 'preferencesChanged' && event.preferences) {
      revision++; select(event.preferences.locale)
    }
  })
  void api.preferences().then(value => { if (!disposed && revision === 0) select(value.locale) }).catch(console.error)
  return () => { disposed = true; off() }
}

/** TR stays reactive in JSX, option labels, tooltips and accessibility names. */
export function useTR(namespace: string): (key: string, args?: I18nArgs) => string {
  const i18n = useI18n()
  return (key, args) => i18n.tr(`${namespace}-${key.replaceAll('.', '-')}`, args)
}
