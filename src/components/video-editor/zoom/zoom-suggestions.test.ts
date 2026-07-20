import { describe, expect, it } from 'vitest'
import type { CursorEvent } from '../../../api/types/capture-session'
import { buildAutomaticZoomElements } from './zoom-suggestions'

const move = (ms: number, x: number, y: number): CursorEvent => ({
  event: 'move', sessionNs: ms * 1_000_000, pixelX: 0, pixelY: 0, normalizedX: x, normalizedY: y, visible: true,
})
const click = (ms: number, button = 0): CursorEvent => ({ event: 'button', sessionNs: ms * 1_000_000, button, pressed: true })

describe('buildAutomaticZoomElements', () => {
  it('creates a padded zoom from a left click with a cursor position', () => {
    const zooms = buildAutomaticZoomElements({ events: [move(1_000, 0.25, 0.75), click(1_100)], sessionId: 'session', durationMs: 5_000 })
    expect(zooms).toMatchObject([{ startMs: 600, endMs: 1600, focus: { cx: 0.25, cy: 0.75 }, scale: 1.75 }])
  })

  it('merges nearby clicks at the same focus into one element', () => {
    const zooms = buildAutomaticZoomElements({ events: [move(1_000, 0.5, 0.5), click(1_000), click(2_000)], sessionId: 'session', durationMs: 5_000 })
    expect(zooms).toHaveLength(1)
    expect(zooms[0]).toMatchObject({ startMs: 500, endMs: 2500 })
  })

  it('ignores secondary clicks, invisible cursor data, and invalid durations', () => {
    expect(buildAutomaticZoomElements({ events: [move(1_000, 0.5, 0.5), click(1_000, 1)], sessionId: 'session', durationMs: 5_000 })).toEqual([])
    expect(buildAutomaticZoomElements({ events: [click(1_000)], sessionId: 'session', durationMs: 0 })).toEqual([])
  })
})
