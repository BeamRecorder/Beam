import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { WindowOutline } from '../shared/base-ui/windowSurface'
import { colorWithOpacity } from '../shared/base-ui/colorPickerModel'
import type { TeleprompterSurfaceProps } from './teleprompterUiTypes'

/** The reader changes only its backing alpha; text and controls stay crisp and interactive. */
export function TeleprompterSurface(props: TeleprompterSurfaceProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <container width="100%" height="100%">
    <rectangle id="teleprompter-surface" width="100%" height="100%" radii={12} clip
      background={colorWithOpacity(theme().background, props.opacity)}>
      {props.children}
    </rectangle>
    <touchArea position="absolute" inset={{ start: 12, end: 12, top: 0 }} height={8} mouseCursor="nsResize"
      onPointerDown={() => void props.api.resizeWindow('north').catch(console.error)} />
    <touchArea position="absolute" inset={{ start: 12, end: 12, bottom: 0 }} height={8} mouseCursor="nsResize"
      onPointerDown={() => void props.api.resizeWindow('south').catch(console.error)} />
    <touchArea position="absolute" inset={{ start: 0, top: 12, bottom: 12 }} width={8} mouseCursor="ewResize"
      onPointerDown={() => void props.api.resizeWindow('west').catch(console.error)} />
    <touchArea position="absolute" inset={{ end: 0, top: 12, bottom: 12 }} width={8} mouseCursor="ewResize"
      onPointerDown={() => void props.api.resizeWindow('east').catch(console.error)} />
    <touchArea position="absolute" inset={{ start: 0, top: 0 }} width={12} height={12} mouseCursor="nwseResize"
      onPointerDown={() => void props.api.resizeWindow('northWest').catch(console.error)} />
    <touchArea position="absolute" inset={{ end: 0, top: 0 }} width={12} height={12} mouseCursor="neswResize"
      onPointerDown={() => void props.api.resizeWindow('northEast').catch(console.error)} />
    <touchArea position="absolute" inset={{ start: 0, bottom: 0 }} width={12} height={12} mouseCursor="neswResize"
      onPointerDown={() => void props.api.resizeWindow('southWest').catch(console.error)} />
    <touchArea position="absolute" inset={{ end: 0, bottom: 0 }} width={12} height={12} mouseCursor="nwseResize"
      onPointerDown={() => void props.api.resizeWindow('southEast').catch(console.error)} />
    <WindowOutline />
  </container>
}
