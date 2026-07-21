import { describe, expect, it } from 'vitest'
import { createCameraVelocity, stepCameraSpring } from './zoom-spring'

describe('camera spring', () => {
  it('moves toward the target without overshoot', () => {
    const velocity = createCameraVelocity()
    const result = stepCameraSpring({ focusX: 0, focusY: 0, scale: 1 }, { focusX: 1, focusY: 1, scale: 2 }, velocity, 16)
    expect(result.focusX).toBeGreaterThan(0); expect(result.focusX).toBeLessThan(1); expect(result.scale).toBeGreaterThan(1)
  })
  it('is stable for a large frame delta', () => expect(stepCameraSpring({ focusX: 0, focusY: 0, scale: 1 }, { focusX: 1, focusY: 1, scale: 2 }, createCameraVelocity(), 500).scale).toBeLessThanOrEqual(2))
  it('keeps a settled camera stationary', () => expect(stepCameraSpring({ focusX: 0.5, focusY: 0.5, scale: 2 }, { focusX: 0.5, focusY: 0.5, scale: 2 }, createCameraVelocity(), 16)).toEqual({ focusX: 0.5, focusY: 0.5, scale: 2 }))
})
