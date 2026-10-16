import { describe, expect, it, vi } from 'vitest';
import type { ZoomElement } from '../zoom-types';
import { zoomAtTime } from '../zoom-playback';
import { cinematicZoomConnection } from '../cinematic-zoom-connection';
import { cinematicProgress, cinematicZoomDurationMs, cinematicZoomStrength } from '../zoom-transitions';
import { createCompositionCameraEvaluator } from '../composition-camera';

const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  sessionId: 'take',
  startMs,
  endMs,
  depth: 2,
  focus: { cx: 0.4, cy: 0.6 },
  mode: 'manual',
  transition: 'cinematic',
});
const identity = (focus: { cx: number; cy: number }) => focus;

describe('cinematic scale trajectory', () => {
  it.each([-10, 0, 1, 10])('clamps the complete envelope: %s', (progress) => {
    expect(cinematicProgress(progress)).toBe(progress <= 0 ? 0 : 1);
  });
  it('is monotonic, symmetric, bounded and has zero endpoint velocity and acceleration', () => {
    let previous = 0;
    for (let step = 0; step <= 1000; step++) {
      const t = step / 1000,
        value = cinematicProgress(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value + cinematicProgress(1 - t)).toBeCloseTo(1, 12);
      previous = value;
    }
    for (const boundary of [0, 1]) {
      const h = 0.00001,
        a = cinematicProgress(boundary - h),
        b = cinematicProgress(boundary),
        c = cinematicProgress(boundary + h);
      expect(Math.abs((c - a) / (2 * h))).toBeLessThan(1e-7);
      expect(Math.abs((a - 2 * b + c) / h ** 2)).toBeLessThan(0.002);
    }
  });
  it('has no velocity kink where zoom entry and exit meet their holds', () => {
    const z = zoom('one', 3000, 6000),
      ramp = cinematicZoomDurationMs(1.5);
    for (const boundary of [3000 - ramp, 3000, 6000, 6000 + ramp]) {
      const h = 0.1,
        a = cinematicZoomStrength(z, boundary - h),
        b = cinematicZoomStrength(z, boundary),
        c = cinematicZoomStrength(z, boundary + h);
      expect(Math.abs(c - b - (b - a))).toBeLessThan(1e-9);
    }
  });
});

describe('connected cinematic shots', () => {
  it('keeps consecutive short holds continuous when their pan windows meet', () => {
    const zooms = [
      zoom('a', 3000, 3200),
      { ...zoom('b', 3200, 3400), depth: 3 as const },
      { ...zoom('c', 3400, 3600), depth: 4 as const },
    ];
    for (const boundary of [3100, 3300, 3500]) {
      const left = zoomAtTime(zooms, boundary - 0.0001)!,
        right = zoomAtTime(zooms, boundary + 0.0001)!;
      expect(Math.abs(left.scale - right.scale)).toBeLessThan(1e-8);
    }
    expect(zoomAtTime(zooms, 3300)?.scale).toBe(1.8);
  });
  it.each([0, 50, 400, 800, 1350])('moves continuously through a %d ms gap without a zoom-out pulse', (gap) => {
    const a = zoom('one', 3000, 6000),
      b = { ...zoom('two', 6000 + gap, 10000), depth: 4 as const, focus: { cx: 0.7, cy: 0.4 } };
    const extension = Math.max(0, (1000 - gap) / 2),
      start = 6000 - extension,
      end = 6000 + gap + extension;
    let previous = 1.5;
    for (let step = 0; step <= 1000; step++) {
      const t = start + ((end - start) * step) / 1000,
        result = zoomAtTime([a, b], t)!;
      expect(result.scale).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(result.scale).toBeGreaterThanOrEqual(1.5);
      expect(result.scale).toBeLessThanOrEqual(2.2);
      previous = result.scale;
    }
    for (const boundary of [start, end]) {
      const left = zoomAtTime([a, b], boundary - 0.001)!,
        right = zoomAtTime([a, b], boundary + 0.001)!;
      expect(Math.abs(left.scale - right.scale)).toBeLessThan(1e-9);
      expect(Math.abs(left.focus.cx - right.focus.cx)).toBeLessThan(1e-9);
    }
  });
  it('holds identical scales through the entire handoff and blends perspective settings', () => {
    const a = { ...zoom('one', 3000, 6000), projection: 'orbit' as const, tiltIntensity: 0.6 },
      b = { ...zoom('two', 6800, 10000), projection: '3d' as const, tiltIntensity: 0.8, mode: 'auto' as const };
    for (let t = 5900; t <= 6900; t += 10) expect(zoomAtTime([a, b], t)?.scale).toBe(1.5);
    expect(zoomAtTime([a, b], 6400)).toMatchObject({
      cinematic: true,
      tracksCursor: false,
      mode: 'auto',
      orbit: 0.3,
      tilt: 0.4,
    });
  });
  it.each([{ gap: -1 }, { gap: 1351 }, { gap: 500, legacy: true }, { gap: 500, outside: true }])(
    'leaves unrelated or inactive pairs alone: %j',
    ({ gap, legacy, outside }) => {
      const a = zoom('one', 3000, 6000),
        b = zoom('two', 6000 + gap, 10000),
        mapper = vi.fn(identity);
      if (legacy) b.transition = undefined;
      expect(cinematicZoomConnection(a, b, outside ? 1000 : 6400, mapper)).toBeNull();
      expect(mapper).not.toHaveBeenCalled();
    },
  );
  it('rejects a zero-length handoff and maps each endpoint through its own screen geometry', () => {
    expect(cinematicZoomConnection(zoom('a', 6000, 6000), zoom('b', 6000, 6000), 6000, identity)).toBeNull();
    const mapper = vi.fn((focus: { cx: number; cy: number }) => ({ cx: focus.cx + 0.05, cy: focus.cy - 0.05 }));
    expect(cinematicZoomConnection(zoom('a', 3000, 6000), zoom('b', 6800, 10000), 6400, mapper)?.focus).toEqual({
      cx: 0.45,
      cy: 0.5499999999999999,
    });
    expect(mapper).toHaveBeenCalledTimes(2);
  });
});

