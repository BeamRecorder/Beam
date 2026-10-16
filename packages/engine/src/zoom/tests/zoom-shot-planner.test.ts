import { describe, expect, it } from 'vitest';
import { buildAutomaticZoomElements } from '../zoom-suggestions';
import { cinematicZoomDurationMs, cinematicZoomStrength } from '../zoom-transitions';
import { createCompositionCameraEvaluator } from '../composition-camera';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import type { ZoomElement } from '../zoom-types';

const click = (timeMs = 5000, cx = 0.4, cy = 0.6): CursorTelemetryPoint => ({
  timeMs,
  cx,
  cy,
  visible: true,
  interactionType: 'click',
});
const plan = (telemetry: CursorTelemetryPoint[], reserved: ZoomElement[] = []) =>
  buildAutomaticZoomElements({ telemetry, reserved, sessionId: 'take', durationMs: 30000 });
const manual = (startMs = 18000, endMs = 21000): ZoomElement => ({
  id: 'manual',
  sessionId: 'take',
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

describe('action shot planning', () => {
  it('frames a click before the action and holds its result', () => {
    const [zoom] = plan([click()]);
    expect(zoom).toMatchObject({
      startMs: 4500,
      endMs: 5500,
      depth: 3,
      transition: 'cinematic',
      generation: 'automatic',
    });
    const camera = createCompositionCameraEvaluator({ zooms: [zoom!], telemetry: [click()] });
    expect(camera.sample(5000).scale).toBeCloseTo(1.8, 10);
    expect(camera.sample(0).scale).toBe(1);
    expect(camera.sample(29000).scale).toBeCloseTo(1, 10);
  });
  it('frames the bounding box of nearby actions, instead of choosing one arbitrary click', () => {
    expect(plan([click(5000, 0.3, 0.4), click(6000, 0.5, 0.6)])[0]).toMatchObject({
      focus: { cx: 0.4, cy: 0.5 },
      depth: 3,
      endMs: 6500,
    });
  });
  it('keeps distant intentions magnified instead of combining them into a shallow zoom', () => {
    const zooms = plan([click(5000, 0.25, 0.5), click(6000, 0.75, 0.5)]);
    expect(zooms).toHaveLength(2);
    expect(zooms.every((zoom) => zoom.depth === 3)).toBe(true);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    for (let time = 5000; time <= 6500; time += 10) expect(camera.sample(time).scale).toBe(1.8);
  });
  it('does not frame opposing corners as one target or introduce an unreadable wide flash', () => {
    const zooms = plan([click(5000, 0.1, 0.1), click(6500, 0.9, 0.9)]);
    expect(zooms).toHaveLength(2);
    expect(zooms.map((zoom) => zoom.focus)).toEqual([
      { cx: 0.1, cy: 0.1 },
      { cx: 0.9, cy: 0.9 },
    ]);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    for (let time = 5000; time <= 6500; time += 10) expect(camera.sample(time).scale).toBe(1.8);
  });
  it('starts wide without discarding opening clicks and ignores the Stop click', () => {
    const zooms = plan([click(100), click(5000), click(29900)]);
    expect(zooms).toHaveLength(2);
    expect(zooms.some((zoom) => zoom.id.endsWith(':29900'))).toBe(false);
    expect(zooms[0]!.id).toBe('auto:take:100');
    expect(zooms[0]!.startMs - cinematicZoomDurationMs(1.8)).toBeGreaterThanOrEqual(0);
    expect(zooms[0]!.endMs + cinematicZoomDurationMs(1.8)).toBeLessThanOrEqual(29000);
  });
  it.each([
    { points: [] },
    { points: [{ ...click(), interactionType: 'move' as const }] },
    { points: [{ ...click(), visible: false }] },
  ])('ignores an absence of visible actions: %j', ({ points }) => {
    expect(plan(points)).toEqual([]);
  });
  it('keeps visible presses during hidden-pointer drags without using hidden positions', () => {
    const hidden = { timeMs: 5033, cx: 0.5, cy: 0.5, visible: false, interactionType: 'move' as const };
    const released = { ...hidden, timeMs: 5200, interactionType: 'mouseup' as const };
    expect(plan([click(), hidden, released])[0]).toMatchObject({
      endMs: 5700,
      focus: { cx: 0.4, cy: 0.6 },
    });
    expect(plan([click(), { ...released, timeMs: 5020, visible: true }, hidden])).toHaveLength(1);
  });
  it('does not alter or crowd an authored zoom, including its ramps', () => {
    const fixed = manual(4000, 7000),
      before = JSON.stringify(fixed);
    expect(plan([click()], [fixed])).toEqual([]);
    expect(JSON.stringify(fixed)).toBe(before);
    expect(plan([click()], [manual()])).toHaveLength(1);
  });
  it('keeps independent actions separate even when their ramp envelopes are nearby', () => {
    const zooms = plan([click(5000), click(9000, 0.45, 0.6)]);
    expect(zooms).toHaveLength(2);
    expect(zooms[0]?.endMs).toBe(5500);
    expect(zooms[1]?.startMs).toBe(8500);
  });
  it('keeps separated opposing targets as independent shots with a real wide interval', () => {
    const zooms = plan([click(5000, 0.1, 0.1), click(14000, 0.9, 0.9)]);
    expect(zooms).toHaveLength(2);
    expect(zooms[1]!.startMs - zooms[0]!.endMs - 2 * cinematicZoomDurationMs(1.8)).toBeGreaterThanOrEqual(1500);
  });
  it('normalizes shuffled and nonfinite telemetry without mutating it', () => {
    const points = [click(6000), click(), { ...click(), timeMs: NaN }];
    const before = points.slice();
    expect(plan(points)).toHaveLength(1);
    expect(points).toEqual(before);
  });
  it.each([0, -1, NaN, Infinity, 3000])('leaves unusable or too short recordings wide: %s', (durationMs) => {
    expect(buildAutomaticZoomElements({ telemetry: [click()], sessionId: 'take', durationMs })).toEqual([]);
  });
});

describe('cinematic transition clock', () => {
  it('increases transition time with perceptual zoom distance', () => {
    expect(cinematicZoomDurationMs(5)).toBeGreaterThan(cinematicZoomDurationMs(1.25));
    expect(cinematicZoomDurationMs(1)).toBe(600);
  });
  it('arrives exactly at the hold boundaries and ends outside its exposure', () => {
    const zoom = { ...manual(5000, 9000), transition: 'cinematic' as const };
    expect(cinematicZoomStrength(zoom, 5000)).toBe(1);
    expect(cinematicZoomStrength(zoom, 9000)).toBe(1);
    expect(cinematicZoomStrength(zoom, 1000)).toBe(0);
    expect(cinematicZoomStrength(zoom, 12000)).toBe(0);
    expect(cinematicZoomStrength(zoom, 4600)).toBeGreaterThan(0);
    expect(cinematicZoomStrength(zoom, 9400)).toBeGreaterThan(0);
  });
});
