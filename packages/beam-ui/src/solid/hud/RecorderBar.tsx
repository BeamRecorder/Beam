import { useTR } from '../shared/i18n'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import type { BeamApi } from '../shared/beamApi'

function clockLabel(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** Minimal topmost recording controls with a draggable non-button surface. */
export function RecorderBar(props: {
  api: BeamApi; paused: boolean; busy: boolean; visible: boolean;
  onPause: () => void; onStop: () => void; onDelete: () => void;
}): JSX.Element {
  const TR = useTR('RecorderBar')
  const theme = useTheme<WidgetTheme>()
  const [elapsed, setElapsed] = createSignal(0)
  let activeSince = Date.now()
  let accumulated = 0
  let previousPaused = props.paused
  createEffect(() => {
    if (!props.visible) return
    accumulated = 0; activeSince = Date.now(); previousPaused = untrack(() => props.paused); setElapsed(0)
    const timer = setInterval(() => {
      if (previousPaused !== props.paused) {
        if (props.paused) accumulated += Date.now() - activeSince
        else activeSince = Date.now()
        previousPaused = props.paused
      }
      setElapsed(accumulated + (props.paused ? 0 : Date.now() - activeSince))
    }, 250)
    onCleanup(() => clearInterval(timer))
  })
  const startDrag = () => void props.api.dragWindow('recorder').catch(console.error)
  return <column width="100%" height="100%" padding={5}>
    <WindowSurface resizable={false}>
      <touchArea position="absolute" inset={{ left: 0, top: 0 }} width="100%" height="100%"
        onPointerDown={startDrag} mouseCursor="grab" />
      <row width="100%" height="100%" alignItems="center" justifyContent="spaceBetween" gap={6} padding={{ left: 8, right: 8 }}>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('cancelRecording')} disabled={props.busy} onClick={props.onDelete}>
          <Icon name="trash-2" size={16} color={theme().mutedForeground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR(props.paused ? 'resumeRecording' : 'pauseRecording')} disabled={props.busy} onClick={props.onPause}>
          <Icon name={props.paused ? 'play' : 'pause'} size={16} color={theme().foreground} />
        </Button>
        <Button size="icon-xs" iconOnly accessibleName={TR('stopRecording')} disabled={props.busy} onClick={props.onStop}>
          <Icon name="square" size={14} color={theme().primaryForeground} />
        </Button>
        <touchArea width={54} height="100%"
          onPointerDown={startDrag} mouseCursor="grab">
          <container width="100%" height="100%" alignItems="center" justifyContent="center">
          <text color={theme().foreground} fontSize={13} weight={600}>{clockLabel(elapsed())}</text>
          </container>
        </touchArea>
      </row>
    </WindowSurface>
  </column>
}
