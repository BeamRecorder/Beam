import type { JSX } from '@argui/solid/jsx-runtime'
import { mediaAssets } from '../../../../assets.generated'

export type IconName = keyof typeof iconAssets

const iconAssets = {
  'command': mediaAssets['icons/command.svg'],
  'option': mediaAssets['icons/option.svg'],
  'arrow-big-up': mediaAssets['icons/arrow-big-up.svg'],
  'corner-down-left': mediaAssets['icons/corner-down-left.svg'],
  'space': mediaAssets['icons/space.svg'],
  'copy': mediaAssets['icons/copy.svg'],
  'scroll-text': mediaAssets['icons/scroll-text.svg'],
  'chevron-right': mediaAssets['icons/chevron-right.svg'],
  'square-pen': mediaAssets['icons/square-pen.svg'],
  'text-align-center': mediaAssets['icons/text-align-center.svg'],
  'text-align-start': mediaAssets['icons/text-align-start.svg'],
  'eye': mediaAssets['icons/eye.svg'],
  'minus': mediaAssets['icons/minus.svg'],
  'settings': mediaAssets['icons/settings.svg'],
  'monitor': mediaAssets['icons/monitor.svg'],
  'scan': mediaAssets['icons/scan.svg'],
  'app-window': mediaAssets['icons/app-window.svg'],
  'camera': mediaAssets['icons/camera.svg'],
  'mic': mediaAssets['icons/mic.svg'],
  'volume-2': mediaAssets['icons/volume-2.svg'],
  'trash-2': mediaAssets['icons/trash-2.svg'],
  'pause': mediaAssets['icons/pause.svg'],
  'square': mediaAssets['icons/square.svg'],
  'play': mediaAssets['icons/play.svg'],
  'chevron-down': mediaAssets['icons/chevron-down.svg'],
  'clock-3': mediaAssets['icons/clock-3.svg'],
  'keyboard': mediaAssets['icons/keyboard.svg'],
  'palette': mediaAssets['icons/palette.svg'],
  'info': mediaAssets['icons/info.svg'],
  'x': mediaAssets['icons/x.svg'],
  'power': mediaAssets['icons/power.svg'],
  'rotate-ccw': mediaAssets['icons/rotate-ccw.svg'],
  'video': mediaAssets['icons/video.svg'],
  'layers-2': mediaAssets['icons/layers-2.svg'],
  'move': mediaAssets['icons/move.svg'],
  'check': mediaAssets['icons/check.svg'],
  'sliders-horizontal': mediaAssets['icons/sliders-horizontal.svg'],
  'minimize-2': mediaAssets['icons/minimize-2.svg'],
  'maximize-2': mediaAssets['icons/maximize-2.svg'],
  'sparkles': mediaAssets['icons/sparkles.svg'],
  'mouse-pointer-2': mediaAssets['icons/mouse-pointer-2.svg'],
  'circle-stop': mediaAssets['icons/circle-stop.svg'],
  'chevron-left': mediaAssets['icons/chevron-left.svg'],
  'image': mediaAssets['icons/image.svg'],
  'audio-lines': mediaAssets['icons/audio-lines.svg'],
} as const

/** Product-owned Lucide vectors registered in the native ARGUI asset pack. */
export function Icon(props: { name: IconName; size?: number; color: string }): JSX.Element {
  return <svg source={iconAssets[props.name]} width={props.size ?? 18} height={props.size ?? 18} color={props.color} />
}
