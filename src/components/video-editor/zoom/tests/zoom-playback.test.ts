import { describe, expect, it } from 'vitest'
import { clampFocusToScale, regionStrength, smoothedCursorFocusAt, zoomAtTime } from '../zoom-playback'
import type { ZoomElement } from '../zoom-types'

const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 2_000,
  endMs: 6_000,
  focus: { cx: 0.3, cy: 0.7 },
  depth: 2,
  mode: 'auto',
}

describe('zoom playback', () => {
  it('returns null outside the envelope', () => expect(zoomAtTime([zoom], 100)).toBeNull())
  it('uses the Depth scale at full strength', () => expect(zoomAtTime([zoom], 4_000)?.scale).toBe(1.5))
  it('clamps camera focus to visible bounds', () =>
    expect(clampFocusToScale({ cx: 0, cy: 1 }, 2)).toEqual({
      cx: 0.25,
      cy: 0.75,
    }))
  it('tracks the telemetry focus for automatic regions', () =>
    expect(zoomAtTime([zoom], 4_000, [{ timeMs: 4_000, cx: 0.8, cy: 0.2 }])?.focus).toEqual({
      cx: 0.6666666666666667,
      cy: 0.3333333333333333,
    }))
  it('smooths an abrupt cursor jump using recent telemetry', () => {
    const focus = smoothedCursorFocusAt(
      [
        { timeMs: 0, cx: 0.2, cy: 0.5 },
        { timeMs: 100, cx: 0.8, cy: 0.5 },
      ],
      100,
    )
    expect(focus?.cx).toBeGreaterThan(0.2)
    expect(focus?.cx).toBeLessThan(0.8)
    expect(focus?.cy).toBe(0.5)
  })
  it('connects neighboring regions with an interpolated pan', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
    }
    const result = zoomAtTime([zoom, next], 6_700)
    expect(result?.scale).toBeGreaterThan(1.5)
    expect(result?.scale).toBeLessThan(2.2)
  })
  it('uses zero strength before an incoming region', () => expect(regionStrength(zoom, 0)).toBe(0))
})
