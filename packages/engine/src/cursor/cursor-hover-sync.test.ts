import { describe, expect, it } from 'vitest';
import { cursorHoverWeightAt, validateCursorHoverSources, validateCursorHoverSync } from './cursor-hover-sync';
import { createCursorMotionPlayer } from './cursor-motion';
import { createDefaultCursorMotionSettings } from '../capture/cursor-settings';
import type { CursorEvent } from '../capture/capture-session';

const sync = {
  version: 1 as const,
  ranges: [
    { startSeconds: 1, endSeconds: 1.4 },
    { startSeconds: 3, endSeconds: 4 },
  ],
};
const source = { id: 'a', src: 'project-media://a/screen.mp4', startSeconds: 0, durationSeconds: 2 };
describe('hover synchronization contract', () => {
  it('accepts empty and ordered ranges and sources', () => {
    expect(() => validateCursorHoverSync(sync)).not.toThrow();
    expect(() => validateCursorHoverSync({ version: 1, ranges: [] })).not.toThrow();
    expect(() => validateCursorHoverSources([])).not.toThrow();
    expect(() => validateCursorHoverSources([source, { ...source, startSeconds: 2 }])).not.toThrow();
  });
  it.each([
    null,
    {},
    { version: 2, ranges: [] },
    { version: 1, ranges: null },
    { version: 1, ranges: Array(250_001).fill(null) },
    ...[
      null,
      {},
      { startSeconds: -1, endSeconds: 1 },
      { startSeconds: 1, endSeconds: 1 },
      { startSeconds: NaN, endSeconds: 3 },
      { startSeconds: 1, endSeconds: Infinity },
      { startSeconds: '0', endSeconds: 1 },
    ].map((range) => ({ version: 1, ranges: [range] })),
    {
      version: 1,
      ranges: [
        { startSeconds: 1, endSeconds: 2 },
        { startSeconds: 2, endSeconds: 3 },
      ],
    },
  ])('rejects invalid, excessive or overlapping ranges: %j', (value) => {
    expect(() => validateCursorHoverSync(value)).toThrow(TypeError);
  });
  it.each([
    null,
    {},
    Array(10_001).fill(null),
    [null],
    [{}],
    ...[
      { id: '' },
      { id: 'x'.repeat(1025) },
      { src: '' },
      { src: 'x'.repeat(8193) },
      { startSeconds: -1 },
      { startSeconds: NaN },
      { durationSeconds: 0 },
      { durationSeconds: Infinity },
      { durationSeconds: Number.MAX_VALUE },
    ].map((patch) => [{ ...source, ...patch }]),
    [source, source],
    [source, { ...source, startSeconds: 1.9 }],
  ])('rejects invalid analysis source metadata: %j', (value) => {
    expect(() => validateCursorHoverSources(value)).toThrow(TypeError);
  });
  it('pins interactions and eases in/out without disturbing unrelated movement', () => {
    expect(cursorHoverWeightAt(undefined, 1)).toBe(0);
    expect(cursorHoverWeightAt(sync, NaN)).toBe(0);
    expect(cursorHoverWeightAt(sync, 0)).toBe(0);
    expect(cursorHoverWeightAt(sync, 0.97)).toBeCloseTo(0.5);
    for (const time of [1, 1.01, 1.39, 1.4, 3, 4]) expect(cursorHoverWeightAt(sync, time)).toBe(1);
    expect(cursorHoverWeightAt(sync, 1.46)).toBeCloseTo(0.5);
    expect(cursorHoverWeightAt(sync, 2)).toBe(0);
    expect(cursorHoverWeightAt(sync, 10)).toBe(0);
  });
  it('keeps fade boundaries continuous and bounded when gestures are close', () => {
    const close = {
      version: 1 as const,
      ranges: [
        { startSeconds: 1, endSeconds: 1.1 },
        { startSeconds: 1.15, endSeconds: 2 },
      ],
    };
    for (let time = 0; time < 3; time += 0.001) {
      const weight = cursorHoverWeightAt(close, time);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
      expect(Math.abs(weight - cursorHoverWeightAt(close, time + 1e-6))).toBeLessThan(0.0001);
    }
  });
});

describe('adaptive cursor motion', () => {
  const events: CursorEvent[] = Array.from({ length: 121 }, (_, index) => ({
    event: 'move',
    sessionNs: (index / 60) * 1e9,
    normalizedX: 0.4,
    normalizedY: 0.15 + (Math.floor(index / 3) % 12) * 0.055,
    pixelX: 768,
    pixelY: 100,
    visible: true,
  }));
  const raw = {
    x: 0.4,
    y: 0.15,
    visible: true,
    cursorId: null,
    shapeId: null,
    cursorKind: null,
    hotspot: { x: 0, y: 0 },
  };
  const ranges = { version: 1 as const, ranges: [{ startSeconds: 0.3, endSeconds: 1.5 }] };
  it('matches every recorded row transition even at maximum smoothing', () => {
    const settings = { ...createDefaultCursorMotionSettings(), smoothing: 1 };
    const pinned = createCursorMotionPlayer(events, settings, 1920, 1080, ranges);
    const direct = createCursorMotionPlayer(events, { ...settings, smoothing: 0 });
    const ordinary = createCursorMotionPlayer(events, settings);
    let originalError = 0;
    for (let tick = 20; tick <= 89; tick++) {
      const time = tick / 60;
      expect(pinned.sample(time, raw)?.y).toBeCloseTo(direct.timeline.targetAt(time)!.y, 12);
      originalError = Math.max(
        originalError,
        Math.abs(ordinary.sample(time, raw)!.y - direct.timeline.targetAt(time)!.y),
      );
    }
    expect(originalError).toBeGreaterThan(0.01);
    expect(pinned.sample(1.9, raw)).toEqual(ordinary.sample(1.9, raw));
  });
  it('gives identical positions after reverse seeking, reset and serialized export metadata', () => {
    const settings = createDefaultCursorMotionSettings();
    const preview = createCursorMotionPlayer(events, settings, 1920, 1080, ranges);
    const exportPlayer = createCursorMotionPlayer(events, settings, 1920, 1080, JSON.parse(JSON.stringify(ranges)));
    const samples = Array.from({ length: 120 }, (_, tick) => exportPlayer.sample(tick / 60, raw));
    for (let tick = 119; tick >= 0; tick--) expect(preview.sample(tick / 60, raw)).toEqual(samples[tick]);
    preview.reset();
    expect(preview.sample(0.74, raw)).toEqual(exportPlayer.sample(0.74, raw));
    expect(preview.sample(0.74, null)).toBeNull();
  });
  it('rejects corrupt metadata before building a player', () => {
    expect(() =>
      createCursorMotionPlayer(events, createDefaultCursorMotionSettings(), 1920, 1080, {
        version: 1,
        ranges: [{ startSeconds: 3, endSeconds: 1 }],
      }),
    ).toThrow();
  });
});
