import { expect, it } from 'vitest';
import { createCursorVisibleSince } from './cursor-visibility';
import { createCursorMotionPlayer } from './cursor-motion';
import { createDefaultCursorMotionSettings } from '../capture/cursor-settings';
import type { CursorEvent } from '../capture/capture-session';

const events: CursorEvent[] = [
  [0, 0.2, true],
  [0.5, 0.8, false],
  [1.99, 0.8, false],
  [2.003, 0.3, true],
  [3, 0.3, true],
].map(([t, x, visible]) => ({
  event: 'move',
  sessionNs: Number(t) * 1e9,
  normalizedX: Number(x),
  normalizedY: 0.5,
  pixelX: Number(x) * 1920,
  pixelY: 540,
  visible: Boolean(visible),
}));
const raw = { x: 0.3, y: 0.5, visible: true, cursorId: null, shapeId: null, cursorKind: null, hotspot: { x: 0, y: 0 } };

it('keeps legacy empty input visible and represents hidden runs explicitly', () => {
  expect(createCursorVisibleSince([])(1)).toBe(0);
  const since = createCursorVisibleSince(events);
  expect(since(0.49)).toBe(0);
  expect(since(1)).toBeNull();
  expect(since(2.003)).toBe(2.003);
});
it('sorts explicit visibility transitions without mutating the recording', () => {
  const changes: CursorEvent[] = [
    { event: 'visibility', sessionNs: 3e9, visible: true },
    { event: 'visibility', sessionNs: 1e9, visible: false },
  ];
  const since = createCursorVisibleSince(changes);
  expect(since(2)).toBeNull();
  expect(since(4)).toBe(3);
  expect(changes[0]?.sessionNs).toBe(3e9);
});
it.each([0, 0.67, 1])(
  'reappears at its recorded position and has no hidden motion trail at smoothing %s',
  (smoothing) => {
    const player = createCursorMotionPlayer(events, { ...createDefaultCursorMotionSettings(), smoothing });
    const sample = player.sample(2.003, raw)!;
    expect(sample.x).toBeCloseTo(0.3, 10);
    expect(sample.previousX).toBeCloseTo(sample.x, 10);
    expect(player.sample(2.012, raw)!.x).toBeCloseTo(0.3, 8);
  },
);
it('returns the same reappearance through reverse seeks and resets', () => {
  const player = createCursorMotionPlayer(events, { ...createDefaultCursorMotionSettings(), stopSpringEnabled: false });
  player.sample(3, raw);
  const before = player.sample(2.003, raw);
  player.reset();
  expect(player.sample(2.003, raw)).toEqual(before);
});
