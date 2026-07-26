import { describe, expect, it } from 'vitest'
import { cursorHotspotAtSize, cursorPositionAt, cursorTypeAt } from './cursor-rendering'

const cursor = (x: number, y: number, cursorKind: string | null = 'default') => ({
  x,
  y,
  visible: true,
  cursorId: null,
  shapeId: null,
  cursorKind: cursorKind as never,
  hotspot: { x: 0, y: 0 },
})

describe('cursor rendering', () => {
  it('uses the recorded semantic type only when automatic is selected', () => {
    expect(cursorTypeAt('automatic', cursor(.5, .5, 'textcursor'))).toBe('textcursor')
    expect(cursorTypeAt('handpointing', cursor(.5, .5, 'textcursor'))).toBe('handpointing')
    expect(cursorTypeAt('automatic', cursor(.5, .5, 'custom'))).toBe('default')
  })

  it('keeps cursor hotspots tied to logical cursor size, not raster dimensions', () => {
    expect(cursorHotspotAtSize('default', 24)).toEqual({ x: 7.5, y: 5.25 })
    expect(cursorHotspotAtSize('default', 48)).toEqual({ x: 15, y: 10.5 })
  })

  it('uses the same framed-background and base-transform coordinates for every canvas', () => {
    expect(cursorPositionAt(cursor(.5, .5), { width: 100, height: 50 }, { x: 10, y: 20, width: 200, height: 200 }, true, { x: .1, y: .2, width: .8, height: .6 })).toEqual({ x: 110, y: 120 })
  })

  it('mirrors and clamps cursor coordinates at the shared geometry boundary', () => {
    expect(cursorPositionAt(cursor(2, -.1), { width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }, false, undefined, true)).toEqual({ x: 0, y: 0 })
  })
})
