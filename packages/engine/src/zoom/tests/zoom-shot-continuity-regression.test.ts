import { describe, expect, it } from 'vitest';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { buildAutomaticZoomElements } from '../zoom-suggestions';
import { cinematicZoomDurationMs } from '../zoom-transitions';
import { ZOOM_DEPTH_SCALES } from '../zoom-types';
import type { ZoomElement } from '../zoom-types';
import type { CursorTelemetryPoint } from '../../capture/capture-session';

const click = (timeMs: number, cx: number, cy = 0.5): CursorTelemetryPoint => ({
  timeMs,
  cx,
  cy,
  interactionType: 'click',
});
const plan = (telemetry: CursorTelemetryPoint[], durationMs = 40000) =>
  buildAutomaticZoomElements({ telemetry, durationMs, sessionId: 'take' });

describe('connected auto-shot continuity after following the cursor', () => {
  it.each([
    ['cx', 1],
    ['cx', -1],
    ['cy', 1],
    ['cy', -1],
  ] as const)('does not return to the old saved %s focus before panning in direction %d', (axis, direction) => {
    const focus = (value: number) => ({ cx: 0.5, cy: 0.5, [axis]: value });
    const startFocus = 0.5 - direction * 0.2;
    const nextFocus = 0.5 + direction * 0.3;
    const cursor = focus(0.5 + direction * 0.25);
    const zooms: ZoomElement[] = [
      {
        id: 'outgoing',
        sessionId: 'take',
        startMs: 3000,
        endMs: 6000,
        focus: focus(startFocus),
        depth: 5,
        mode: 'auto',
        transition: 'cinematic',
      },
      {
        id: 'incoming',
        sessionId: 'take',
        startMs: 6800,
        endMs: 10000,
        focus: focus(nextFocus),
        depth: 5,
        mode: 'auto',
        transition: 'cinematic',
      },
    ];
    const camera = createCompositionCameraEvaluator({
      zooms,
      telemetry: [
        { timeMs: 0, ...cursor },
        { timeMs: 15000, ...cursor },
      ],
    });
    const acquired = camera.sample(5800).focus[axis];
    expect((acquired - startFocus) * direction).toBeGreaterThan(0);
    // The acquired focus, stationary cursor and incoming focus all lie on the
    // same side of the obsolete saved focus. Returning there is a false pan.
    for (const time of [5900, 6000, 6100, 6200, 6400, 6600, 6800, 6900, 7100]) {
      expect((camera.sample(time).focus[axis] - acquired) * direction).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('automatic action boundaries', () => {
  it('keeps three independently spaced actions as three readable shots', () => {
    const telemetry = [click(5000, 0.3), click(9000, 0.45), click(13000, 0.6)];
    const zooms = plan(telemetry);
    expect(zooms).toHaveLength(3);
    expect(zooms.map((zoom) => [zoom.startMs, zoom.endMs])).toEqual([
      [4500, 5500],
      [8500, 9500],
      [12500, 13500],
    ]);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    expect(camera.sample(7000).scale).toBeCloseTo(1, 6);
    expect(camera.sample(11000).scale).toBeCloseTo(1, 6);
    for (const action of telemetry) {
      const shot = zooms.find((zoom) => zoom.startMs <= action.timeMs && zoom.endMs >= action.timeMs);
      expect(shot).toBeDefined();
      expect(shot!.focus.cx).toBe(action.cx);
    }
  });

  it('retains a second gesture at the opposite side instead of dropping it to make room for wide ramps', () => {
    const first = click(5000, 0.1);
    const second = click(6500, 0.9);
    const telemetry: CursorTelemetryPoint[] = [
      first,
      { ...first, timeMs: 5030, interactionType: 'mouseup' },
      { ...first, timeMs: 6490, interactionType: 'move' },
      second,
      { ...second, timeMs: 6800, interactionType: 'move' },
      { ...second, timeMs: 7100, interactionType: 'mouseup' },
    ];
    const zooms = plan(telemetry);
    expect(zooms).toHaveLength(2);
    expect(zooms[0]!.focus.cx).toBe(first.cx);
    expect(zooms[1]!.focus.cx).toBe(second.cx);
    expect(zooms[1]!.endMs).toBeGreaterThanOrEqual(7100);
  });

  it('preserves an opening click while starting the camera wide', () => {
    const zooms = plan([click(100, 0.3)]);
    expect(zooms).toHaveLength(1);
    const zoom = zooms[0]!;
    expect(zoom.startMs - cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[zoom.depth])).toBeGreaterThanOrEqual(0);
    expect(zoom.endMs).toBeGreaterThan(100);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    expect(camera.sample(0).scale).toBe(1);
  });

  it('keeps a long uninterrupted drag through its release without imposing artificial shot breaks', () => {
    const first = click(5000, 0.2);
    const zooms = plan(
      [
        first,
        { ...first, timeMs: 30000, cx: 0.8, interactionType: 'move' },
        { ...first, timeMs: 45000, cx: 0.6, interactionType: 'mouseup' },
      ],
      60000,
    );
    expect(zooms).toHaveLength(1);
    expect(zooms[0]!.startMs).toBeLessThanOrEqual(first.timeMs);
    expect(zooms[0]!.endMs).toBeGreaterThanOrEqual(45000);
  });
});

describe('handoff endpoint acquisition', () => {
  const outgoing: ZoomElement = {
    id: 'a',
    sessionId: 'take',
    startMs: 3000,
    endMs: 6000,
    focus: { cx: 0.3, cy: 0.5 },
    depth: 5,
    mode: 'auto',
    transition: 'cinematic',
  };
  const incoming: ZoomElement = {
    ...outgoing,
    id: 'b',
    startMs: 6800,
    endMs: 10000,
    focus: { cx: 0.2, cy: 0.5 },
  };

  it.each([true, false])('acquires the next automatic focus once without a second pan (cinematic=%s)', (cinematic) => {
    const zooms = [outgoing, incoming].map((zoom) => ({
      ...zoom,
      transition: cinematic ? ('cinematic' as const) : undefined,
    }));
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: [{ timeMs: 0, cx: 0.8, cy: 0.5 }] });
    // Legacy zooms already begin their zoom-out before their handoff. Test
    // acquisition after that envelope has turned back toward the incoming shot.
    const acquiredAt = cinematic ? 5700 : 6400;
    const acquired = camera.sample(acquiredAt).focus.cx;
    for (let time = acquiredAt + 25; time <= 9500; time += 25)
      expect(camera.sample(time).focus.cx).toBeGreaterThanOrEqual(acquired - 1e-8);
    expect(camera.sample(9500).focus.cx).toBeCloseTo(0.8, 8);
  });

  it('resolves the incoming cursor on the source clock and through its destination geometry', () => {
    const zooms = [{ ...outgoing, mode: 'manual' as const }, incoming];
    const camera = createCompositionCameraEvaluator({
      zooms,
      telemetry: [
        { timeMs: 1000, cx: 0.2, cy: 0.5 },
        { timeMs: 15000, cx: 0.8, cy: 0.5 },
      ],
      mapTelemetryTime: (time) => time * 2 + 1000,
      mapFocus: (focus) => ({ cx: focus.cx * 0.8 + 0.1, cy: focus.cy }),
    });
    // At the end of the handoff (6900 timeline / 14800 source), the incoming
    // cursor is already far from the old saved click. It must not be reacquired later.
    const before = camera.sample(7100).focus.cx;
    const after = camera.sample(7600).focus.cx;
    expect(before).toBeGreaterThan(0.65);
    expect(after).toBeGreaterThanOrEqual(before);
    // Once acquired, the small remaining cursor movement stays in the safe zone.
    const acquiredSourceX = 0.2 + (0.8 - 0.2) * ((6900 * 2 + 1000 - 1000) / 14000);
    expect(camera.sample(9500).focus.cx).toBeCloseTo(acquiredSourceX * 0.8 + 0.1, 6);
  });

  it.each(['absent', 'hidden'] as const)('uses the incoming authored focus when cursor telemetry is %s', (kind) => {
    const camera = createCompositionCameraEvaluator({
      zooms: [outgoing, { ...incoming, focus: { cx: 0.7, cy: 0.6 } }],
      telemetry: kind === 'hidden' ? [{ timeMs: 0, cx: 0.1, cy: 0.1, visible: false }] : [],
    });
    expect(camera.sample(9000).focus).toEqual({ cx: expect.closeTo(0.7, 8), cy: expect.closeTo(0.6, 8) });
  });

  it('finishes an auto-to-manual handoff at the authored focus even when the cursor is elsewhere', () => {
    const manual = { ...incoming, mode: 'manual' as const, focus: { cx: 0.65, cy: 0.6 } };
    const camera = createCompositionCameraEvaluator({
      zooms: [outgoing, manual],
      telemetry: [{ timeMs: 0, cx: 0.8, cy: 0.2 }],
    });
    expect(camera.sample(9000).focus).toEqual({ cx: expect.closeTo(0.65, 8), cy: expect.closeTo(0.6, 8) });
  });

  it('keeps a rapid list burst stable rather than producing a separate pan for every row', () => {
    const zooms = plan(Array.from({ length: 20 }, (_, index) => click(5000 + index * 150, 0.5, 0.1 + index * 0.04)));
    expect(zooms).toHaveLength(1);
    expect(zooms[0]!.startMs).toBeLessThan(5000);
    expect(zooms[0]!.endMs).toBeGreaterThan(7850);
  });
});

describe('shot bounds around complete gestures', () => {
  it('keeps a long release and a final tight gesture when the closing hold cannot be split', () => {
    const telemetry: CursorTelemetryPoint[] = [
      click(5000, 0.1),
      { ...click(28000, 0.1), interactionType: 'mouseup' },
      click(28050, 0.9),
      { ...click(28070, 0.9), interactionType: 'mouseup' },
    ];
    const zooms = plan(telemetry, 30000);
    for (const time of [5000, 28000, 28050, 28070])
      expect(zooms.some((zoom) => zoom.startMs <= time && zoom.endMs >= time)).toBe(true);
    expect(zooms.every((zoom) => zoom.endMs > zoom.startMs)).toBe(true);
  });

  it('coalesces an opening burst when the wide opening leaves no room for distinct holds', () => {
    const zooms = plan([click(0, 0.1), click(600, 0.9)], 10000);
    expect(zooms).toHaveLength(1);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    expect(camera.sample(0).scale).toBe(1);
    expect(camera.sample(1000).scale).toBeGreaterThan(1);
    expect(zooms[0]!.endMs).toBeGreaterThan(600);
  });
});

describe('overlapping cinematic ramp handoffs', () => {
  it.each([1400, 1800])('has no wide pulse or focus reversal across a %d ms gap', (gap) => {
    const zooms: ZoomElement[] = [
      {
        id: 'a',
        sessionId: 'take',
        startMs: 4500,
        endMs: 6500,
        depth: 3,
        mode: 'auto',
        focus: { cx: 0.3, cy: 0.5 },
        transition: 'cinematic',
      },
      {
        id: 'b',
        sessionId: 'take',
        startMs: 6500 + gap,
        endMs: 11000,
        depth: 3,
        mode: 'auto',
        focus: { cx: 0.7, cy: 0.5 },
        transition: 'cinematic',
      },
    ];
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.3, cy: 0.5 },
      { timeMs: 6500, cx: 0.3, cy: 0.5 },
      { timeMs: 6600, cx: 0.7, cy: 0.5 },
      { timeMs: 15000, cx: 0.7, cy: 0.5 },
    ];
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    let previous = camera.sample(6400).focus.cx;
    for (let time = 6500; time <= 10500; time += 10) {
      const sample = camera.sample(time);
      expect(sample.scale).toBe(1.8);
      expect(sample.focus.cx).toBeGreaterThanOrEqual(previous - 1e-10);
      previous = sample.focus.cx;
    }
  });
});
