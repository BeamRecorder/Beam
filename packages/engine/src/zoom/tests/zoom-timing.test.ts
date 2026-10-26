import { describe, expect, it } from 'vitest';
import type { ZoomElement } from '../zoom-types';
import { boundedZoomStrength, createZoomTiming, zoomHoldWindow } from '../zoom-timing';
import { validateZoomElement, validateZoomTiming } from '../zoom-schema';
import { boundGeneratedZooms } from '../zoom-generated-timing';

const zoom = (startMs = 6000, endMs = 8000): ZoomElement => ({
  id: `${startMs}`,
  sessionId: 'take',
  startMs,
  endMs,
  depth: 2,
  mode: 'manual',
  focus: { cx: 0.7, cy: 0.4 },
  transition: 'cinematic',
  timing: createZoomTiming(2),
});

describe('visible zoom timing', () => {
  it('has smooth entry, hold and exit entirely inside the declared interval', () => {
    const z = zoom(),
      hold = zoomHoldWindow(z);
    for (const time of [0, 5999.99, 6000, 8000, 8000.01, 10000]) expect(boundedZoomStrength(z, time)).toBe(0);
    expect(boundedZoomStrength(z, hold.startMs)).toBe(1);
    expect(boundedZoomStrength(z, hold.endMs)).toBe(1);
    expect(boundedZoomStrength(z, 7000)).toBe(1);
    expect(boundedZoomStrength(z, (z.startMs + hold.startMs) / 2)).toBeCloseTo(0.5, 12);
    expect(boundedZoomStrength(z, (z.endMs + hold.endMs) / 2)).toBeCloseTo(0.5, 12);
  });

  it.each([1, 200, 1200, 2000, 3000])('fits both ramps into a %d ms block', (duration) => {
    const z = zoom(6003, 6003 + duration),
      hold = zoomHoldWindow(z);
    expect(hold.startMs).toBeGreaterThanOrEqual(z.startMs);
    expect(hold.endMs).toBeLessThanOrEqual(z.endMs);
    expect(hold.startMs).toBeLessThanOrEqual(hold.endMs + 1e-9);
    expect(boundedZoomStrength(z, (z.startMs + z.endMs) / 2)).toBeCloseTo(1, 12);
    for (let index = 0; index <= 100; index++) {
      const strength = boundedZoomStrength(z, z.startMs + (duration * index) / 100);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });

  it('supports explicit cuts with zero-duration ramps without dividing by zero', () => {
    const z = { ...zoom(), timing: { version: 1 as const, entryMs: 0, exitMs: 0 } };
    expect(boundedZoomStrength(z, 6000)).toBe(0);
    expect(boundedZoomStrength(z, 6000.001)).toBe(1);
    expect(boundedZoomStrength(z, 7999.999)).toBe(1);
    expect(boundedZoomStrength(z, 8000)).toBe(0);
  });

  it('retains the authored hold boundaries when legacy timing is absent', () => {
    const z = zoom();
    delete z.timing;
    expect(zoomHoldWindow(z)).toEqual({ startMs: 6000, endMs: 8000 });
    expect(() => validateZoomElement(z)).not.toThrow();
    expect(() => validateZoomTiming(undefined)).not.toThrow();
  });

  it('validates finite, nonnegative, versioned transition durations', () => {
    for (const timing of [
      null,
      {},
      { version: 2, entryMs: 0, exitMs: 0 },
      { version: 1, entryMs: -1, exitMs: 0 },
      { version: 1, entryMs: 0, exitMs: -1 },
      { version: 1, entryMs: NaN, exitMs: 1 },
      { version: 1, entryMs: 0, exitMs: Infinity },
      { version: 1, entryMs: Number.MAX_VALUE, exitMs: Number.MAX_VALUE },
    ]) {
      expect(() => validateZoomTiming(timing)).toThrow('Invalid zoom timing');
      expect(() => validateZoomElement({ ...zoom(), timing })).toThrow('Invalid zoom timing');
    }
    expect(() => validateZoomTiming(createZoomTiming(6))).not.toThrow();
  });
});

describe('generated markers include anticipation', () => {
  it('exposes the whole entry and exit while retaining the planner’s action hold', () => {
    const hold = zoom();
    delete hold.timing;
    const [z] = boundGeneratedZooms([hold], 15000);
    expect(z!.startMs).toBeLessThan(hold.startMs);
    expect(z!.endMs).toBeGreaterThan(hold.endMs);
    expect(zoomHoldWindow(z!)).toEqual({ startMs: hold.startMs, endMs: hold.endMs });
    expect(hold).not.toHaveProperty('timing');
  });

  it('shares overlapping ramp space without overlapping timeline markers', () => {
    const holds = [zoom(6000, 7000), zoom(7100, 8100), zoom(8200, 9200)];
    const generated = boundGeneratedZooms(holds, 15000);
    expect(generated[0]!.endMs).toBe(generated[1]!.startMs);
    expect(generated[1]!.endMs).toBe(generated[2]!.startMs);
    generated.forEach((z, index) =>
      expect(zoomHoldWindow(z)).toEqual({ startMs: holds[index]!.startMs, endMs: holds[index]!.endMs }),
    );
  });

  it('preserves empty plans, genuine wide gaps and the recording limits', () => {
    expect(boundGeneratedZooms([], 15000)).toEqual([]);
    const generated = boundGeneratedZooms([zoom(100, 1100), zoom(9000, 9900)], 10000);
    expect(generated[0]!.startMs).toBe(0);
    expect(generated[1]!.endMs).toBe(10000);
    expect(generated[0]!.endMs).toBeLessThan(generated[1]!.startMs);
    generated.forEach((z) => expect(() => validateZoomElement(z)).not.toThrow());
  });
});
