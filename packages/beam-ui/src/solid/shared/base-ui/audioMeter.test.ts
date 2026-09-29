import { describe, expect, it } from 'vitest'
import { meterFill } from './audioMeter'

describe('real audio icon levels', () => {
  it('stays empty for disabled, silent and malformed samples', () => {
    for (const value of [null, undefined, { timestampNs: 0, peak: 0, rms: 0 },
      { timestampNs: 0, peak: NaN, rms: 0.2 }, { timestampNs: 0, peak: 0.5, rms: -1 }]) expect(meterFill(value)).toBe(0)
  })
  it('rises monotonically across quiet speech and loud audio', () => {
    const fills = [0.01, 0.03, 0.1, 0.5].map(amplitude => meterFill({ timestampNs: 1, peak: amplitude, rms: amplitude }))
    expect(fills[0]).toBe(0)
    for (let index = 1; index < fills.length; index++) expect(fills[index]).toBeGreaterThan(fills[index - 1])
    expect(fills[3]).toBeLessThan(1)
  })
  it('gates low input noise instead of showing a third of the green range', () => {
    for (const amplitude of [0, 0.0005, 0.003, 0.005, 0.01]) {
      expect(meterFill({ timestampNs: 1, peak: amplitude * 2, rms: amplitude })).toBe(0)
    }
  })
  it('shows red clipping for a peak at full scale even when RMS is lower', () => {
    for (const peak of [1, 1.1, 10]) expect(meterFill({ timestampNs: 1, peak, rms: 0.3 })).toBe(1)
  })
})
