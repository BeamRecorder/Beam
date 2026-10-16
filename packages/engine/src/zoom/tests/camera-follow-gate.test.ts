import { describe, expect, it, vi } from 'vitest';
import { createAutomaticFollowGate } from '../camera-follow-gate';
import { cinematicZoomDurationMs } from '../zoom-transitions';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import type { ZoomElement } from '../zoom-types';

const zoom: ZoomElement = {
  id: 'auto',
  sessionId: 'take',
  startMs: 4500,
  endMs: 5500,
  depth: 3,
  mode: 'auto',
  generation: 'automatic',
  transition: 'cinematic',
  focus: { cx: 0.8, cy: 0.5 },
};
const press = (
  timeMs: number,
  interactionType: CursorTelemetryPoint['interactionType'] = 'click',
): CursorTelemetryPoint => ({ timeMs, cx: 0.8, cy: 0.5, interactionType });

describe('generated follow activation', () => {
  it.each(['click', 'double-click', 'right-click', 'middle-click'] as const)(
    'waits for the first visible %s including its exact timestamp',
    (kind) => {
      const telemetry = [press(5000, kind)];
      const allowed = createAutomaticFollowGate({ zooms: [zoom], telemetry }, telemetry);
      expect(allowed(zoom.id, 4999.9)).toBe(false);
      expect(allowed(zoom.id, 5000)).toBe(true);
      expect(allowed(zoom.id, 5500)).toBe(true);
    },
  );

  it.each([0, 25, 100])('includes a press during the rounded opening ramp at %d ms', (timeMs) => {
    const telemetry = [press(timeMs), press(3000, 'mouseup')];
    const opening = { ...zoom, startMs: Math.ceil(cinematicZoomDurationMs(1.8)), endMs: 3500 };
    const allowed = createAutomaticFollowGate({ zooms: [opening], telemetry }, telemetry);
    expect(allowed(opening.id, timeMs - 0.01)).toBe(false);
    expect(allowed(opening.id, timeMs)).toBe(true);
    expect(allowed(opening.id, 1000)).toBe(true);
  });

  it('does not reuse a previous shot press when entry ramps overlap', () => {
    const next = { ...zoom, id: 'next', startMs: 5500, endMs: 7000 };
    const telemetry = [press(5000), press(6000)];
    const allowed = createAutomaticFollowGate({ zooms: [next, zoom], telemetry }, telemetry);
    expect(allowed(next.id, 5500)).toBe(false);
    expect(allowed(next.id, 5999)).toBe(false);
    expect(allowed(next.id, 6000)).toBe(true);
  });

  it('uses mapped source clocks for trimmed, resumed and retimed clips without remapping during sampling', () => {
    const telemetry = [press(20000), press(21000, 'mouseup')];
    const mapTelemetryTime = vi.fn((time: number) => time * 2 + 10000);
    const allowed = createAutomaticFollowGate({ zooms: [zoom], telemetry, mapTelemetryTime }, telemetry);
    expect(mapTelemetryTime).toHaveBeenCalledTimes(2);
    for (let time = 19000; time <= 22000; time++) expect(allowed(zoom.id, time)).toBe(time >= 20000);
    expect(mapTelemetryTime).toHaveBeenCalledTimes(2);
  });

  it('finds an early action in a later clip instead of applying the source timestamp as timeline time', () => {
    const telemetry = [press(12100), press(14000, 'mouseup')];
    const shifted = { ...zoom, startMs: 5000 + Math.ceil(cinematicZoomDurationMs(1.8)), endMs: 9000 };
    const mapTelemetryTime = (time: number) => 12000 + (time - 5000) * 0.5;
    const allowed = createAutomaticFollowGate({ zooms: [shifted], telemetry, mapTelemetryTime }, telemetry);
    expect(allowed(zoom.id, 12099)).toBe(false);
    expect(allowed(zoom.id, 12100)).toBe(true);
  });

  it.each([{ mode: 'manual' as const }, { generation: undefined }, { enabled: false }, { effect: 'glass' as const }])(
    'preserves explicitly authored or inactive camera behavior: %j',
    (override) => {
      const telemetry = [press(5000)];
      const allowed = createAutomaticFollowGate({ zooms: [{ ...zoom, ...override }], telemetry }, telemetry);
      expect(allowed(zoom.id, 4000)).toBe(true);
      expect(allowed(undefined, 4000)).toBe(true);
      expect(allowed('unknown', 4000)).toBe(true);
    },
  );

  it.each([
    { telemetry: [] },
    { telemetry: [press(5000, 'move'), press(5100, 'mouseup')] },
    { telemetry: [{ ...press(5000), visible: false }] },
    { telemetry: [press(8000)] },
  ])('does not infer an action from missing or excluded presses: %j', ({ telemetry }) => {
    const before = structuredClone([zoom, telemetry]);
    const allowed = createAutomaticFollowGate({ zooms: [zoom], telemetry }, telemetry);
    expect(allowed(zoom.id, 4000)).toBe(true);
    expect([zoom, telemetry]).toEqual(before);
  });
});

it('supports previously generated spring-timed regions without treating motion as a press', () => {
  const telemetry = [{ timeMs: 4000, cx: 0.8, cy: 0.5 }, press(5000)];
  const legacy = { ...zoom, transition: undefined };
  const allowed = createAutomaticFollowGate({ zooms: [legacy], telemetry }, telemetry);
  expect(allowed(zoom.id, 4999)).toBe(false);
  expect(allowed(zoom.id, 5000)).toBe(true);
});
