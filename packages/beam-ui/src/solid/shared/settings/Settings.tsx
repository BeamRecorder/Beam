import { useTR, localeOptions } from '../i18n'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import { ScrollShadow, type WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../../assets.generated'
import { Select } from '../base-ui/select'
import { Button } from '../base-ui/button'
import { ErrorNotice } from '../base-ui/errorNotice'
import { ShortcutField } from '../base-ui/shortcutField'
import { WindowSurface } from '../base-ui/windowSurface'
import { Icon } from '../base-ui/icon'
import { SettingRow } from './settingRow'
import { SettingsSidebar } from './settingsSidebar'
import { About } from './About'
import type { SettingsSection } from './settingsTypes'
import type { BeamApi } from '../beamApi'
import type { ApplicationInfo, BeamPreferences, InputAccessStatus } from '../beamTypes'

const shortcuts = [
  { id: 'hud.startStopRecording', label: 'startStopRecording' },
  { id: 'hud.playPause', label: 'pauseResume' },
  { id: 'teleprompter.toggleVisibility', label: 'teleprompterVisibility' },
  { id: 'teleprompter.toggleAutoscroll', label: 'teleprompterAutoscroll' },
  { id: 'teleprompter.nextLine', label: 'teleprompterNextLine' },
  { id: 'teleprompter.previousLine', label: 'teleprompterPreviousLine' },
]

/** Separate native settings window with immediate, shared preference updates. */
export function Settings(props: { api: BeamApi; onTheme: (variant: BeamPreferences['theme']) => void; onClose?: () => void }): JSX.Element {
  const TR = useTR('HudPreferences'), N = useTR('Native'), A = useTR('AppearanceSettings'), H = useTR('HUD'), S = useTR('ShortcutPreferences'), T = useTR('TopbarHUD'), P = useTR('ProjectPicker')
  const theme = useTheme<WidgetTheme>()
  const [section, setSection] = createSignal<SettingsSection>('capture')
  const [preferences, setPreferences] = createSignal<BeamPreferences | null>(null)
  const [info, setInfo] = createSignal<ApplicationInfo | null>(null)
  const [error, setError] = createSignal('')
  const [pending, setPending] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [inputAccess, setInputAccess] = createSignal<InputAccessStatus | null>(null)
  let revision = 0
  let disposed = false
  const applyPreferences = (value: BeamPreferences) => { setPreferences(value); props.onTheme(value.theme) }
  onMount(() => {
    void props.api.preferences().then(value => { if (!disposed && revision === 0) applyPreferences(value) }).catch(cause => setError(String(cause)))
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'preferencesChanged' && event.preferences) { revision++; applyPreferences(event.preferences) }
    }))
    void props.api.info().then(setInfo).catch(cause => setError(String(cause)))
    void props.api.inputAccessStatus().then(setInputAccess).catch(cause => setError(String(cause)))
  })
  onCleanup(() => { disposed = true })

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    if (pending()) return false
    setPending(true); setError('')
    try { applyPreferences(await props.api.savePreferences(patch)); return true }
    catch (cause) { setError(String(cause)); return false }
    finally { setPending(false) }
  }
  async function saveShortcut(id: string, value: string): Promise<boolean> {
    const current = preferences()
    if (!current) return false
    if (Object.entries(current.shortcuts).some(([key, shortcut]) => key !== id && shortcut.toLowerCase() === value.toLowerCase())) {
      setError(S('conflictWith', { name: value })); return false
    }
    try {
      await props.api.shortcuts({ ...current.shortcuts, [id]: value })
      if (await save({ shortcuts: { [id]: value } })) return true
    } catch (cause) { setError(String(cause)) }
    await props.api.shortcuts(current.shortcuts).catch(cause => setError(String(cause)))
    return false
  }
  const captureShortcut = (capturing: boolean) => {
    const shortcuts = capturing ? {} : preferences()?.shortcuts ?? {}
    void props.api.shortcuts(shortcuts).catch(cause => setError(String(cause)))
  }
  async function requestInputAccess(): Promise<void> {
    setPending(true); setError('')
    try { setInputAccess(await props.api.requestInputAccess()) }
    catch (cause) { setError(String(cause)) }
    finally { setPending(false) }
  }
  async function copySystemInfo(): Promise<void> {
    setError('')
    try {
      const [app, window, input] = await Promise.all([props.api.info(), props.api.windowInfo(), props.api.inputAccessStatus()])
      const lines = [`Beam ${app.version}`, `OS: ${app.operatingSystem}`, `Architecture: ${app.architecture}`,
        `Logical processors: ${app.logicalProcessors}`, `Desktop session: ${app.desktopSession ?? app.operatingSystem}`,
        `Window backend: ${window.capabilities.backend}`, `Display scale: ${window.scaleFactor}`,
        `Input access: ${input.state}`, `Click capture: ${input.clicks}`, `Shortcut capture: ${input.shortcuts}`]
      if (input.error) lines.push(`Input error: ${input.error.code}: ${input.error.message}`)
      await props.api.copyText(lines.join('\n')); setCopied(true)
    } catch (cause) { setError(String(cause)) }
  }

  const p = () => preferences()
  return <WindowSurface api={props.api}><column width="100%" height="100%">
    <row width="100%" height={34} shrink={0} padding={{ left: 14, right: 8 }} alignItems="center" background={theme().card}>
      <container grow={1} minWidth={0} height="100%">
        <touchArea width="100%" height="100%" onPointerDown={() => void props.api.dragWindow()} mouseCursor="grab">
          <row height="100%" gap={8} alignItems="center">
            <image source={mediaAssets['brand/beam.png']} width={18} height={18} fit="contain" alt="Beam" />
            <text color={theme().foreground} fontSize={13} weight={600}>{TR('preferences')}</text>
          </row>
        </touchArea>
      </container>
      <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('minimize')} onClick={() => void props.api.minimizeWindow()}>
        <Icon name="minus" size={16} color={theme().foreground} />
      </Button>
      <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')} onClick={() => props.onClose ? props.onClose() : void props.api.closeWindow()}>
        <Icon name="x" size={16} color={theme().foreground} />
      </Button>
    </row>
    <rectangle width="100%" height={1} shrink={0} background={theme().border} />
    <row width="100%" grow={1} minHeight={0}>
      <SettingsSidebar value={section()} onChange={setSection} />
      <rectangle width={1} height="100%" background={theme().border} />
      <ScrollShadow grow={1} minWidth={0} height="100%" scrollbarEndInset={0}>
        <column width="100%" padding={14} gap={6}>
          <Show when={p()} fallback={<text color={theme().mutedForeground}>{P('loadingProjects')}</text>}>
            <Show when={section() === 'capture'}>
              <SettingRow label={N('defaultMode')}>
                <Select label={N('defaultMode')} width="100%" value={p()!.captureMode} disabled={pending()}
                  options={[{ value: 'recorder', label: N('recorder') }, { value: 'screenshot', label: H('screenshot') }, { value: 'instant', label: H('instant') }]}
                  onValueChange={value => void save({ captureMode: value })} allowOutsideWindow />
              </SettingRow>
              <SettingRow label={TR('countdown')}>
                <Select label={TR('countdown')} width="100%" value={String(p()!.countdownSeconds)} disabled={pending()}
                  options={[1, 2, 3, 5, 10].map(value => ({ value: String(value), label: `${value} s` }))}
                  onValueChange={value => void save({ countdownSeconds: Number(value) })} allowOutsideWindow />
              </SettingRow>
              <Show when={inputAccess()?.canRequest}>
                <SettingRow label={TR('interactionAccess')}>
                  <Button width="100%" size="sm" disabled={pending()} onClick={() => void requestInputAccess()}>{TR('allowAccess')}</Button>
                </SettingRow>
              </Show>
              <ErrorNotice message={inputAccess()?.error?.message ?? ''} fontSize={12} onCopy={text => props.api.copyText(text)} />
            </Show>
            <Show when={section() === 'shortcuts'}>
              {shortcuts.map(shortcut => <SettingRow label={S(shortcut.label)}>
                <ShortcutField label={S(shortcut.label)} value={p()!.shortcuts[shortcut.id] ?? ''}
                  disabled={pending()} onCaptureChange={captureShortcut} onChange={value => saveShortcut(shortcut.id, value)} />
              </SettingRow>)}
            </Show>
            <Show when={section() === 'appearance'}>
              <SettingRow label={TR('theme')}>
                <Select label={TR('theme')} width="100%" value={p()!.theme} disabled={pending()}
                  options={[{ value: 'system', label: A('system') }, { value: 'dark', label: A('dark') }, { value: 'light', label: A('light') }]}
                  onValueChange={value => void save({ theme: value })} allowOutsideWindow />
              </SettingRow>
              <SettingRow label={TR('language')}>
                <Select label={TR('language')} width="100%" value={p()!.locale} disabled={pending()}
                  options={localeOptions} onValueChange={locale => void save({ locale })} allowOutsideWindow />
              </SettingRow>
            </Show>
            <Show when={section() === 'about'}>
              <About api={props.api} info={info()} copied={copied()} onCopy={copySystemInfo} />
            </Show>
          </Show>
          <ErrorNotice message={error()} fontSize={12} onCopy={text => props.api.copyText(text)} />
        </column>
      </ScrollShadow>
    </row>
  </column></WindowSurface>
}
