import { describe, expect, it } from 'vitest';
import { createAutoFollowState, updateAutoFollowTarget } from '../auto-follow-camera';
import { createCompositionCameraEvaluator } from '../composition-camera';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import type { ZoomElement, ZoomFocus } from '../zoom-types';

const center: ZoomFocus = { cx: 0.5, cy: 0.5 };
const settings = { safeZone: 0.5, responsiveness: 0.55, directionLock: true };
const point = (axis: 'cx' | 'cy', value: number): ZoomFocus => ({ ...center, [axis]: value });

describe('auto-follow motion regressions', () => {
  it.each([
    ['cx', 1],
    ['cx', -1],
    ['cy', 1],
    ['cy', -1],
  ] as const)('progressively follows %s in direction %d through the safe-zone boundary', (axis, direction) => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 3.5, 1, 0);
    const cursor = point(axis, 0.5 + direction * 0.08);
    const target = updateAutoFollowTarget(state, cursor, center, 3.5, 1, 100);

    expect((target[axis] - 0.5) * direction).toBeGreaterThan(0);
    expect(Math.abs(target[axis] - 0.5)).toBeLessThan(Math.abs(cursor[axis] - 0.5));
    expect(target[axis === 'cx' ? 'cy' : 'cx']).toBe(0.5);
    const continued = updateAutoFollowTarget(state, point(axis, cursor[axis] + direction * 0.01), center, 3.5, 1, 110);
    expect((continued[axis] - target[axis]) * direction).toBeGreaterThan(0);
    expect(Math.abs(continued[axis] - target[axis])).toBeLessThan(0.01);
  });

  it.each([
    ['cx', 1],
    ['cx', -1],
    ['cy', 1],
  ] as const)('allows continued %s travel in direction %d through a lock', (axis, direction) => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 3.5, 1, 0);
    const first = updateAutoFollowTarget(state, point(axis, 0.5 + direction * 0.08), center, 3.5, 1, 100);
    // This movement exceeds the new safe zone but remains within the viewport,
    // so a direction lock must not stall movement that preserves its direction.
    const continued = updateAutoFollowTarget(state, point(axis, 0.5 + direction * 0.16), center, 3.5, 1, 150);
    expect((continued[axis] - first[axis]) * direction).toBeGreaterThan(0);
  });
});

describe('camera cadence and seek invariance with real follow state', () => {
  const zooms: ZoomElement[] = [
    {
      id: 'auto-follow',
      sessionId: 'take',
      startMs: 3000,
      endMs: 11000,
      focus: { cx: 0.3, cy: 0.6 },
      depth: 5,
      mode: 'auto',
      transition: 'cinematic',
    },
  ];
  const telemetry: CursorTelemetryPoint[] = [
    { timeMs: 0, cx: 0.3, cy: 0.6 },
    { timeMs: 4000, cx: 0.3, cy: 0.6 },
    { timeMs: 5700, cx: 0.8, cy: 0.2 },
    { timeMs: 5800, cx: 0.79, cy: 0.21 },
    { timeMs: 5900, cx: 0.8, cy: 0.2 },
    { timeMs: 6500, cx: 0.2, cy: 0.8 },
    { timeMs: 7000, cx: 0.8, cy: 0.2, visible: false },
    { timeMs: 7400, cx: 0.7, cy: 0.3, visible: true },
    { timeMs: 12000, cx: 0.7, cy: 0.3 },
  ];

  it.each([24, 60, 144])('retains the same path after changing cadence and reversing seeks at %d fps', (fps) => {
    const inputs = { zooms, telemetry };
    const played = createCompositionCameraEvaluator(inputs);
    const sought = createCompositionCameraEvaluator(inputs);
    for (let frame = 0; frame < fps * 9; frame++) {
      // Alternate ordinary presentation and dropped frames around reversals.
      if (frame % 11 !== 0) played.sample((frame * 1000) / fps);
    }
    for (const time of [8100.12, 5699.7, 12000, 3257.1, 6499.8, 7000.5, 4000, 0]) {
      expect(played.sample(time)).toEqual(sought.sample(time));
    }
  });
});

describe('connected camera checkpoint invariance', () => {
  it.each([24, 60, 144])('keeps three acquired handoffs identical after seeks and retained edits at %d fps', (fps) => {
    const zooms: ZoomElement[] = [
      {
        id: 'a',
        sessionId: 'take',
        startMs: 3000,
        endMs: 6000,
        depth: 5,
        focus: { cx: 0.3, cy: 0.5 },
        mode: 'auto',
        transition: 'cinematic',
      },
      {
        id: 'b',
        sessionId: 'take',
        startMs: 6800,
        endMs: 7600,
        depth: 4,
        focus: { cx: 0.8, cy: 0.4 },
        mode: 'auto',
        transition: 'cinematic',
      },
      {
        id: 'c',
        sessionId: 'take',
        startMs: 8000,
        endMs: 10000,
        depth: 5,
        focus: { cx: 0.2, cy: 0.8 },
        mode: 'manual',
        transition: 'cinematic',
      },
    ];
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.75, cy: 0.2 },
      { timeMs: 6000, cx: 0.75, cy: 0.2 },
      { timeMs: 7000, cx: 0.7, cy: 0.3 },
      { timeMs: 7500, cx: 0.9, cy: 0.9, visible: false },
      { timeMs: 9000, cx: 0.1, cy: 0.8, visible: true },
    ];
    const inputs = { zooms, telemetry };
    const previous = createCompositionCameraEvaluator(inputs);
    for (let frame = 0; frame < fps * 11; frame++) if (frame % 13) previous.sample((frame * 1000) / fps);
    const retained = createCompositionCameraEvaluator(inputs, { previous, unchangedBeforeMs: Infinity });
    const cold = createCompositionCameraEvaluator(inputs);
    for (const time of [10000.1, 6900.5, 6300, 8000.1, 7599.9, 5800, 0, 3100]) {
      expect(previous.sample(time)).toEqual(cold.sample(time));
      expect(retained.sample(time)).toEqual(cold.sample(time));
    }
    retained.invalidate();
    expect(retained.sample(6900.5)).toEqual(cold.sample(6900.5));
  });
});
