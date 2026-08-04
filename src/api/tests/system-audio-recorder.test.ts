import { describe, expect, it } from 'vitest'
import { normalizedSystemAudioSetting, systemAudioSource } from './system-audio-recorder'

describe('system audio recorder helpers', () => {
  it('exposes one stable Chromium loopback source', () => {
    expect(systemAudioSource()).toEqual({ id: 'system-audio:chromium:desktop-loopback', kind: 'system-audio', label: 'System audio', isDefault: true })
  })

  it.each([[48_000, 48_000], [1.5, 2], [undefined, 0]])('normalizes negotiated setting %s', (value, expected) => {
    expect(normalizedSystemAudioSetting(value)).toBe(expected)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('turns invalid negotiated settings into an unknown value', (value) => {
    expect(normalizedSystemAudioSetting(value)).toBe(0)
  })
})
