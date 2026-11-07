import { describe, expect, it } from 'vitest';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { createAutoFollowState, updateAutoFollowTarget } from '../auto-follow-camera';
import { DEFAULT_ZOOM_AUTO_FOLLOW, normalizeZoomAutoFollow } from '../zoom-types';
import type { ZoomElement, ZoomProjection, ZoomAutoFollowSettings } from '../zoom-types';
import type { CursorTelemetryPoint } from '../../capture/capture-session';

const shot = (projection: ZoomProjection = '2d'): ZoomElement => ({
  id: 'click-zoom',
  sessionId: 'recording',
  startMs: 1000,
  endMs: 9000,
  focus: { cx: 0.35, cy: 0.45 },
  depth: 4,
  mode: 'auto',
  generation: 'automatic',
  transition: 'cinematic',
  projection,
});
const telemetry: CursorTelemetryPoint[] = [
  { timeMs: 0, cx: 0.35, cy: 0.45, interactionType: 'move' },
  { timeMs: 1200, cx: 0.35, cy: 0.45, interactionType: 'click' },
  { timeMs: 3500, cx: 0.9, cy: 0.8, interactionType: 'move' },
  { timeMs: 9000, cx: 0.9, cy: 0.8, interactionType: 'move' },
];
const stationary = telemetry.map((point) => ({ ...point, cx: 0.35, cy: 0.45 }));
const off = { ...DEFAULT_ZOOM_AUTO_FOLLOW, enabled: false };

describe('fixed automatic zoom framing', () => {
  it.each(['2d', '3d', 'orbit'] as const)('ignores cursor motion during %s entry, hold and exit', (projection) => {
    const inputs = { zooms: [shot(projection)], autoFollow: off };
    const moving = createCompositionCameraEvaluator({ ...inputs, telemetry });
    const still = createCompositionCameraEvaluator({ ...inputs, telemetry: stationary });
    for (const time of [0, 950, 1400, 3000, 4999.9, 7000, 9000, 10500]) {
      expect(moving.sample(time)).toEqual(still.sample(time));
    }
    expect(moving.sample(7000).focus.cx).toBeCloseTo(0.35, 9);
    expect(moving.sample(7000).focus.cy).toBeCloseTo(0.45, 9);
  });
  it.each(['2d', 'orbit'] as const)(
    'keeps handoffs between clicks independent of cursor motion in %s',
    (projection) => {
      const first = { ...shot(projection), endMs: 4500 };
      const second = { ...shot(projection), id: 'next-click', startMs: 5200, focus: { cx: 0.7, cy: 0.6 } };
      const inputs = { zooms: [first, second], autoFollow: off };
      const moving = createCompositionCameraEvaluator({ ...inputs, telemetry });
      const still = createCompositionCameraEvaluator({ ...inputs, telemetry: stationary });
      for (const time of [1000, 3500, 4300, 4550, 5000, 5200, 6000, 8000]) {
        expect(moving.sample(time)).toEqual(still.sample(time));
      }
      expect(moving.sample(8000).focus.cx).toBeCloseTo(0.7, 8);
    },
  );
  it('preserves follow for existing projects and explicitly enabled settings', () => {
    const inputs = { zooms: [shot()], telemetry };
    const legacy = createCompositionCameraEvaluator(inputs);
    const on = createCompositionCameraEvaluator({ ...inputs, autoFollow: { ...off, enabled: true } });
    const fixed = createCompositionCameraEvaluator({ ...inputs, autoFollow: off });
    expect(legacy.sample(7000)).toEqual(on.sample(7000));
    expect(on.sample(7000).focus.cx).toBeGreaterThan(fixed.sample(7000).focus.cx + 0.2);
  });
  it('retains source-to-canvas mapping of the clicked area when follow is off', () => {
    const camera = createCompositionCameraEvaluator({
      zooms: [shot()],
      telemetry,
      autoFollow: off,
      mapFocus: (focus) => ({ cx: 0.1 + focus.cx * 0.5, cy: 0.2 + focus.cy * 0.5 }),
    });
    expect(camera.sample(7000).focus.cx).toBeCloseTo(0.275, 9);
    expect(camera.sample(7000).focus.cy).toBeCloseTo(0.425, 9);
  });
  it('is deterministic through reverse seeks and keeps manual shots unchanged', () => {
    const inputs = { zooms: [{ ...shot('orbit'), mode: 'manual' as const }], telemetry };
    const fixed = createCompositionCameraEvaluator({ ...inputs, autoFollow: off });
    const on = createCompositionCameraEvaluator(inputs);
    for (const time of [7000, 1400, 9000, 3000, 7000]) expect(fixed.sample(time)).toEqual(on.sample(time));
  });
});

describe('follow toggle normalization and target state', () => {
  it.each([undefined, null, {}, { enabled: true }])('enables follow for legacy settings %j', (value) => {
    expect(normalizeZoomAutoFollow(value).enabled).toBe(true);
  });
  it('preserves disabled follow and validates malformed flags without changing tuning', () => {
    expect(normalizeZoomAutoFollow(off)).toEqual(off);
    expect(normalizeZoomAutoFollow({ ...off, enabled: 'false' } as unknown as ZoomAutoFollowSettings).enabled).toBe(
      true,
    );
  });
  it('stops an already-following target as soon as tracking is disabled', () => {
    const state = createAutoFollowState(DEFAULT_ZOOM_AUTO_FOLLOW);
    const focus = { cx: 0.35, cy: 0.45 };
    expect(updateAutoFollowTarget(state, { cx: 0.9, cy: 0.8 }, focus, 2.2, 1, 1000).cx).toBeGreaterThan(focus.cx);
    state.settings.enabled = false;
    for (const [time, strength] of [
      [1100, 1],
      [1300, 0.5],
      [900, 1],
    ] as const) {
      expect(updateAutoFollowTarget(state, { cx: 0.9, cy: 0.8 }, focus, 2.2, strength, time)).toEqual(focus);
    }
    expect(state.initialized).toBe(false);
    expect(state.previousCursor).toBeNull();
  });
});
