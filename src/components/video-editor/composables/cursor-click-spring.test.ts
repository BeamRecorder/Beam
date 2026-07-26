import { describe, expect, it } from 'vitest'
import { cursorClickSpringScale } from './cursor-click-spring'

describe('cursorClickSpringScale', () => {
  it('starts and ends at its resting scale', () => {
    expect(cursorClickSpringScale(0, true)).toBe(1)
    expect(cursorClickSpringScale(.28, true)).toBe(1)
  })
  it('has a visible but restrained press at mid-animation', () => {
    expect(cursorClickSpringScale(.14, true)).toBeGreaterThan(.88)
    expect(cursorClickSpringScale(.14, true)).toBeLessThan(.96)
  })
  it('does nothing when disabled', () => expect(cursorClickSpringScale(.14, false)).toBe(1))
})
