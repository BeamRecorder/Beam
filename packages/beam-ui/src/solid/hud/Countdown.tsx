import { useTR } from '../shared/i18n'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { Button } from '../shared/base-ui/button'

/** Small always-on-top countdown surface before the native start gate opens. */
export function Countdown(props: { remaining: number; onCancel: () => void }): JSX.Element {
  const TR = useTR('ScreenRegionOverlay')
  const theme = useTheme<WidgetTheme>()
  return <WindowSurface resizable={false}><column width="100%" height="100%" alignItems="center" justifyContent="center" gap={10}>
    <container width={148} height={148} radii={74} background={theme().foreground}
      alignItems="center" justifyContent="center" border={{ width: 1, color: theme().border }} shadow={{ color: theme().overlayShadowColor, blur: 32, offsetX: 0, offsetY: 14 }}>
      <text color={theme().background} fontSize={72} weight={700} textAlign="center">{props.remaining}</text>
    </container>
    <Button variant="secondary" size="sm" onClick={props.onCancel}>{TR('cancel')}</Button>
  </column></WindowSurface>
}
