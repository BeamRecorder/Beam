import { describe, expect, it } from 'vitest';
import type { ZoomElement } from '../zoom-types';
import { ZOOM_DEPTH_SCALES } from '../zoom-types';
import { createZoomTiming } from '../zoom-timing';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { clampFocusToScale, regionStrength, zoomAtTime } from '../zoom-playback';
import { buildAutomaticZoomElements } from '../zoom-suggestions';
import { prepareSplitZoomContinuity } from '../zoom-split-continuity';

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

describe('camera respects visible marker bounds', () => {
  for (const projection of ['2d', '3d', 'orbit'] as const)
    for (const depth of [1, 2, 3, 4, 5, 6] as const)
      it.each([1, 200, 2000, 3000])(
        `${projection} depth ${depth}, %d ms, including fractional simulation ticks`,
        (duration) => {
          const z = { ...zoom(6003, 6003 + duration), projection, depth, timing: createZoomTiming(depth) };
          const camera = createCompositionCameraEvaluator({ zooms: [z], telemetry: [] });
          for (const time of [0, z.startMs - 0.001, z.startMs, z.endMs, z.endMs + 0.001, z.endMs + 1000]) {
            const sample = camera.sample(time);
            expect(sample.scale).toBe(1);
            expect(sample.tiltX).toBe(0);
            expect(sample.tiltY).toBe(0);
            expect(sample.orbit).toBeUndefined();
            expect(sample.focus).toEqual({ cx: 0.5, cy: 0.5 });
          }
          expect(camera.sample((z.startMs + z.endMs) / 2).scale).toBeCloseTo(ZOOM_DEPTH_SCALES[depth], 12);
          expect(camera.sample((z.startMs + z.endMs) / 2).focus).toEqual(
            clampFocusToScale(z.focus, ZOOM_DEPTH_SCALES[depth]),
          );
          expect(regionStrength(z, z.startMs - 1)).toBe(0);
          expect(regionStrength(z, z.endMs + 1)).toBe(0);
        },
      );

  it('returns the same camera at entry and exit when seeking forwards, backwards or directly', () => {
    const z = { ...zoom(), projection: '3d' as const };
    const camera = createCompositionCameraEvaluator({ zooms: [z], telemetry: [] });
    const samples = [5900, 6000, 6000.1, 6700, 7400, 7999.9, 8000, 8001];
    const expected = samples.map((t) => createCompositionCameraEvaluator({ zooms: [z], telemetry: [] }).sample(t));
    samples.forEach((t, i) => expect(camera.sample(t)).toEqual(expected[i]));
    [...samples].reverse().forEach((t, i) => expect(camera.sample(t)).toEqual(expected[samples.length - 1 - i]));
  });

  it('does not bridge a positive gap between bounded markers', () => {
    const first = zoom(),
      next = zoom(8001, 10001);
    const camera = createCompositionCameraEvaluator({ zooms: [first, next], telemetry: [] });
    for (const time of [8000, 8000.5, 8001]) {
      expect(zoomAtTime([first, next], time)).toBeNull();
      expect(camera.sample(time).scale).toBe(1);
    }
  });

  it('keeps touching zooms connected entirely within their combined markers', () => {
    const first = zoom(),
      next = { ...zoom(8000, 10000), depth: 3 as const };
    const camera = createCompositionCameraEvaluator({ zooms: [first, next], telemetry: [] });
    expect(camera.sample(5999).scale).toBe(1);
    expect(camera.sample(8000).scale).toBeGreaterThan(1.4);
    expect(Math.abs(camera.sample(7999.99).scale - camera.sample(8000.01).scale)).toBeLessThan(0.0001);
    expect(camera.sample(10000).scale).toBe(1);
  });

  it('preserves the released standard trajectory when timing metadata is absent', () => {
    const z = zoom();
    delete z.timing;
    delete z.transition;
    const camera = createCompositionCameraEvaluator({ zooms: [z], telemetry: [] });
    expect(camera.sample(5600).scale).toBe(1);
    expect(camera.sample(6000).scale).toBeCloseTo(1.1254290044954431, 12);
    expect(camera.sample(8000).scale).toBeCloseTo(1.3444283329813587, 12);
    expect(camera.sample(8700).scale).toBeCloseTo(1.012351253994975, 12);
    expect(z).not.toHaveProperty('timing');
  });

  it('retains bounded interpolation after copying a legacy style without cinematic metadata', () => {
    const z = zoom();
    delete z.transition;
    const camera = createCompositionCameraEvaluator({ zooms: [z], telemetry: [] });
    expect(zoomAtTime([z], 6400)).toMatchObject({ bounded: true, cinematic: true });
    expect(camera.sample(5999).scale).toBe(1);
    expect(camera.sample(6400).scale).toBeGreaterThan(1);
    expect(camera.sample(8000).scale).toBe(1);
  });

  it('does not create a legacy handoff outside a neighboring bounded zoom', () => {
    const legacy = zoom(2000, 4000);
    delete legacy.timing;
    delete legacy.transition;
    const bounded = zoom(5000, 7000);
    expect(zoomAtTime([legacy, bounded], 4800)).toBeNull();
    expect(zoomAtTime([bounded, { ...legacy, startMs: 8000, endMs: 10000 }], 7500)).toBeNull();
  });

  it('reserves the actual bounds of new authored zooms without adding a second transition margin', () => {
    const bounded = zoom();
    const telemetry = [{ timeMs: 11000, cx: 0.3, cy: 0.5, interactionType: 'click' as const }];
    const generated = buildAutomaticZoomElements({
      telemetry,
      sessionId: 'take',
      durationMs: 16000,
      reserved: [bounded],
    });
    expect(generated).toHaveLength(1);
    expect(generated[0]!.startMs - bounded.endMs).toBeGreaterThanOrEqual(1500);
    expect(generated[0]!.timing?.version).toBe(1);
  });

  it('includes anticipation in generated markers and remains focused on the recorded action', () => {
    const telemetry = [{ timeMs: 6000, cx: 0.3, cy: 0.7, interactionType: 'click' as const }];
    const zooms = buildAutomaticZoomElements({ telemetry, sessionId: 'take', durationMs: 15000 });
    const z = zooms[0]!,
      camera = createCompositionCameraEvaluator({ zooms, telemetry });
    expect(z.startMs).toBeLessThan(5500);
    expect(z.endMs).toBeGreaterThan(6500);
    expect(camera.sample(z.startMs).scale).toBe(1);
    expect(camera.sample(z.endMs).scale).toBe(1);
    expect(camera.sample(6000).scale).toBe(ZOOM_DEPTH_SCALES[z.depth]);
    expect(z.focus).toEqual({ cx: 0.3, cy: 0.7 });
  });

  it('keeps an unmodified recording cut continuous and confines separated fragments to their own blocks', () => {
    const original = { ...zoom(), mode: 'auto' as const, splitGroupId: 'cut' };
    const fragments = [
      { ...original, endMs: 7000 },
      { ...original, id: 'right', startMs: 7000 },
    ];
    const grouped = createCompositionCameraEvaluator({ zooms: fragments, telemetry: [] });
    const full = createCompositionCameraEvaluator({ zooms: [original], telemetry: [] });
    for (const time of [6000, 6500, 6999, 7000, 7500, 8000]) expect(grouped.sample(time)).toEqual(full.sample(time));
    const separated = [fragments[0]!, { ...fragments[1]!, startMs: 9000, endMs: 10000 }];
    expect(prepareSplitZoomContinuity(separated).elements).toHaveLength(2);
    const moved = createCompositionCameraEvaluator({ zooms: separated, telemetry: [] });
    for (const time of [7000, 8000, 9000, 10000]) expect(moved.sample(time).scale).toBe(1);
  });
});
