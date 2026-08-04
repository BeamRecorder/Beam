import { describe, expect, it } from 'vitest'
import { bitrateFor } from './export-presets'

describe('bitrateFor', () => {
  it('uses medium quality by default scale for HD video', () => {
    expect(bitrateFor('medium', 1920, 1080, 30)).toBe(5_909_760)
  })
  it('increases bitrate with quality and frame rate', () => {
    expect(bitrateFor('high', 1280, 720, 60)).toBeGreaterThan(bitrateFor('low', 1280, 720, 30))
  })
  it('keeps bitrate within safe encoder bounds for invalid dimensions', () => {
    expect(bitrateFor('low', 0, 0, 0)).toBe(500_000)
    expect(bitrateFor('high', 16_000, 16_000, 240)).toBe(40_000_000)
  })
})
