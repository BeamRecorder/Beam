import { describe, expect, it } from 'vitest'
import { cursorClickSpringScale } from './cursor-click-spring'

describe('cursorClickSpringScale', () => {
  it('starts and ends at its resting scale', () => {
    expect(cursorClickSpringScale(0, true)).toBe(1)
    expect(cursorClickSpringScale(.42, true)).toBe(1)
  })
  it('has a visible press followed by a rebound', () => {
    expect(cursorClickSpringScale(.07, true)).toBe(.85)
    expect(cursorClickSpringScale(.18, true)).toBeGreaterThan(1)
  })
  it('does nothing when disabled', () => expect(cursorClickSpringScale(.14, false)).toBe(1))
  it('scales the rebound intensity independently', () => {
    expect(cursorClickSpringScale(.07, true, 0)).toBe(1)
    expect(cursorClickSpringScale(.07, true, 50)).toBeCloseTo(.925)
  })
})
