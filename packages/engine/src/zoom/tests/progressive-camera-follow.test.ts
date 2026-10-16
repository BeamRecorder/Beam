import { describe, expect, it } from 'vitest';
import {
  createAutoFollowState,
  progressiveFollowAxis,
  progressiveFollowFocus,
  updateAutoFollowTarget,
} from '../auto-follow-camera';
import { createCompositionCameraEvaluator } from '../composition-camera';
import type { CursorTelemetryPoint } from '../../capture/capture-session';
import type { ZoomElement } from '../zoom-types';

const center = { cx: 0.5, cy: 0.5 };
const settings = { safeZone: 0.5, responsiveness: 0.55, directionLock: true };
const zoom: ZoomElement = {
  id: 'follow',
  sessionId: 'take',
  startMs: 1000,
  endMs: 6000,
  focus: center,
  depth: 3,
  mode: 'auto',
  transition: 'cinematic',
};

describe('progressive camera follow', () => {
  it.each(['cx', 'cy'] as const)('starts following %s before the old safe-zone edge without a target jump', (axis) => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 2, 1, 0);
    let previous = 0.5;
    let largestStep = 0;
    let beforeBoundary = 0.5;
    for (let step = 1; step <= 240; step++) {
      const cursor = { ...center, [axis]: 0.5 + step * 0.001 };
      const target = updateAutoFollowTarget(state, cursor, center, 2, 1, (step * 1000) / 120)[axis];
      largestStep = Math.max(largestStep, Math.abs(target - previous));
      if (step === 100) beforeBoundary = target;
      expect(target).toBeGreaterThanOrEqual(previous);
      previous = target;
    }
    expect(beforeBoundary).toBeGreaterThan(0.51);
    expect(largestStep).toBeLessThan(0.0011);
  });

  it('allows a new axis during an ongoing pan instead of continually extending a direction lock', () => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 2, 1, 0);
    for (let step = 1; step <= 60; step++)
      updateAutoFollowTarget(state, { cx: 0.5 + step * 0.003, cy: 0.5 }, center, 2, 1, (step * 1000) / 120);
    const before = state.target.cy;
    for (let step = 61; step <= 90; step++)
      updateAutoFollowTarget(
        state,
        { cx: 0.68 + (step - 60) * 0.001, cy: 0.5 + (step - 60) * 0.004 },
        center,
        2,
        1,
        (step * 1000) / 120,
      );
    expect(state.target.cy).toBeGreaterThan(before + 0.01);
  });

  it.each([24, 60, 144])('follows a steady drag with bounded lag and no catch-up burst at %d fps', (fps) => {
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, ...center },
      { timeMs: 2000, ...center },
      { timeMs: 4000, cx: 0.85, cy: 0.5 },
      { timeMs: 7000, cx: 0.85, cy: 0.5 },
    ];
    const camera = createCompositionCameraEvaluator({ zooms: [zoom], telemetry, autoFollow: settings });
    let previous = camera.sample(1900).focus.cx;
    let fastest = 0;
    for (let frame = 0; frame <= fps * 2.6; frame++) {
      const time = 1900 + (frame * 1000) / fps;
      const focus = camera.sample(time).focus.cx;
      fastest = Math.max(fastest, (focus - previous) * fps);
      expect(focus).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = focus;
    }
    expect(camera.sample(2500).focus.cx).toBeGreaterThan(0.505);
    expect(camera.sample(3500).focus.cx).toBeGreaterThan(0.64);
    expect(fastest).toBeLessThan(0.21);
  });

  it('keeps acquired framing still through a long pause and later micro-movements', () => {
    const state = createAutoFollowState(settings);
    for (let time = 0; time <= 2000; time += 10)
      updateAutoFollowTarget(state, { cx: 0.8, cy: 0.7 }, center, 2, 1, time);
    const acquired = { ...state.target };
    for (let time = 2010; time <= 20000; time += 10) {
      const jitter = 0.005 * Math.sin(time / 13);
      const target = updateAutoFollowTarget(state, { cx: 0.8 + jitter, cy: 0.7 - jitter }, center, 2, 1, time);
      expect(target.cx).toBeCloseTo(acquired.cx, 10);
      expect(target.cy).toBeCloseTo(acquired.cy, 10);
    }
  });

  it('does not mistake slow continuous travel for a pause', () => {
    const state = createAutoFollowState(settings);
    for (let step = 0; step <= 2000; step++)
      updateAutoFollowTarget(state, { cx: 0.5 + step * 0.00005, cy: 0.5 }, center, 2, 1, step * 10);
    expect(state.target.cx).toBeGreaterThan(0.52);
    expect(state.settled).toBe(false);
  });

  it('damps a reversal without a frozen interval or a jump when the lock expires', () => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 2, 1, 0);
    updateAutoFollowTarget(state, { cx: 0.7, cy: 0.5 }, center, 2, 1, 100);
    const initialLock = state.lockUntilMs;
    updateAutoFollowTarget(state, { cx: 0.71, cy: 0.5 }, center, 2, 1, 110);
    expect(state.lockUntilMs).toBe(initialLock);
    let previous = state.target.cx;
    for (let time = 120; time <= 700; time += 5) {
      const target = updateAutoFollowTarget(state, { cx: 0.5, cy: 0.5 }, center, 2, 1, time).cx;
      expect(target).toBeLessThan(previous);
      expect(previous - target).toBeLessThan(0.015);
      previous = target;
    }
  });

  it.each([false, true])(
    'keeps camera velocity continuous across an abrupt native cursor jump (lock=%s)',
    (directionLock) => {
      const telemetry = [
        { timeMs: 0, ...center },
        { timeMs: 2999.99, ...center },
        { timeMs: 3000, cx: 0.9, cy: 0.1 },
        { timeMs: 7000, cx: 0.9, cy: 0.1 },
      ];
      const camera = createCompositionCameraEvaluator({
        zooms: [zoom],
        telemetry,
        autoFollow: { ...settings, directionLock },
      });
      let previous = camera.sample(2700).focus;
      let previousSpeed = 0;
      for (let time = 2701; time <= 4000; time++) {
        const current = camera.sample(time).focus;
        const speed = (current.cx - previous.cx) * 1000;
        expect(Math.abs(current.cx - previous.cx)).toBeLessThan(0.002);
        expect(Math.abs(speed - previousSpeed)).toBeLessThan(0.07);
        expect(current.cx).toBeGreaterThanOrEqual(previous.cx - 1e-12);
        expect(current.cy).toBeLessThanOrEqual(previous.cy + 1e-12);
        previous = current;
        previousSpeed = speed;
      }
    },
  );
});

