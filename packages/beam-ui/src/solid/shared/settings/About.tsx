import { useTR } from '../i18n'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../../assets.generated'
import { Button } from '../base-ui/button'
import { ErrorNotice } from '../base-ui/errorNotice'
import { Icon } from '../base-ui/icon'
import type { BeamApi } from '../beamApi'
import type { ApplicationInfo } from '../beamTypes'
import type { UpdateSnapshot } from './updateTypes'

/** Application identity and the shared native update transaction. */
export function About(props: { api: BeamApi; info: ApplicationInfo | null; copied: boolean; onCopy: () => Promise<void> }) {
  const TR = useTR('Updates'), N = useTR('Native'), P = useTR('HudPreferences'), S = useTR('SettingsPanel')
  const theme = useTheme<WidgetTheme>()
  const [update, setUpdate] = createSignal<UpdateSnapshot | null>(null)
  const [error, setError] = createSignal('')
  const [requesting, setRequesting] = createSignal(false)
  let revision = 0
  let disposed = false
  onMount(() => {
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'updaterState' && event.update) { revision++; setUpdate(event.update) }
    }))
    void props.api.updateState().then(value => { if (!disposed && revision === 0) setUpdate(value) })
      .catch(cause => setError(String(cause)))
  })
  onCleanup(() => { disposed = true })
  const busy = () => requesting() || ['checking', 'downloading', 'verifying', 'installing'].includes(update()?.phase ?? '')
  async function run(operation: () => Promise<UpdateSnapshot>) {
    setError(''); setRequesting(true)
    try { const value = await operation(); if (!disposed) setUpdate(value) }
    catch (cause) { if (!disposed) setError(String(cause)) }
    finally { if (!disposed) setRequesting(false) }
  }
  const status = () => {
    const value = update()
    switch (value?.phase) {
      case 'checking': return TR('checking')
      case 'upToDate': return TR('upToDate', { version: props.info?.version ?? '' })
      case 'available': return TR('updateAvailable', { version: value.version ?? '' })
      case 'downloading': return TR('downloading', { percent: Math.round(value.percent ?? 0) })
      case 'verifying': return N('verifying')
      case 'ready': return TR('readyToRestart', { version: value.version ?? '' })
      case 'installing': return N('installing')
      case 'installed': return N(value.restartRequired ? 'restartRequired' : 'installerOpen')
      case 'cancelled': return N('downloadCancelled')
      default: return ''
    }
  }
  const platform = () => props.info
    ? `${({ macos: 'macOS', windows: 'Windows', linux: 'Linux' } as Record<string, string>)[props.info.operatingSystem] ?? props.info.operatingSystem} · ${props.info.architecture}` : ''
  return <column width="100%" gap={16} padding={{ top: 22, bottom: 12 }} alignItems="center">
    <image source={mediaAssets['brand/beam.png']} width={64} height={64} fit="contain" alt="Beam" />
    <column width="100%" gap={5} alignItems="center">
      <text color={theme().foreground} fontSize={22} weight={600}>Beam</text>
      <text color={theme().mutedForeground} fontSize={12}>{props.info ? P('version', { version: props.info.version }) : '…'}</text>
    </column>
    <row gap={8} alignItems="center" justifyContent="center">
      <text color={theme().mutedForeground} fontSize={11}>{platform()}</text>
      <Button variant="ghost" size="icon-xs" iconOnly accessibleName={S(props.copied ? 'copied' : 'copySysInfo')}
        onClick={() => void props.onCopy()}>
        <Icon name={props.copied ? 'check' : 'copy'} size={16} color={theme().foreground} />
      </Button>
    </row>
    <column width="100%" maxWidth={280} gap={10} alignItems="center">
      <Show when={status()}><text color={theme().mutedForeground} fontSize={12} lineClamp={2}>{status()}</text></Show>
      <Show when={update()?.phase === 'downloading'}>
        <rectangle width="100%" height={4} radii={2} background={theme().muted}>
          <rectangle width={`${update()?.percent ?? 0}%`} height={4} radii={2} background={theme().primary} />
        </rectangle>
      </Show>
      <row gap={8} justifyContent="center" alignItems="center">
        <Show when={update()?.phase === 'available' || update()?.phase === 'cancelled'} fallback={
          <Show when={update()?.phase === 'ready'} fallback={
            <Button variant="secondary" size="sm" disabled={busy() || update()?.phase === 'installed'}
              onClick={() => void run(() => props.api.checkUpdates())}>
              <text fontSize={12} color={theme().foreground}>{TR('checkForUpdates')}</text>
            </Button>
          }>
            <Button size="sm" disabled={busy()} onClick={() => void run(() => props.api.installUpdate())}>
              <text fontSize={12} color={theme().primaryForeground}>{N('installUpdate')}</text>
            </Button>
          </Show>
        }>
          <Button size="sm" disabled={busy()} onClick={() => void run(() => props.api.downloadUpdate())}>
            <text fontSize={12} color={theme().primaryForeground}>{TR('download')}</text>
          </Button>
        </Show>
        <Show when={update()?.phase === 'downloading'}>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={N('cancelDownload')}
            onClick={() => void props.api.cancelUpdate().catch(cause => setError(String(cause)))}>
            <Icon name="x" size={16} color={theme().foreground} />
          </Button>
        </Show>
      </row>
      <ErrorNotice message={error() || update()?.error || ''} lineClamp={4} onCopy={text => props.api.copyText(text)} />
    </column>
  </column>
}
