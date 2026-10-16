import { expect, it } from 'vitest';
import { createCursorMotionPlayer } from './cursor-motion';
import { cursorStateAt } from './cursorPlayback';
import { createDefaultCursorMotionSettings } from '../capture/cursor-settings';
import { cursorExposureSamples } from './cursor-exposure';
import type { CursorEvent } from '../capture/capture-session';
const events: CursorEvent[] = [
  ...[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((t) => ({
    event: 'move' as const,
    sessionNs: t * 1e9,
    normalizedX: t + 0.1,
    normalizedY: 0.6 - t / 2,
    pixelX: 0,
    pixelY: 0,
    visible: true,
  })),
  { event: 'button', sessionNs: 0.403 * 1e9, button: 1, pressed: true, normalizedX: 0.503, normalizedY: 0.3985 },
  { event: 'button', sessionNs: 0.589 * 1e9, button: 1, pressed: false, normalizedX: 0.689, normalizedY: 0.3055 },
];
it.each([0, 0.67, 1])('keeps a non-grid drag exact at smoothing %s', (smoothing) => {
  const player = createCursorMotionPlayer(events, { ...createDefaultCursorMotionSettings(), smoothing });
  for (const t of [0.403, 0.404, 0.417, 0.512, 0.588]) {
    const raw = cursorStateAt(events, t)!,
      sample = player.sample(t, raw)!;
    expect(sample.x).toBeCloseTo(t + 0.1, 10);
    expect(sample.y).toBeCloseTo(0.6 - t / 2, 10);
  }
});
it('keeps resize-drag exposures bounded on the same straight placement path', () => {
  const player = createCursorMotionPlayer(events, { ...createDefaultCursorMotionSettings(), smoothing: 1 });
  const at = (t: number) => player.sample(t, cursorStateAt(events, t));
  const samples = cursorExposureSamples({
    time: 0.512,
    motion: at(0.512)!,
    intensity: 1,
    width: 3840,
    height: 2160,
    resolution: 5,
    sampleAt: at,
  });
  expect(samples).toHaveLength(16);
  for (const p of samples) {
    expect(p.x).toBeGreaterThanOrEqual(0.512 + 0.1 - 1 / 60);
    expect(p.x).toBeLessThanOrEqual(0.612);
    expect(p.y).toBeCloseTo(0.65 - p.x / 2, 10);
  }
  player.sample(10, cursorStateAt(events, 10));
  expect(
    cursorExposureSamples({
      time: 0.512,
      motion: at(0.512)!,
      intensity: 1,
      width: 3840,
      height: 2160,
      resolution: 5,
      sampleAt: at,
    }),
  ).toEqual(samples);
});