describe('spatial follow shoulder', () => {
  it.each([1, -1])('is monotonic, bounded and symmetric in direction %s', (direction) => {
    let previous = 0.5;
    for (let step = 0; step <= 1000; step++) {
      const cursor = 0.5 + direction * step * 0.0004;
      const next = progressiveFollowAxis(cursor, 0.5, 0.125);
      expect((next - previous) * direction).toBeGreaterThanOrEqual(-1e-12);
      expect(Math.abs(next - previous)).toBeLessThanOrEqual(0.0004 + 1e-12);
      expect(Math.abs(next - 0.5)).toBeLessThanOrEqual(Math.abs(cursor - 0.5));
      previous = next;
    }
  });
  it.each([0.03125, 0.125])('joins position, slope and curvature continuously at distance %s', (boundary) => {
    const h = 0.000001;
    const at = (offset: number) => progressiveFollowAxis(0.5 + boundary + offset, 0.5, 0.125);
    const slopeLeft = (at(0) - at(-h)) / h;
    const slopeRight = (at(h) - at(0)) / h;
    const curvatureLeft = (at(0) - 2 * at(-h) + at(-2 * h)) / h ** 2;
    const curvatureRight = (at(2 * h) - 2 * at(h) + at(0)) / h ** 2;
    expect(at(h) - at(-h)).toBeLessThanOrEqual(2 * h + 1e-12);
    expect(Math.abs(slopeRight - slopeLeft)).toBeLessThan(0.000001);
    expect(Math.abs(curvatureRight - curvatureLeft)).toBeLessThan(0.003);
  });
  it('respects a rebased cursor anchor independently of the acquired camera framing', () => {
    expect(progressiveFollowFocus({ cx: 0.8, cy: 0.7 }, { cx: 0.8, cy: 0.7 }, { cx: 0.65, cy: 0.6 }, 2, 0.5)).toEqual({
      cx: expect.closeTo(0.65, 12),
      cy: expect.closeTo(0.6, 12),
    });
  });
  it('clamps far movements to the visible canvas', () => {
    expect(progressiveFollowFocus({ cx: 1, cy: 0 }, center, center, 2, 0.5)).toEqual({ cx: 0.75, cy: 0.25 });
  });
  it('keeps the identity viewport centered', () => {
    expect(progressiveFollowFocus({ cx: 1, cy: 0 }, center, center, 1, 0.5)).toEqual(center);
  });
});
