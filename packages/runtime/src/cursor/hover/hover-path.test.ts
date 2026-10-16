import { describe, expect, it } from 'vitest';
import type { CursorEvent } from '@beam/engine/capture/capture-session';
import { packHoverPath, hoverPointAt, hoverTimestamps } from './hover-path';
import { validateHoverInput } from './hover-input';

const move = (time: number, x = 0.5, y = 0.5, visible = true): CursorEvent => ({
  event: 'move',
  sessionNs: time * 1e9,
  normalizedX: x,
  normalizedY: y,
  pixelX: 0,
  pixelY: 0,
  visible,
});
describe('compact hover telemetry', () => {
  it('orders immutable input and interpolates without copying shape bitmaps', () => {
    const events = [move(2, 1, 1), move(0, 0, 0)];
    const path = packHoverPath(events);
    expect([...path]).toEqual([0, 0, 0, 1, 2, 1, 1, 1]);
    expect(events[0]!.sessionNs).toBe(2e9);
    expect(hoverPointAt(path, 0.5)).toEqual({ time: 0.5, x: 0.25, y: 0.25, active: true });
    expect(hoverPointAt(path, 5)).toEqual({ time: 5, x: 1, y: 1, active: true });
  });
  it('resolves equal timestamps and preserves hide/drag boundaries', () => {
    const path = packHoverPath([
      move(0),
      move(1, 0.2, 0.3),
      { event: 'button', sessionNs: 1e9, button: 1, pressed: true, normalizedX: 0.2, normalizedY: 0.3 },
      move(1.1, 0.3, 0.4),
      { event: 'button', sessionNs: 1.2e9, button: 1, pressed: false, normalizedX: 0.3, normalizedY: 0.4 },
      { event: 'visibility', sessionNs: 1.3e9, visible: false },
      move(1.4, 0.4, 0.5, true),
    ]);
    expect(path.length).toBe(24);
    expect(hoverPointAt(path, 1.05)?.active).toBe(false);
    expect(hoverPointAt(path, 1.21)?.active).toBe(true);
    expect(hoverPointAt(path, 1.31)?.active).toBe(false);
    expect(hoverPointAt(path, 1.4)?.active).toBe(true);
  });
  it('handles missing positions, secondary buttons and malformed samples', () => {
    expect(packHoverPath([]).length).toBe(0);
    expect(packHoverPath([{ event: 'visibility', sessionNs: 0, visible: false }]).length).toBe(0);
    const path = packHoverPath([
      move(-1),
      move(NaN),
      move(0, -1),
      move(0, 0.5, 2),
      move(1),
      { event: 'button', sessionNs: 2e9, button: 2, pressed: true, normalizedX: 0.6, normalizedY: 0.6 },
    ]);
    expect(path.length).toBe(8);
    expect(hoverPointAt(path, 2)?.active).toBe(true);
    expect(hoverPointAt(path, NaN)).toBeNull();
    expect(hoverPointAt(path, 0)).toBeNull();
    expect(hoverPointAt(new Float64Array(), 0)).toBeNull();
  });
});
describe('bounded recording-clock sampling', () => {
  it('visits movement neighborhoods once, with source-local timestamps and no out-of-range requests', () => {
    const path = packHoverPath([move(4), move(4.2, 0.6), move(4.3, 0.7), move(9, 0.7), move(20, 0.9)]);
    const times = [...hoverTimestamps(path, 4, 1)];
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeCloseTo(0.45);
    expect(new Set(times).size).toBe(times.length);
    expect(times.every((time) => time >= 0 && time < 1)).toBe(true);
    expect([...hoverTimestamps(path, 10, 2)]).toEqual([]);
  });
  it('skips invisible/dragging and stationary paths', () => {
    expect([...hoverTimestamps(packHoverPath([move(0), move(100)]), 0, 100)]).toEqual([]);
    expect([...hoverTimestamps(packHoverPath([move(0, 0, 0, false), move(1, 1, 1, false)]), 0, 2)]).toEqual([]);
    expect([...hoverTimestamps(new Float64Array(), 0, 2)]).toEqual([]);
  });
  it('does not scan an hour of idle video for a single late pointer movement', () => {
    const path = packHoverPath([move(0), move(3599, 0.8)]);
    const times = [...hoverTimestamps(path, 0, 3600)];
    expect(times.length).toBeLessThan(48);
    expect(times[0]).toBeGreaterThan(3598);
    expect([...hoverTimestamps(path, 4000, 100)]).toEqual([]);
  });
  it('samples a short resumed segment from half a million telemetry points without duplicating timestamps', () => {
    const path = new Float64Array(500_000 * 4);
    for (let tick = 0; tick < 500_000; tick++) path.set([tick / 60, (tick % 100) / 100, (tick % 70) / 70, 1], tick * 4);
    const times = [...hoverTimestamps(path, 8000, 1)];
    expect(times).toHaveLength(60);
    expect(new Set(times).size).toBe(60);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(59 / 60);
  });
});
describe('worker input boundary', () => {
  const valid = () => ({
    sources: [{ id: 'x', src: 'https://localhost/a.mp4', startSeconds: 0, durationSeconds: 3 }],
    path: packHoverPath([move(0), move(1)]),
  });
  it('accepts valid compact data and empty sources', () => {
    expect(() => validateHoverInput(valid())).not.toThrow();
    expect(() => validateHoverInput({ sources: [], path: new Float64Array() })).not.toThrow();
  });
  it.each(
    [
      [0],
      [0, 0, 0, 2],
      [0, 0, 2, 1],
      [0, NaN, 0, 1],
      [-1, 0, 0, 1],
      [Number.MAX_VALUE, 0, 0, 1],
      [1, 0, 0, 1, 1, 0, 0, 1],
      [1, 0, 0, 1, 0, 0, 0, 1],
    ].map((path) => [path]),
  )('rejects a malformed packed path %j', (path) => {
    expect(() => validateHoverInput({ ...valid(), path: new Float64Array(path) })).toThrow();
  });
  it('rejects forbidden URLs and wrong array types before decoding', () => {
    expect(() => validateHoverInput({ ...valid(), path: [] as unknown as Float64Array })).toThrow();
    expect(() => validateHoverInput({ ...valid(), sources: null! })).toThrow();
    expect(() =>
      validateHoverInput({ ...valid(), sources: [{ ...valid().sources[0]!, src: 'file:///secret' }] }),
    ).toThrow();
  });
});
