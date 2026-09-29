import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { useTR } from '../shared/i18n'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import type { BeamApi } from '../shared/beamApi'

/** An original Beam mascot animated by the native renderer while capture is finalized. */
export function EditorLoading(props: { api: BeamApi }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const TR = useTR('EditorPreparingHud'), T = useTR('TopbarHUD')
  const cancel = () => void props.api.emitUiAction('editorLoadingCanceled').catch(console.error)
  return <WindowSurface api={props.api} resizable={false} radius={18}>
    <column width="100%" height="100%" alignItems="center" background={theme().background}>
      <row width="100%" height={37} shrink={0} alignItems="center" padding={{ left: 16, right: 8 }}>
        <container grow={1} height="100%"><touchArea width="100%" height="100%" mouseCursor="grab"
          onPointerDown={() => void props.api.dragWindow().catch(console.error)} /></container>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')} onClick={cancel}>
          <Icon name="x" size={16} color={theme().mutedForeground} />
        </Button>
      </row>
      <container width={106} height={106} shrink={0} alignItems="center" justifyContent="center">
        <rectangle width={88} height={88} rotationLoopMs={4300} background="transparent">
          <rectangle width="100%" height="100%" radii={30} loopRadius={42} loopScale={0.83}
            loopMs={1250} background={theme().primary}
            shadow={{ color: theme().overlayShadowColor, blur: 22, offsetX: 0, offsetY: 10 }}>
            <row width="100%" height="100%" alignItems="center" justifyContent="center" gap={13}>
              <rectangle width={9} height={13} radii={5} background="#ffffff" loopScale={0.72} loopMs={1100} />
              <rectangle width={9} height={13} radii={5} background="#ffffff" loopScale={0.72} loopMs={1100} />
            </row>
          </rectangle>
        </rectangle>
      </container>
      <column alignItems="center" gap={7} margin={{ top: 8 }}>
        <text color={theme().foreground} fontSize={17} weight={650}>{TR('title')}</text>
        <text color={theme().mutedForeground} fontSize={12}>{TR('openingWindow')}</text>
      </column>
    </column>
  </WindowSurface>
}