describe('deterministic cinematic camera', () => {
  it.each([2400.123, 2700.517, 6423.001])(
    'evaluates cinematic magnification exactly between simulation ticks: %s',
    (time) => {
      const zooms = [zoom('a', 3000, 6000), { ...zoom('b', 6800, 10000), depth: 4 as const }];
      const expected = zoomAtTime(zooms, time)!;
      const camera = createCompositionCameraEvaluator({ zooms, telemetry: [] });
      expect(camera.sample(time).scale).toBe(expected.scale);
    },
  );
  it.each([
    ['manual', 'auto'],
    ['auto', 'manual'],
    ['auto', 'auto'],
  ] as const)('keeps orbit follow continuous across a %s-to-%s handoff', (from, to) => {
    const zooms: ZoomElement[] = [
      { ...zoom('a', 3000, 6000), projection: 'orbit', tiltIntensity: 0.6, mode: from },
      { ...zoom('b', 6800, 10000), projection: 'orbit', tiltIntensity: 1, mode: to },
    ];
    const camera = createCompositionCameraEvaluator({
      zooms,
      telemetry: [
        { timeMs: 0, cx: 0.9, cy: 0.1 },
        { timeMs: 15000, cx: 0.9, cy: 0.1 },
      ],
    });
    for (const boundary of [5900, 6900]) {
      const a = camera.sample(boundary - 0.001).orbit!,
        b = camera.sample(boundary + 0.001).orbit!;
      expect(Math.abs(a.azimuth - b.azimuth)).toBeLessThan(1e-8);
      expect(Math.abs(a.elevation - b.elevation)).toBeLessThan(1e-8);
      expect(Math.abs(a.distance - b.distance)).toBeLessThan(1e-8);
    }
  });
  it.each([24, 30, 60, 120, 144, 240])('matches direct and reverse seeking at %d fps', (fps) => {
    const inputs = { zooms: [zoom('a', 3000, 6000), { ...zoom('b', 6800, 10000), depth: 4 as const }], telemetry: [] };
    const sequential = createCompositionCameraEvaluator(inputs),
      direct = createCompositionCameraEvaluator(inputs);
    for (let frame = 0; frame < fps * 11; frame++) sequential.sample((frame * 1000) / fps);
    for (const time of [7000.5, 5899, 10100, 2999, 6400, 0])
      expect(sequential.sample(time)).toEqual(direct.sample(time));
  });
  it.each(['manual', 'auto'] as const)('pre-aims an incoming %s shot and keeps the viewport contained', (mode) => {
    const z = { ...zoom('a', 3000, 6000), depth: 5 as const, focus: { cx: 0.8, cy: 0.2 }, mode };
    const camera = createCompositionCameraEvaluator({ zooms: [z], telemetry: [] });
    for (let t = 0; t <= 8000; t += 10) {
      const sample = camera.sample(t),
        half = 1 / (2 * sample.scale);
      expect(sample.focus.cx - half).toBeGreaterThanOrEqual(-1e-12);
      expect(sample.focus.cy + half).toBeLessThanOrEqual(1 + 1e-12);
      if (sample.scale > 2 && t <= 3000) {
        expect(sample.focus.cx).toBeCloseTo(Math.min(0.8, 1 - half), 6);
        expect(sample.focus.cy).toBeCloseTo(Math.max(0.2, half), 6);
      }
    }
  });
});
