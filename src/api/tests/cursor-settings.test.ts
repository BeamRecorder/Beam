import { describe, expect, it } from 'vitest'
import {
  clickButtonForRecordedButton,
  createDefaultCursorClickEffects,
  effectButtonForRecordedButton,
  createDefaultCursorMotionSettings,
  normalizeCursorClickEffects,
  normalizeCursorMotionSettings,
} from '../types/cursor-settings'

describe('cursor click settings', () => {
  it('keeps left and right defaults independent', () => {
    const defaults = createDefaultCursorClickEffects()
    defaults.left.rippleSize = 42
    expect(defaults.right.rippleSize).toBe(30)
  })

  it('normalizes invalid persisted values without losing button separation', () => {
    expect(
      normalizeCursorClickEffects({
        left: { springIntensity: 140, rippleSize: 0 },
        right: { springEnabled: false, rippleColor: '#00ff00' },
      }),
    ).toEqual({
      left: { springEnabled: true, springIntensity: 100, rippleEnabled: true, rippleSize: 10, rippleColor: '#ff5a1f' },
      right: { springEnabled: false, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#00ff00' },
    })
  })

  it('maps the recording button numbers to the visual effect groups', () => {
    expect(clickButtonForRecordedButton(1)).toBe('left')
    expect(clickButtonForRecordedButton(2)).toBe('right')
    expect(clickButtonForRecordedButton(3)).toBe('middle')
    expect(effectButtonForRecordedButton(3)).toBe('left')
    expect(effectButtonForRecordedButton(99)).toBeNull()
  })

  it('defaults motion settings to the smooth Recordly-inspired preset', () => {
    expect(createDefaultCursorMotionSettings()).toEqual({
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0.4,
    })
  })

  it('clamps invalid motion settings at the persisted boundary', () => {
    expect(
      normalizeCursorMotionSettings({ preset: 'custom', smoothing: 4, springMassMultiplier: 0, motionBlur: -1 }),
    ).toEqual({
      preset: 'custom',
      smoothing: 1,
      springMassMultiplier: 0.5,
      motionBlur: 0,
    })
  })
})
