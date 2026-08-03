import { describe, expect, it } from 'vitest'
import { computeCanvasAlignmentSnapping, type AlignmentTarget } from '../canvas-alignment'

describe('canvas-alignment', () => {
  it('snaps item center to canvas center (X=0.5, Y=0.5)', () => {
    const moved = { x: 0.402, y: 0.398, width: 0.2, height: 0.2 }
    const result = computeCanvasAlignmentSnapping(moved, [])

    expect(result.x).toBe(0.4) // center snapped to 0.5 -> x = 0.5 - 0.1 = 0.4
    expect(result.y).toBe(0.4) // center snapped to 0.5 -> y = 0.5 - 0.1 = 0.4
    expect(result.guides).toEqual([
      { type: 'vertical', position: 0.5 },
      { type: 'horizontal', position: 0.5 },
    ])
  })

  it('snaps item edge to 5% safe area padding margin', () => {
    const moved = { x: 0.052, y: 0.048, width: 0.2, height: 0.2 }
    const result = computeCanvasAlignmentSnapping(moved, [])

    expect(result.x).toBe(0.05) // left snapped to 5% safe padding
    expect(result.y).toBe(0.05) // top snapped to 5% safe padding
    expect(result.guides).toContainEqual({ type: 'vertical', position: 0.05 })
    expect(result.guides).toContainEqual({ type: 'horizontal', position: 0.05 })
  })

  it('snaps item edge to another clip edge', () => {
    const moved = { x: 0.24, y: 0.1, width: 0.2, height: 0.2 }
    const otherClips: AlignmentTarget[] = [{ id: 'clip1', x: 0.0, y: 0.1, width: 0.25, height: 0.3 }]

    const result = computeCanvasAlignmentSnapping(moved, otherClips, 0.02)
    expect(result.x).toBe(0.25)
    expect(result.guides).toContainEqual({ type: 'vertical', position: 0.25 })
  })
})
