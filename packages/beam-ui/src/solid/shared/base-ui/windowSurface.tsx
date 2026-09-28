import type { JSX } from '@argui/solid/jsx-runtime'
import type { PositionInsetsValue } from '@argui/host'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import type { BeamApi } from '../beamApi'
import type { ResizeDirection } from '../beamTypes'

const edges: { direction: ResizeDirection; inset: PositionInsetsValue; width?: number; height?: number; cursor: 'ewResize' | 'nsResize' | 'nwseResize' | 'neswResize' }[] = [
  { direction: 'north', inset: { left: 8, right: 8, top: 0 }, height: 5, cursor: 'nsResize' },
  { direction: 'south', inset: { left: 8, right: 8, bottom: 0 }, height: 5, cursor: 'nsResize' },
  { direction: 'west', inset: { left: 0, top: 8, bottom: 8 }, width: 5, cursor: 'ewResize' },
  { direction: 'east', inset: { right: 0, top: 8, bottom: 8 }, width: 5, cursor: 'ewResize' },
  { direction: 'northWest', inset: { left: 0, top: 0 }, width: 8, height: 8, cursor: 'nwseResize' },
  { direction: 'northEast', inset: { right: 0, top: 0 }, width: 8, height: 8, cursor: 'neswResize' },
  { direction: 'southWest', inset: { left: 0, bottom: 0 }, width: 8, height: 8, cursor: 'neswResize' },
  { direction: 'southEast', inset: { right: 0, bottom: 0 }, width: 8, height: 8, cursor: 'nwseResize' },
]

/** Final paint layer shares the surface silhouette, with no dark rim outside it. */
export function WindowOutline(props: { rounded?: boolean }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <rectangle position="absolute" inset={{ left: 0, right: 0, top: 0, bottom: 0 }}
    radii={props.rounded === false ? 0 : 12} border={{ width: 1, color: theme().outlineBorder }} />
}

/** Rounded native client surface with real OS resize handles. */
export function WindowSurface(props: { api?: BeamApi; children: JSX.Element; resizable?: boolean }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <container width="100%" height="100%">
    <rectangle width="100%" height="100%" radii={12} clip background={theme().background}>
      <container width="100%" height="100%" padding={1}>{props.children}</container>
    </rectangle>
    {props.api && props.resizable !== false && edges.map(edge => <touchArea position="absolute" inset={edge.inset}
      width={edge.width} height={edge.height} mouseCursor={edge.cursor}
      onPointerDown={() => void props.api!.resizeWindow(edge.direction).catch(console.error)} />)}
    <WindowOutline />
  </container>
}
