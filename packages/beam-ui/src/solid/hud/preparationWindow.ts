import type { BeamApi } from '../shared/beamApi'
import type { SourceMode } from '../shared/beamTypes'
import { monitorForWindow, windowPosition } from '../shared/windowPlacement'

/** Shows the shared pre-recording controls after the source has been selected. */
export async function showPreparation(api: BeamApi, source: SourceMode): Promise<void> {
  await api.ensureWindow('regionActions')
  await api.updateUiState({ preparationSource: source })
  const monitors = await api.monitors()
  const monitor = source === 'display' ? monitors.find(item => item.primary) ?? monitors[0]
    : monitorForWindow(monitors, await api.windowInfo())
  if (!monitor) throw new Error('No display is available.')
  const info = await api.windowInfo('regionActions')
  const scale = info.capabilities.backend === 'x11' ? info.scaleFactor : monitor.scaleFactor
  const width = Math.max(1, Math.min(620, monitor.width / scale - 16))
  const height = width < 560 ? 88 : 54
  await api.windowSize(width, height, 'regionActions')
  const saved = (await api.preferences()).windowPositions?.regionActions
  const position = windowPosition(monitors, monitor, width, height, saved, true, scale)
  await api.windowPosition(position.x, position.y, 'regionActions')
  await api.hideWindow('main')
  await api.showWindow('regionActions')
  await api.windowLevel('top', 'regionActions')
  await api.focusWindow('regionActions')
}
