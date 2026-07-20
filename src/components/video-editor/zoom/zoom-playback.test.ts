import { describe, expect, it } from 'vitest'
import { zoomAtTime } from './zoom-playback'
import type { ZoomElement } from './zoom-types'

const zoom: ZoomElement = { id: 'zoom', sessionId: 'session', startMs: 1_000, endMs: 2_000, focus: { cx: 0.3, cy: 0.7 }, scale: 2, speed: 1, source: 'automatic' }

describe('zoomAtTime', () => {
  it('returns null outside an element', () => expect(zoomAtTime([zoom], 999)).toBeNull())
  it('holds the configured scale between transition phases', () => expect(zoomAtTime([zoom], 1_500)).toEqual({ scale: 2, focus: zoom.focus }))
  it('interpolates during entrance and exit', () => {
    expect(zoomAtTime([zoom], 1_110)?.scale).toBeGreaterThan(1)
    expect(zoomAtTime([zoom], 1_110)?.scale).toBeLessThan(2)
    expect(zoomAtTime([zoom], 1_900)?.scale).toBeLessThan(2)
  })
})
