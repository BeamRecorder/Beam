import { describe, expect, it } from 'vitest'
import { projectGrid } from './projectGrid'

describe('native project grid', () => {
  it('fits two cards at the minimum window size and grows to four in a wide window', () => {
    for (const [width, expectedColumns] of [[440, 2], [600, 2], [880, 3], [1100, 4]]) {
      const grid = projectGrid(width)
      expect(grid.columns).toBe(expectedColumns)
      expect(grid.columns * grid.cardWidth + (grid.columns - 1) * grid.gap).toBe(width - 36)
      expect(grid.previewHeight).toBeGreaterThan(100)
    }
  })
})
