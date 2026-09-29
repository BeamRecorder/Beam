import { expect, it } from 'vitest'
import { splitterGeometry } from './splitterGeometry'

it.each([false, true])('keeps the vertical hit target centered with hairline=%s', hairline => {
  const geometry = splitterGeometry(true, hairline)
  expect(geometry.orientation).toBe('vertical')
  expect(geometry.cursor).toBe('ewResize')
  expect((geometry.hitWidth as number) + 2 * geometry.inset.start).toBe(geometry.width)
  expect(geometry.pillHeight).toBe(32)
  expect(geometry.height).toBe('100%')
})
it('uses a horizontal hit target independent of the hairline option', () => {
  expect(splitterGeometry(false, true)).toEqual(splitterGeometry())
  const geometry = splitterGeometry()
  expect(geometry.cursor).toBe('nsResize')
  expect((geometry.hitHeight as number) + 2 * geometry.inset.top).toBe(geometry.height)
  expect(geometry.width).toBe('100%')
})
