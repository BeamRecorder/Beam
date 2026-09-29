import { useTR } from '../shared/i18n'
import { Show } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { AssetRef } from '@argui/host'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../assets.generated'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { SegmentedControl } from '../shared/base-ui/segmentedControl'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { useWindowMetrics } from '../shared/useWindowMetrics'
import type { BeamApi } from '../shared/beamApi'
import type { BeamPreferences, CaptureMode, CaptureRequest } from '../shared/beamTypes'
import { SourceCard } from './SourceCard'
import { DeviceSelect } from './DeviceSelect'
import { hudLayout } from './hudLayout'
import { useCaptureLauncher } from './useCaptureLauncher'

const modes: { id: CaptureMode; label: string; asset: AssetRef }[] = [
  { id: 'recorder', label: 'Recorder', asset: mediaAssets['modes/recorder.svg'] },
  { id: 'screenshot', label: 'Screenshot', asset: mediaAssets['modes/screenshot.svg'] },
  { id: 'instant', label: 'Instant', asset: mediaAssets['modes/instant.svg'] },
]

/** Beam's compact native launcher; each source card begins capture. */
export function Hud(props: {
  api: BeamApi; preferences: BeamPreferences; externalError?: string; startCommand?: number;
  captureBusy?: boolean; onRecord: (request: CaptureRequest) => Promise<void>; onScreenshot: (projectId: string) => void;
}): JSX.Element {
  const TR = useTR('HUD'), N = useTR('Native'), R = useTR('RecorderBar'), T = useTR('TopbarHUD'), P = useTR('Teleprompter'), E = useTR('NativeEditor')
  const theme = useTheme<WidgetTheme>()
  const launcher = useCaptureLauncher(props)
  const metrics = useWindowMetrics(props.api, props.preferences.hudWindow)
  const layout = () => hudLayout(metrics().width, metrics().height)
  const report = (cause: unknown) => console.error(String(cause))
  return <WindowSurface api={props.api}>
    <column width="100%" height="100%">
      <row width="100%" height={36} shrink={0} padding={{ left: 12, right: 8 }} alignItems="center" background={theme().card}>
        <container grow={1} minWidth={24} height="100%">
          <touchArea width="100%" height="100%" onPointerDown={() => void props.api.dragWindow().catch(report)} mouseCursor="grab">
            <row height="100%" alignItems="center" gap={7}>
              <image source={mediaAssets['brand/beam.png']} width={18} height={18} fit="contain" alt="Beam" />
              <Show when={layout().showBrandLabel}><text color={theme().foreground} fontSize={12} weight={600}>Beam</text></Show>
            </row>
          </touchArea>
        </container>
        <row alignItems="center" gap={2} margin={{ left: 6 }}>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={E('editor')} onClick={() => void props.api.openVideoEditor().catch(report)}>
            <Icon name="video" size={16} color={theme().foreground} />
          </Button>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('preferences')} onClick={() => void props.api.openSettings().catch(report)}>
            <Icon name="settings" size={16} color={theme().foreground} />
          </Button>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('minimize')} onClick={() => void props.api.minimizeWindow().catch(report)}>
            <Icon name="minus" size={16} color={theme().foreground} />
          </Button>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')} onClick={() => void props.api.hideWindow().catch(report)}>
            <Icon name="x" size={16} color={theme().foreground} />
          </Button>
        </row>
      </row>
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <column width="100%" grow={1} minHeight={0} padding={10} gap={5}>
        <row width="100%" grow={1} minHeight={0} gap={10} alignItems="center">
          <column width={0} grow={1} minWidth={0} gap={10} alignItems="center">
            <SegmentedControl label={N('captureMode')} value={launcher.mode()} options={modes.map(item => ({ ...item, label: item.id === 'recorder' ? N('recorder') : TR(item.id) }))}
              width={layout().modeGroupWidth} compact={!layout().showModeLabels} disabled={launcher.busy()}
              onChange={value => void launcher.changeMode(value)} />
            <row width="100%" gap={8} justifyContent="center" accessibleName={N('captureSource')}>
              <SourceCard mode="display" selected={launcher.sourceMode() === 'display'} height={layout().cardHeight}
                disabled={launcher.busy()} onSelect={() => void launcher.choose('display')} />
              <SourceCard mode="region" selected={launcher.sourceMode() === 'region'} height={layout().cardHeight}
                disabled={launcher.busy()} onSelect={() => void launcher.choose('region')} />
              <SourceCard mode="window" selected={launcher.sourceMode() === 'window'} height={layout().cardHeight}
                disabled={launcher.busy()} onSelect={() => void launcher.choose('window')} />
            </row>
          </column>
          <rectangle width={1} height="100%" shrink={0} background={theme().border} />
          <column width={layout().deviceWidth} shrink={0} gap={6}>
            <Show when={launcher.mode() !== 'screenshot'}>
              <DeviceSelect id="camera" label={R('camera')} icon="camera" options={launcher.catalog().cameras} value={launcher.devices().camera ?? ''}
                onChange={value => void launcher.saveDevice('camera', value)} />
              <DeviceSelect id="microphone" label={R('microphone')} icon="mic" options={launcher.catalog().microphones} value={launcher.devices().microphone ?? ''}
                onChange={value => void launcher.saveDevice('microphone', value)} />
              <DeviceSelect id="system-audio" label={R('systemAudio')} icon="volume-2" options={[{ id: 'default', label: P('on') }]} value={launcher.devices().systemAudio ?? ''}
                onChange={value => void launcher.saveDevice('systemAudio', value)} />
              <Button variant="secondary" size="sm" width="100%" onClick={() => void props.api.openTeleprompter().catch(report)}>
                <row alignItems="center" justifyContent="center" gap={6}>
                  <Icon name="scroll-text" size={14} color={theme().foreground} />
                  <text color={theme().foreground} fontSize={11}>{T('teleprompter')}</text>
                </row>
              </Button>
            </Show>
          </column>
        </row>
        <Show when={launcher.error() || props.externalError}>
          <text color={theme().destructive} fontSize={11} lineClamp={2} role="alert">{launcher.error() || props.externalError || ''}</text>
        </Show>
      </column>
    </column>
  </WindowSurface>
}
