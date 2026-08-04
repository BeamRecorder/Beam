import { describe, expect, it } from 'vitest'
import { buttonEventsBetween, cursorAssetForState, cursorStateAt } from '../cursorPlayback'
import type { CursorEvent, CursorShapeAsset } from '../../../../api/types/capture-api'

const second = (value: number) => value * 1_000_000_000
const move = (time: number, x: number, y: number, visible = true): CursorEvent => ({
  event: 'move',
  sessionNs: second(time),
  pixelX: 0,
  pixelY: 0,
  normalizedX: x,
  normalizedY: y,
  visible,
})

describe('cursor playback', () => {
  it('returns no cursor before the first move, including negative playback time', () => {
    expect(cursorStateAt([move(1, 0.1, 0.2)], 0.5)).toBeNull()
    expect(cursorStateAt([move(1, 0.1, 0.2)], -4)).toBeNull()
  })

  it('uses the first recorded position at the exact start of the timeline', () => {
    expect(cursorStateAt([move(0.02, 0.1, 0.2)], 0)).toMatchObject({
      x: 0.1,
      y: 0.2,
      visible: true,
    })
  })

  it('smooths movement between recorded cursor positions', () => {
    const state = cursorStateAt([move(0, 0, 0), move(1, 1, 0)], 0.25)
    expect(state?.x).toBeCloseTo(0.15625)
  })

  it('interpolates the next move and applies shape and visibility events', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: second(0),
        shapeId: 'arrow',
        hotspot: { x: 3, y: 4 },
      },
      move(1, 0.2, 0.4),
      { event: 'button', sessionNs: second(1.1), button: 0, pressed: true, normalizedX: 0.2, normalizedY: 0.4 },
      { event: 'visibility', sessionNs: second(1.2), visible: false },
      move(3, 0.8, 0.6),
    ]
    expect(cursorStateAt(events, 2)).toEqual({
      x: 0.5,
      y: 0.5,
      visible: false,
      shapeId: 'arrow',
      cursorId: 'arrow',
      cursorKind: null,
      hotspot: { x: 3, y: 4 },
    })
  })

  it('uses initial shape data and keeps the latest move state after the final move', () => {
    expect(cursorStateAt([move(2, 0.7, 0.8, false)], 4, 'initial', { x: 1, y: 2 })).toEqual({
      x: 0.7,
      y: 0.8,
      visible: false,
      shapeId: 'initial',
      cursorId: 'initial',
      cursorKind: null,
      hotspot: { x: 1, y: 2 },
    })
  })

  it('uses the first future move and ignores future non-move state changes', () => {
    const events: CursorEvent[] = [
      move(1, 0, 0),
      {
        event: 'shape',
        sessionNs: second(2.5),
        shapeId: 'future',
        hotspot: { x: 9, y: 9 },
      },
      move(3, 0.5, 0.5),
      move(4, 1, 1),
      { event: 'button', sessionNs: second(5), button: 0, pressed: true, normalizedX: 1, normalizedY: 1 },
    ]
    expect(cursorStateAt(events, 2, 'initial')).toMatchObject({
      x: 0.25,
      y: 0.25,
      shapeId: 'initial',
    })
  })

  it('returns only pressed button events in the half-open playback interval', () => {
    const events: CursorEvent[] = [
      { event: 'button', sessionNs: second(1), button: 1, pressed: true, normalizedX: 0, normalizedY: 0 },
      { event: 'button', sessionNs: second(2), button: 1, pressed: false, normalizedX: 0, normalizedY: 0 },
      { event: 'button', sessionNs: second(3), button: 2, pressed: true, normalizedX: 1, normalizedY: 1 },
    ]
    expect(buttonEventsBetween(events, 1, 3)).toEqual([events[2]])
    expect(buttonEventsBetween(events, 0, 3, 'right')).toEqual([events[2]])
    expect(buttonEventsBetween(events, 0, 3, 'left')).toEqual([events[0]])
    expect(buttonEventsBetween(events, 3, 1)).toEqual([])
  })

  it('resolves shape assets only for known shape ids', () => {
    const asset: CursorShapeAsset = {
      src: 'cursor.png',
      hotspot: { x: 2, y: 5 },
    }
    expect(
      cursorAssetForState(
        {
          x: 0,
          y: 0,
          visible: true,
          cursorId: null,
          shapeId: 'arrow',
          cursorKind: null,
          hotspot: { x: 0, y: 0 },
        },
        { arrow: asset },
      ),
    ).toBe(asset)
    expect(
      cursorAssetForState(
        {
          x: 0,
          y: 0,
          visible: true,
          cursorId: null,
          shapeId: 'missing',
          cursorKind: null,
          hotspot: { x: 0, y: 0 },
        },
        {},
      ),
    ).toBeNull()
    expect(cursorAssetForState(null, { arrow: asset })).toBeNull()
  })

  it('keeps a semantic cursor kind without requiring a bitmap shape', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: 0,
        cursorId: 'win:arrow',
        cursorKind: 'default',
        nativeCursorId: 'win:arrow',
        hotspot: { x: 1, y: 2 },
      },
      move(1, 0.2, 0.3),
    ]
    expect(cursorStateAt(events, 1)).toMatchObject({
      cursorId: 'win:arrow',
      cursorKind: 'default',
      hotspot: { x: 1, y: 2 },
    })
  })

  it('exposes custom cursors so the renderer can show an explicit fallback', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: 0,
        cursorId: 'x11:42',
        cursorKind: 'custom',
        nativeCursorId: 'x11:42',
        hotspot: { x: 0, y: 0 },
      },
      move(1, 0.5, 0.5),
    ]
    expect(cursorStateAt(events, 1)?.cursorKind).toBe('custom')
  })
})
