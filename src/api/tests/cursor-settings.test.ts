import { describe, expect, it } from 'vitest';
import {
  CURSOR_AUTO_HIDE_DELAY_DEFAULT,
  CURSOR_AUTO_HIDE_DELAY_MAX,
  CURSOR_AUTO_HIDE_DELAY_MIN,
  CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
  CURSOR_AUTO_HIDE_FADE_DURATION_MAX,
  CURSOR_AUTO_HIDE_FADE_DURATION_MIN,
  clickButtonForRecordedButton,
  createDefaultCursorClickEffects,
  createDefaultCursorAutoHideSettings,
  effectButtonForRecordedButton,
  createDefaultCursorMotionSettings,
  normalizeCursorAutoHideSettings,
  normalizeCursorClickEffects,
  normalizeCursorMotionSettings,
} from '../types/cursor-settings';

describe('cursor auto-hide settings', () => {
  it('defaults to disabled with the default delay', () => {
    expect(createDefaultCursorAutoHideSettings()).toEqual({
      enabled: false,
      delaySeconds: CURSOR_AUTO_HIDE_DELAY_DEFAULT,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
    });
  });

  it('normalizes malformed values to safe defaults', () => {
    expect(normalizeCursorAutoHideSettings({ enabled: 'yes', delaySeconds: Number.NaN })).toEqual({
      enabled: false,
      delaySeconds: CURSOR_AUTO_HIDE_DELAY_DEFAULT,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
    });
    expect(normalizeCursorAutoHideSettings(null)).toEqual({
      enabled: false,
      delaySeconds: CURSOR_AUTO_HIDE_DELAY_DEFAULT,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
    });
  });

  it('clamps the delay and fade duration to their supported slider ranges', () => {
    expect(normalizeCursorAutoHideSettings({ enabled: true, delaySeconds: CURSOR_AUTO_HIDE_DELAY_MIN - 1 })).toEqual({
      enabled: true,
      delaySeconds: CURSOR_AUTO_HIDE_DELAY_MIN,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
    });
    expect(normalizeCursorAutoHideSettings({ enabled: true, delaySeconds: CURSOR_AUTO_HIDE_DELAY_MAX + 1 })).toEqual({
      enabled: true,
      delaySeconds: CURSOR_AUTO_HIDE_DELAY_MAX,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
    });
    expect(
      normalizeCursorAutoHideSettings({
        enabled: true,
        fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_MIN - 1,
      }),
    ).toMatchObject({
      enabled: true,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_MIN,
    });
    expect(
      normalizeCursorAutoHideSettings({
        enabled: true,
        fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_MAX + 1,
      }),
    ).toMatchObject({
      enabled: true,
      fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_MAX,
    });
  });
});

describe('cursor click settings', () => {
  it('keeps left and right defaults independent', () => {
    const defaults = createDefaultCursorClickEffects();
    expect(defaults.left).toMatchObject({ springEnabled: true, rippleEnabled: false, rippleStyle: 'single' });
    expect(defaults.right).toMatchObject({ springEnabled: true, rippleEnabled: false, rippleStyle: 'single' });
    defaults.left.rippleSize = 42;
    expect(defaults.right.rippleSize).toBe(30);
  });

  it('normalizes invalid persisted values without losing button separation', () => {
    expect(
      normalizeCursorClickEffects({
        left: { springIntensity: 140, rippleSize: 0 },
        right: { springEnabled: false, rippleColor: '#00ff00' },
      }),
    ).toEqual({
      left: {
        springEnabled: true,
        springIntensity: 100,
        rippleEnabled: false,
        rippleStyle: 'single',
        rippleSize: 10,
        rippleColor: '#ff5a1f',
      },
      right: {
        springEnabled: false,
        springIntensity: 50,
        rippleEnabled: false,
        rippleStyle: 'single',
        rippleSize: 30,
        rippleColor: '#00ff00',
      },
    });
  });

  it('uses spring-on and ripple-off defaults when both persisted button records are empty', () => {
    expect(normalizeCursorClickEffects({ left: {}, right: {} })).toMatchObject({
      left: { springEnabled: true, rippleEnabled: false, rippleStyle: 'single' },
      right: { springEnabled: true, rippleEnabled: false, rippleStyle: 'single' },
    });
  });

  it('normalizes one shared wave shape while preserving left and right activation', () => {
    expect(
      normalizeCursorClickEffects({
        left: { rippleEnabled: false, rippleStyle: 'double' },
        right: { rippleEnabled: true, rippleStyle: 'solid' },
      }),
    ).toMatchObject({
      left: { rippleEnabled: false, rippleStyle: 'double' },
      right: { rippleEnabled: true, rippleStyle: 'double' },
    });
  });

  it('maps the recording button numbers to the visual effect groups', () => {
    expect(clickButtonForRecordedButton(1)).toBe('left');
    expect(clickButtonForRecordedButton(2)).toBe('right');
    expect(clickButtonForRecordedButton(3)).toBe('middle');
    expect(effectButtonForRecordedButton(3)).toBe('left');
    expect(effectButtonForRecordedButton(99)).toBeNull();
  });

  it('defaults motion settings to the smooth Recordly-inspired preset', () => {
    expect(createDefaultCursorMotionSettings()).toEqual({
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0.4,
    });
  });

  it('clamps invalid motion settings at the persisted boundary', () => {
    expect(
      normalizeCursorMotionSettings({ preset: 'custom', smoothing: 4, springMassMultiplier: 0, motionBlur: -1 }),
    ).toEqual({
      preset: 'custom',
      smoothing: 1,
      springMassMultiplier: 0.5,
      motionBlur: 0,
    });
  });
});
