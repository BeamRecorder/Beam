import { useTR } from '../shared/i18n'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { KbdGroup } from '../shared/base-ui/kbd'
import { AudioMeterIcon } from '../shared/base-ui/audioMeterIcon'
import { useAudioMeters } from '../shared/useAudioMeters'
import { useRecordingClock } from './useRecordingClock'
import type { BeamApi } from '../shared/beamApi'

function clockLabel(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** Minimal topmost recording controls with a draggable non-button surface. */
export function RecorderBar(props: {
  api: BeamApi; paused: boolean; busy: boolean; visible: boolean; shortcut: string;
  microphoneEnabled: boolean; systemAudioEnabled: boolean; cameraEnabled: boolean;
  onPause: () => void; onStop: () => void; onDelete: () => void;
}): JSX.Element {
  const TR = useTR('RecorderBar')
  const theme = useTheme<WidgetTheme>()
  const clock = useRecordingClock(props.api, () => props.visible)
  const meters = useAudioMeters(props.api, () => props.visible && !props.paused && !props.busy ? 'recording' : null)
  const startDrag = () => void props.api.dragWindow('recorder').catch(console.error)
  return <column width="100%" height="100%" padding={5}>
    <WindowSurface resizable={false} radius={theme().radius}>
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
        <KbdGroup value={props.shortcut} />
        <row alignItems="center" accessibleName={TR('camera')}><Icon name={props.cameraEnabled ? 'camera' : 'camera-off'} size={16}
          color={props.cameraEnabled ? theme().foreground : theme().destructive} /></row>
        <row alignItems="center" accessibleName={TR('microphone')}><AudioMeterIcon icon={props.microphoneEnabled ? 'mic' : 'mic-off'}
          level={props.microphoneEnabled ? meters.levels().microphone : null} color={props.microphoneEnabled ? theme().foreground : theme().destructive} /></row>
        <row alignItems="center" accessibleName={TR('systemAudio')}><AudioMeterIcon icon={props.systemAudioEnabled ? 'volume-2' : 'volume-x'}
          level={props.systemAudioEnabled ? meters.levels().systemAudio : null} color={props.systemAudioEnabled ? theme().foreground : theme().destructive} /></row>
        <touchArea width={54} height="100%"
          onPointerDown={startDrag} mouseCursor="grab">
          <container width="100%" height="100%" alignItems="center" justifyContent="center">
          <text id="recorder-clock" color={theme().foreground} fontSize={13} weight={600}
            accessibleName={clock.error() || undefined}>{clock.error() ? '—' : clockLabel(clock.elapsed())}</text>
          </container>
        </touchArea>
      </row>
    </WindowSurface>
  </column>
}
