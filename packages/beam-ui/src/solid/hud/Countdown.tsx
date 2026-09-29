import { useTR } from '../shared/i18n'
import { Show } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Button } from '../shared/base-ui/button'
import { KbdGroup } from '../shared/base-ui/kbd'
import type { BeamApi } from '../shared/beamApi'

/** Small always-on-top countdown surface before the native start gate opens. */
export function Countdown(props: { api: BeamApi; remaining: number; shortcut: string; pauseShortcut?: string; onCancel: () => void }): JSX.Element {
  const TR = useTR('ScreenRegionOverlay'), R = useTR('RecorderBar')
  const theme = useTheme<WidgetTheme>()
  return <container width="100%" height="100%">
    <keyBinding shortcut="Escape" onActivated={props.onCancel} />
    <touchArea position="absolute" inset={{ left: 0, top: 0 }} width="100%" height="100%" mouseCursor="grab"
      onPointerDown={() => void props.api.dragWindow('countdown').catch(console.error)} />
    <column width="100%" height="100%" alignItems="center" justifyContent="center" gap={10}>
    <container width={160} height={160} radii={80} background={theme().background}
      alignItems="center" justifyContent="center" border={{ width: 1, color: theme().border }} shadow={{ color: theme().overlayShadowColor, blur: 32, offsetX: 0, offsetY: 14 }}>
      <text color={theme().foreground} fontSize={88} weight={750} textAlign="center" role="status" live="assertive">{props.remaining}</text>
    </container>
    <column gap={8} alignItems="center">
      <Button variant="secondary" size="sm" onClick={props.onCancel}>{TR('cancel')}</Button>
      <row gap={10} maxWidth={536} padding={{ left: 12, right: 12, top: 6, bottom: 6 }} radii={20}
        background={theme().background} border={{ width: 1, color: theme().border }} alignItems="center" accessibleName={R('recordingControls')}>
        <Show when={props.shortcut}><row gap={6} alignItems="center">
          <container maxWidth={92} minWidth={0} clip><text lineClamp={1} color={theme().mutedForeground} fontSize={12}>{R('stopRecording')}</text></container>
          <KbdGroup value={props.shortcut} />
        </row></Show>
        <Show when={props.shortcut && props.pauseShortcut}><text color={theme().mutedForeground} fontSize={12}>·</text></Show>
        <Show when={props.pauseShortcut}><row gap={6} alignItems="center">
          <container maxWidth={92} minWidth={0} clip><text lineClamp={1} color={theme().mutedForeground} fontSize={12}>{R('pauseRecording')}</text></container>
          <KbdGroup value={props.pauseShortcut ?? ''} />
        </row></Show>
      </row>
    </column>
  </column></container>
}
