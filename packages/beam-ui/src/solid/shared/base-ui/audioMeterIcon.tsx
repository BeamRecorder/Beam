import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { BeamTheme } from '../beamThemeTypes'
import type { AudioLevel } from '../beamTypes'
import { Icon, type IconName } from './icon'
import { meterFill } from './audioMeter'
import { useMeterAnimation } from './useMeterAnimation'

/** Native gradient behind the unchanged SVG, rising only with real audio levels. */
export function AudioMeterIcon(props: { icon: IconName; level?: AudioLevel | null; size?: number; color?: string }): JSX.Element {
  const theme = useTheme<BeamTheme>()
  const size = () => (props.size ?? 14) + 8
  const meter = useMeterAnimation(() => meterFill(props.level))
  const fill = meter.value
  const revealOffset = () => size() * (1 - fill())
  return <container width={size()} height={size()}>
      <container position="absolute" inset={{ left: 0, bottom: 0 }} width={size()} height={size()} clip radii={theme().radius}
        opacity={(props.icon === 'mic' || props.icon === 'volume-2') && fill() > 0.005 ? 1 : 0}>
        <container width="100%" height="100%" clip radii={theme().radius} transform={{ translateY: revealOffset() }}
          transitionMs={meter.duration()} transitionTimingFunction={meter.duration() ? 'linear' : undefined}>
          <container width="100%" height="100%" transform={{ translateY: -revealOffset() }}
            transitionMs={meter.duration()} transitionTimingFunction={meter.duration() ? 'linear' : undefined}>
            <rectangle width="100%" height="100%" opacity={0.28}
              background={{ kind: 'linear', angle: 270, space: 'oklab', stops: [
                { offset: 0, color: theme().meterGreen }, { offset: 0.65, color: theme().meterYellow },
                { offset: 0.87, color: theme().meterOrange }, { offset: 1, color: theme().meterRed },
              ] }} />
          </container>
        </container>
      </container>
    <row position="absolute" inset={{ left: 0, top: 0 }} width="100%" height="100%" alignItems="center" justifyContent="center">
      <Icon name={props.icon} size={props.size ?? 14} color={props.color ?? theme().foreground} />
    </row>
  </container>
}
