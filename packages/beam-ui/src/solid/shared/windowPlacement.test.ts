import { describe, expect, it } from 'vitest'
import { monitorForWindow, windowPosition } from './windowPlacement'
import type { MonitorInfo } from './beamTypes'

const monitors: MonitorInfo[] = [
  { name: 'left', x: -2560, y: 0, width: 2560, height: 1440, scaleFactor: 1.5, primary: false },
  { name: 'main', x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1, primary: true },
]

describe('native desktop placement', () => {
  it('uses physical origins without scaling them twice at mixed DPI', () => {
    expect(monitorForWindow(monitors, { x: -2400, y: 100, width: 680, height: 252, scaleFactor: 1.5 })).toBe(monitors[0])
    expect(monitorForWindow(monitors, { x: -510, y: 100, width: 680, height: 252, scaleFactor: 1.5 })).toBe(monitors[1])
  })
  it('starts the recording bar centered at the bottom of the selected monitor', () => {
    expect(windowPosition(monitors, monitors[0], 400, 54, undefined, true)).toEqual({ x: -1580, y: 1329 })
    expect(windowPosition(monitors, monitors[1], 400, 54, undefined, true)).toEqual({ x: 760, y: 1006 })
  })
  it('preserves user moves, including on a secondary monitor', () => {
    expect(windowPosition(monitors, monitors[1], 400, 54, { x: -2300, y: 250 }, true)).toEqual({ x: -2300, y: 250 })
  })
  it('defaults disconnected positions and clamps valid edge positions', () => {
    expect(windowPosition(monitors, monitors[1], 400, 54, { x: 5000, y: 3000 }, true)).toEqual({ x: 760, y: 1006 })
    expect(windowPosition(monitors, monitors[1], 400, 54, { x: 1919, y: 1079 }, true)).toEqual({ x: 1520, y: 1026 })
    expect(windowPosition(monitors, monitors[0], 4000, 2000)).toEqual({ x: -2560, y: 0 })
  })
  it('handles absent coordinates and disconnected monitors', () => {
    expect(monitorForWindow(monitors, { width: 680, height: 252, scaleFactor: 1 })).toBe(monitors[1])
    expect(monitorForWindow([], { x: 0, y: 0, width: 680, height: 252, scaleFactor: 1 })).toBeUndefined()
  })
  it('centers countdown on the capture monitor when the saved screen is gone', () => {
    expect(windowPosition(monitors, monitors[0], 560, 284, { x: 5000, y: 3000 })).toEqual({ x: -1700, y: 507 })
  })
  it('keeps the default bottom placement after preferences have been reset', () => {
    expect(windowPosition(monitors, monitors[0], 400, 54, undefined, true, 1)).toEqual({ x: -1480, y: 1366 })
  })
})
