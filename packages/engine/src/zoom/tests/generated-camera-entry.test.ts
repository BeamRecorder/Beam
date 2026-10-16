import { describe, expect, it } from 'vitest';
import { buildAutomaticZoomElements } from '../zoom-suggestions';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { calmOrbitOpening } from './fixtures/calm-orbit-opening';
import type { CursorTelemetryPoint } from '../../capture/capture-session';

const plan = (telemetry: CursorTelemetryPoint[]) =>
  buildAutomaticZoomElements({ telemetry, sessionId: 'take', durationMs: 20883 });

describe('generated camera entry', () => {
  it('aims Calm Orbit at its first press instead of the center of future actions', () => {
    const firstPress = calmOrbitOpening.find((point) => point.interactionType === 'click')!;
    expect(plan(calmOrbitOpening)[0]!.focus).toEqual({ cx: firstPress.cx, cy: firstPress.cy });
  });

  it('has no right-left detour before the first Calm Orbit action', () => {
    const zooms = plan(calmOrbitOpening);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry: calmOrbitOpening });
    let previous = camera.sample(0).focus.cx;
    for (let time = 10; time <= 1104; time += 10) {
      const focus = camera.sample(time).focus.cx;
      expect(focus).toBeLessThanOrEqual(previous + 1e-9);
      expect(focus).toBeGreaterThanOrEqual(0.4697265625 - 1e-9);
      previous = focus;
    }
  });

  it.each([1, -1])('does not chase pre-click cursor approach in direction %d', (direction) => {
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: direction > 0 ? 0.1 : 0.9, cy: 0.5, interactionType: 'move' },
      { timeMs: 4900, cx: direction > 0 ? 0.1 : 0.9, cy: 0.5, interactionType: 'move' },
      { timeMs: 5000, cx: direction > 0 ? 0.8 : 0.2, cy: 0.5, interactionType: 'click' },
      { timeMs: 5050, cx: direction > 0 ? 0.8 : 0.2, cy: 0.5, interactionType: 'mouseup' },
    ];
    const zooms = plan(telemetry);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    const acquired = camera.sample(4000).focus.cx;
    for (let time = 4050; time <= 5500; time += 25)
      expect((camera.sample(time).focus.cx - acquired) * direction).toBeGreaterThanOrEqual(-1e-9);
  });
});

describe('generated follow after entry', () => {
  it('follows a drag that began during the opening ramp instead of waiting for another press', () => {
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.1, cy: 0.5, interactionType: 'click' },
      { timeMs: 1500, cx: 0.9, cy: 0.5, interactionType: 'move' },
      { timeMs: 3000, cx: 0.9, cy: 0.5, interactionType: 'mouseup' },
    ];
    const zooms = plan(telemetry);
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    expect(camera.sample(2500).focus.cx).toBeGreaterThan(0.55);
    expect(camera.sample(2500).scale).toBe(1.25);
  });

  it('keeps an incoming generated handoff aimed at its action while the cursor is still approaching', () => {
    const zooms = [
      {
        id: 'a',
        sessionId: 'take',
        startMs: 3000,
        endMs: 6000,
        depth: 5 as const,
        mode: 'auto' as const,
        generation: 'automatic' as const,
        transition: 'cinematic' as const,
        focus: { cx: 0.3, cy: 0.5 },
      },
      {
        id: 'b',
        sessionId: 'take',
        startMs: 6800,
        endMs: 10000,
        depth: 5 as const,
        mode: 'auto' as const,
        generation: 'automatic' as const,
        transition: 'cinematic' as const,
        focus: { cx: 0.8, cy: 0.5 },
      },
    ];
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.3, cy: 0.5, interactionType: 'move' },
      { timeMs: 3500, cx: 0.3, cy: 0.5, interactionType: 'click' },
      { timeMs: 5000, cx: 0.75, cy: 0.5, interactionType: 'move' },
      { timeMs: 5999, cx: 0.75, cy: 0.5, interactionType: 'move' },
      { timeMs: 6100, cx: 0.1, cy: 0.5, interactionType: 'move' },
      { timeMs: 7200, cx: 0.1, cy: 0.5, interactionType: 'move' },
      { timeMs: 7300, cx: 0.8, cy: 0.5, interactionType: 'click' },
    ];
    const camera = createCompositionCameraEvaluator({ zooms, telemetry });
    const acquired = camera.sample(5800).focus.cx;
    for (let time = 5900; time <= 7600; time += 25)
      expect(camera.sample(time).focus.cx).toBeGreaterThanOrEqual(acquired - 1e-9);
  });

  it.each([24, 60, 144])('keeps Calm Orbit entry identical across playback and reverse seeks at %d fps', (fps) => {
    const inputs = { zooms: plan(calmOrbitOpening), telemetry: calmOrbitOpening };
    const played = createCompositionCameraEvaluator(inputs);
    const cold = createCompositionCameraEvaluator(inputs);
    for (let frame = 0; frame < fps * 9; frame++) if (frame % 11) played.sample((frame * 1000) / fps);
    const retained = createCompositionCameraEvaluator(inputs, { previous: played, unchangedBeforeMs: Infinity });
    for (const time of [2500, 1103.9, 1104, 1104.1, 700, 0, 6200, 2655, 1100]) {
      expect(played.sample(time)).toEqual(cold.sample(time));
      expect(retained.sample(time)).toEqual(cold.sample(time));
    }
  });
});
