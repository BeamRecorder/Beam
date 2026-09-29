import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUPPORTED_LOCALES, localeOptions } from '../../../src/i18n/locales.ts'
import { flattenMessages } from './i18nCatalog.mjs'

const repository = resolve(import.meta.dirname, '../../..')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const coreNamespaces = ['HUD', 'HudPreferences', 'RecorderBar', 'ScreenRegionOverlay', 'SettingsPanel', 'AppearanceSettings', 'VoiceoverRecorder', 'ProjectPicker']
const editorNamespaces = ['Teleprompter', 'ShortcutPreferences', 'Tray', 'Updates', 'TopbarHUD']
const editor = read(resolve(import.meta.dirname, '../src/solid/editor/shared/messages.json'))
const extra = read(resolve(import.meta.dirname, '../src/solid/shared/i18n/nativeMessages.json'))
const catalogs = Object.fromEntries(SUPPORTED_LOCALES.map(locale => {
  const core = read(resolve(repository, `src/i18n/${locale}/core.json`))
  const copy = Object.fromEntries(['copyError', 'copied', 'copyFailed'].map(key => [key, core.ExportPopover[key]]))
  const messages = {
    ...flattenMessages(core, coreNamespaces),
    ...flattenMessages({ CopyButton: copy }, ['CopyButton']),
    ...flattenMessages(read(resolve(repository, `src/i18n/${locale}/editor.json`)), editorNamespaces),
    ...flattenMessages({ Native: extra[locale] }, ['Native']),
    ...flattenMessages({ NativeEditor: { ...editor.en, ...editor[locale] } }, ['NativeEditor']),
  }
  return [locale, messages]
}))
const config = { fallback: 'en', locale: 'en', catalogs }
writeFileSync(resolve(import.meta.dirname, '../src/solid/shared/i18n/catalogs.generated.json'), JSON.stringify(config))
writeFileSync(resolve(import.meta.dirname, '../src/solid/shared/i18n/localeOptions.generated.json'), JSON.stringify(localeOptions))
console.log(`[i18n] Imported ${SUPPORTED_LOCALES.length} native catalogues from Beam's existing translations.`)
