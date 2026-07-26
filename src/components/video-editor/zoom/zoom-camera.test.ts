import { describe, expect, it } from 'vitest'
import { createCursorFollowCameraState, updateCursorFollowCamera } from './zoom-camera'

describe('cursor follow camera', () => {
  it('does not move while cursor remains in its safe zone', () => {
    const state = createCursorFollowCameraState()
    updateCursorFollowCamera(state, { cx: 0.5, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1)
    expect(updateCursorFollowCamera(state, { cx: 0.55, cy: 0.55 }, { cx: 0.5, cy: 0.5 }, 2, 1)).toEqual({ cx: 0.5, cy: 0.5 })
  })
  it('smooths only the axis that leaves the safe zone', () => {
    const state = createCursorFollowCameraState()
    updateCursorFollowCamera(state, { cx: 0.5, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1)
    const result = updateCursorFollowCamera(state, { cx: 0.8, cy: 0.55 }, { cx: 0.5, cy: 0.5 }, 2, 1)
    expect(result.cx).toBeGreaterThan(0.5)
    expect(result.cx).toBeLessThan(0.75)
    expect(result.cy).toBe(0.5)
  })
  it('settles after a fast cursor movement instead of teleporting', () => {
    const state = createCursorFollowCameraState()
    updateCursorFollowCamera(state, { cx: 0.5, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1, 0)
    for (let timeMs = 16; timeMs <= 1_000; timeMs += 16) {
      updateCursorFollowCamera(state, { cx: 0.9, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1, timeMs)
    }
    expect(state.focus.cx).toBeCloseTo(0.75, 2)
  })
  it('freezes at the last focus during zoom-out', () => {
    const state = createCursorFollowCameraState()
    updateCursorFollowCamera(state, { cx: 0.7, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1)
    expect(updateCursorFollowCamera(state, { cx: 0.3, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 0.8)).toEqual(state.frozenFocus)
  })
  it('resets safely after a backward seek', () => {
    const state = createCursorFollowCameraState()
    updateCursorFollowCamera(state, { cx: 0.7, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1, 2_000)
    expect(updateCursorFollowCamera(state, { cx: 0.3, cy: 0.5 }, { cx: 0.5, cy: 0.5 }, 2, 1, 1_000)).toEqual({ cx: 0.5, cy: 0.5 })
  })
})
