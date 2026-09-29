import type { MonitorInfo, WindowGeometry, WindowPosition } from './beamTypes'

/** Window service origins are physical; width/height remain native logical. */
export function monitorForWindow(monitors: MonitorInfo[], info: WindowGeometry): MonitorInfo | undefined {
  const x = (info.x ?? 0) + info.width * info.scaleFactor / 2
  const y = (info.y ?? 0) + info.height * info.scaleFactor / 2
  return monitors.find(monitor => info.x != null && info.y != null && x >= monitor.x && y >= monitor.y
    && x < monitor.x + monitor.width && y < monitor.y + monitor.height)
    ?? monitors.find(monitor => monitor.primary) ?? monitors[0]
}

/** Restores a physical origin on an existing monitor; disconnected origins use the default. */
export function windowPosition(monitors: MonitorInfo[], monitor: MonitorInfo, width: number, height: number,
  saved?: WindowPosition, bottom = false, nativeScale?: number): WindowPosition {
  const savedMonitor = saved ? monitors.find(item => saved.x >= item.x && saved.x < item.x + item.width
    && saved.y >= item.y && saved.y < item.y + item.height) : undefined
  const target = savedMonitor ?? monitor
  const restored = savedMonitor ? saved : undefined
  const scale = nativeScale && Number.isFinite(nativeScale) && nativeScale > 0 ? nativeScale : target.scaleFactor
  const w = width * scale, h = height * scale
  const margin = 20 * scale
  return {
    x: Math.round(Math.min(Math.max(restored?.x ?? target.x + (target.width - w) / 2, target.x), target.x + Math.max(0, target.width - w))),
    y: Math.round(Math.min(Math.max(restored?.y ?? target.y + (bottom ? target.height - h - margin : (target.height - h) / 2), target.y), target.y + Math.max(0, target.height - h))),
  }
}
