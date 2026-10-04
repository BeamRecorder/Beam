import type { CursorEvent } from '../capture/capture-session';
import { effectButtonForRecordedButton, type CursorClickEffects } from '../capture/cursor-settings';
import { buttonEventsBetween } from './cursorPlayback';
import { CURSOR_CLICK_LIMITS, normalizeCursorWaterRipple } from '../capture/cursor-click-schema.js';
import type { CursorWaterRipple } from './cursor-ripple-types';

export const MAX_CURSOR_WATER_RIPPLE_DURATION_SECONDS = CURSOR_CLICK_LIMITS.durationMs.max / 1000;
export const MAX_CURSOR_WATER_RIPPLES = 8;

/** Sample recorded presses, independently of cursor smoothing or playback direction. */
export function cursorWaterRipplesAt(
  events: CursorEvent[],
  effects: CursorClickEffects,
  timeSeconds: number,
): CursorWaterRipple[] {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return [];
  const ripples: CursorWaterRipple[] = [];
  // The event index has an exclusive lower bound; include presses at session zero.
  const presses = buttonEventsBetween(events, timeSeconds - MAX_CURSOR_WATER_RIPPLE_DURATION_SECONDS, timeSeconds);
  for (const press of presses) {
    const button = effectButtonForRecordedButton(press.button);
    const effect = button ? effects[button] : null;
    const water = normalizeCursorWaterRipple(effect?.water);
    const ageSeconds = timeSeconds - press.sessionNs / 1_000_000_000;
    if (
      !effect?.rippleEnabled ||
      effect.rippleStyle !== 'water' ||
      ageSeconds < 0 ||
      ageSeconds >= water.durationMs / 1000 ||
      water.intensity === 0 ||
      ![press.normalizedX, press.normalizedY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    )
      continue;
    ripples.push({
      x: press.normalizedX,
      y: press.normalizedY,
      ageSeconds,
      spread: water.spread,
      intensity: water.intensity,
      durationSeconds: water.durationMs / 1000,
      width: water.width,
    });
  }
  return ripples.slice(-MAX_CURSOR_WATER_RIPPLES);
}
