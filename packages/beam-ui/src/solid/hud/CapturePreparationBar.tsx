import { Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { BeamApi } from '../shared/beamApi'
import type { SourceMode } from '../shared/beamTypes'
import type { BeamTheme } from '../shared/beamThemeTypes'
import { useTR } from '../shared/i18n'
import { useAudioMeters } from '../shared/useAudioMeters'
import { useWindowMetrics } from '../shared/useWindowMetrics'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { Button } from '../shared/base-ui/button'
import { ErrorNotice } from '../shared/base-ui/errorNotice'
import { Icon } from '../shared/base-ui/icon'
import { DeviceSelect } from './DeviceSelect'
import { useCaptureDevices } from './useCaptureDevices'
import { CaptureQuickSettings } from './CaptureQuickSettings'

/** Shared preparation bar using the launcher's selectors and live meters in every mode. */
export function CapturePreparationBar(props: { api: BeamApi; source: SourceMode; canRecord: boolean }) {
  const TR = useTR('ScreenRegionOverlay'), R = useTR('RecorderBar'), P = useTR('Teleprompter'), REC = useTR('VoiceoverRecorder')
  const theme = useTheme<BeamTheme>()
  const settings = useCaptureDevices(props.api), metrics = useWindowMetrics(props.api, { width: 620, height: 54 })
  const meters = useAudioMeters(props.api, () => {
    if (!metrics().visible || !settings.ready() || settings.mode() === 'screenshot') return null
    const microphoneId = settings.devices().microphone || null, systemAudioId = settings.devices().systemAudio || null
    return microphoneId || systemAudioId ? { microphoneId, systemAudioId } : null
  })
  async function cancel() {
    try {
      if (props.source === 'region') await props.api.cancelRegion()
      else await props.api.emitUiAction('preparationCanceled')
    }
    finally {
      await Promise.all(['region', 'regionControls', 'regionActions'].map(window => props.api.hideWindow(window).catch(console.error)))
      await props.api.showWindow('main')
      await props.api.focusWindow('main')
    }
  }
  const disabled = () => !props.canRecord || !settings.ready() || settings.saving()
  const record = () => {
    if (disabled()) return
    void (props.source === 'region' ? props.api.confirmRegion() : props.api.emitUiAction('preparationRecord')).catch(console.error)
  }
  const compact = () => settings.mode() !== 'screenshot' && metrics().width < 560
  const Cancel = () => <Button id="region-cancel" variant="ghost" size="icon-xs" iconOnly shrink={0} accessibleName={TR('cancel')}
    onClick={() => void cancel().catch(console.error)}><Icon name="x" size={14} color={theme().foreground} /></Button>
  const Record = () => <Button id="region-record" width={104} shrink={0} size="sm" disabled={disabled()} onClick={record}>{REC('record')}</Button>
  const Settings = () => <CaptureQuickSettings api={props.api} value={settings.quickSettings()} disabled={!settings.ready() || settings.saving()}
    screenshot={settings.mode() === 'screenshot'} onChange={patch => void settings.changeQuick(patch)} />
  const Devices = () => <Show when={settings.mode() !== 'screenshot'} fallback={<container grow={1} />}>
    <container width={0} grow={1} minWidth={0}><DeviceSelect id="region-camera" label={R('camera')} icon="camera"
      options={settings.catalog().cameras} value={settings.devices().camera ?? ''} disabled={!settings.ready()}
      onChange={value => void settings.change('camera', value)} /></container>
    <container width={0} grow={1} minWidth={0}><DeviceSelect id="region-microphone" label={R('microphone')} icon="mic"
      options={settings.catalog().microphones} value={settings.devices().microphone ?? ''} disabled={!settings.ready()}
      level={meters.levels().microphone} onChange={value => void settings.change('microphone', value)} /></container>
    <container width={0} grow={1} minWidth={0}><DeviceSelect id="region-system-audio" label={R('systemAudio')} icon="volume-2"
      options={[{ id: 'default', label: P('on') }]} value={settings.devices().systemAudio ?? ''} disabled={!settings.ready()}
      level={meters.levels().systemAudio} onChange={value => void settings.change('systemAudio', value)} /></container>
  </Show>
  return <WindowSurface resizable={false} radius={theme().radius}>
    <touchArea position="absolute" inset={{ left: 0, top: 0 }} width="100%" height="100%" mouseCursor="grab"
      onPointerDown={() => void props.api.dragWindow('regionActions').catch(console.error)} />
    <keyBinding shortcut="Escape" onActivated={() => void cancel().catch(console.error)} />
    <keyBinding shortcut="Enter" onActivated={record} />
    <column width="100%" height="100%" padding={{ left: 5, right: 5, top: settings.error() || meters.error() ? 0 : 5, bottom: settings.error() || meters.error() ? 0 : 5 }} gap={2} justifyContent="center">
      <Show when={compact()} fallback={<row width="100%" height={28} gap={6} alignItems="center"><Cancel /><Devices /><Settings /><Record /></row>}>
        <row width="100%" height={28} gap={6} alignItems="center"><Cancel /><Devices /></row>
        <row width="100%" height={28} gap={6} justifyContent="end"><Settings /><Record /></row>
      </Show>
      <ErrorNotice message={settings.error() || meters.error()} fontSize={10} lineClamp={1} onCopy={text => props.api.copyText(text)} />
    </column>
  </WindowSurface>
}
