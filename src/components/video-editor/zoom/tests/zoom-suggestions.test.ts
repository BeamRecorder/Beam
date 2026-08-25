import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '../../../../api/types/capture-session';
import { buildAutomaticZoomElements, normalizeCursorTelemetry, ZOOM_ALGORITHM_VERSION } from '../zoom-suggestions';
import { DEFAULT_ZOOM_TILT_HORIZONTAL, DEFAULT_ZOOM_TILT_INTENSITY, DEFAULT_ZOOM_TILT_VERTICAL } from '../zoom-types';

const sample = (
  timeMs: number,
  cx = 0.5,
  cy = 0.5,
  interactionType?: CursorTelemetryPoint['interactionType'],
): CursorTelemetryPoint => ({ timeMs, cx, cy, interactionType });

const suggestionFor = (telemetry: CursorTelemetryPoint[]) =>
  buildAutomaticZoomElements({ telemetry, sessionId: 'session', durationMs: 6_000 })[0];
const AUTO_TILT_MIN_INTENSITY = 0.12;
const AUTO_TILT_MAX_INTENSITY = 0.32;

const expectAutoTiltMetadata = (zoom: ReturnType<typeof suggestionFor>) => {
  expect(zoom).toMatchObject({ mode: 'auto', projection: '2d', tiltPreset: 'custom' });
  for (const value of [zoom?.tiltIntensity, zoom?.tiltHorizontal, zoom?.tiltVertical]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(zoom?.tiltIntensity).toBeGreaterThanOrEqual(0);
  expect(zoom?.tiltIntensity).toBeLessThanOrEqual(1);
  expect(zoom?.tiltHorizontal).toBeGreaterThanOrEqual(-1);
  expect(zoom?.tiltHorizontal).toBeLessThanOrEqual(1);
  expect(zoom?.tiltVertical).toBeGreaterThanOrEqual(-1);
  expect(zoom?.tiltVertical).toBeLessThanOrEqual(1);
};

describe('buildAutomaticZoomElements', () => {
  it('creates a sensible size region for an explicit click', () => {
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(1_000, 0.25, 0.75, 'click')],
      sessionId: 'session',
      durationMs: 5_000,
    });
    expect(zooms).toEqual([
      expect.objectContaining({
        startMs: 500,
        endMs: 1_500,
        focus: { cx: 0.25, cy: 0.75 },
        depth: 2,
        mode: 'auto',
        projection: '2d',
        tiltPreset: 'custom',
      }),
    ]);
    expectAutoTiltMetadata(zooms[0]);
  });

  it('clusters explicit clicks separated by at most 2500 ms regardless of position', () => {
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(1_000, 0.1, 0.1, 'click'), sample(3_400, 0.9, 0.9, 'double-click')],
      sessionId: 'session',
      durationMs: 5_000,
    });
    expect(zooms).toHaveLength(1);
    expect(zooms[0]).toMatchObject({
      startMs: 500,
      endMs: 3_900,
      focus: { cx: 0.9, cy: 0.9 },
    });
    expectAutoTiltMetadata(zooms[0]);
  });

  it('ignores moves and regions overlapping a reserved manual zoom', () => {
    const reserved = [
      {
        id: 'manual',
        sessionId: 'session',
        startMs: 500,
        endMs: 1_500,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2 as const,
        mode: 'manual' as const,
      },
    ];
    expect(
      buildAutomaticZoomElements({
        telemetry: [sample(1_000, 0.5, 0.5, 'move'), sample(1_000, 0.5, 0.5, 'click')],
        sessionId: 'session',
        durationMs: 5_000,
        reserved,
      }),
    ).toEqual([]);
  });

  it('fits an automatic click zoom into the free gap after a reserved eight-second zoom', () => {
    const reserved = [
      {
        id: 'manual',
        sessionId: 'session',
        startMs: 0,
        endMs: 8_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2 as const,
        mode: 'manual' as const,
      },
    ];
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(8_100, 0.25, 0.75, 'click')],
      sessionId: 'session',
      durationMs: 10_000,
      reserved,
    });
    expect(zooms).toEqual([
      expect.objectContaining({
        startMs: 8_000,
        endMs: 9_000,
        focus: { cx: 0.25, cy: 0.75 },
      }),
    ]);
    expectAutoTiltMetadata(zooms[0]);
  });

  it.each([
    ['left', [sample(2_000, 0.1, 0.5, 'move'), sample(2_900, 0.45, 0.5, 'move')], 'tiltHorizontal'],
    ['right', [sample(2_000, 0.9, 0.5, 'move'), sample(2_900, 0.55, 0.5, 'move')], 'tiltHorizontal'],
    ['top', [sample(2_000, 0.5, 0.1, 'move'), sample(2_900, 0.5, 0.45, 'move')], 'tiltVertical'],
    ['bottom', [sample(2_000, 0.5, 0.9, 'move'), sample(2_900, 0.5, 0.55, 'move')], 'tiltVertical'],
  ])(
    'derives bounded perspective metadata from arrival from %s while keeping auto projection 2D',
    (_direction, moves, axis) => {
      const zoom = suggestionFor([...moves, sample(3_000, 0.5, 0.5, 'click')]);

      expectAutoTiltMetadata(zoom);
      expect(zoom?.tiltPreset).toBe('custom');
      expect(zoom?.tiltIntensity).toBeGreaterThanOrEqual(AUTO_TILT_MIN_INTENSITY);
      expect(zoom?.tiltIntensity).toBeLessThanOrEqual(AUTO_TILT_MAX_INTENSITY);
      expect(zoom?.[axis as 'tiltHorizontal' | 'tiltVertical']).toBeDefined();
      expect(Math.abs(zoom?.[axis as 'tiltHorizontal' | 'tiltVertical'] ?? 0)).toBeGreaterThan(0);
      expect(Math.abs(zoom?.[axis as 'tiltHorizontal' | 'tiltVertical'] ?? 0)).toBeLessThanOrEqual(1);
    },
  );

  it('assigns opposite horizontal signs to left and right arrivals', () => {
    const left = suggestionFor([
      sample(2_000, 0.1, 0.5, 'move'),
      sample(2_900, 0.45, 0.5, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);
    const right = suggestionFor([
      sample(2_000, 0.9, 0.5, 'move'),
      sample(2_900, 0.55, 0.5, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);

    expect((left?.tiltHorizontal ?? 0) * (right?.tiltHorizontal ?? 0)).toBeLessThan(0);
  });

  it('assigns opposite vertical signs to top and bottom arrivals', () => {
    const top = suggestionFor([
      sample(2_000, 0.5, 0.1, 'move'),
      sample(2_900, 0.5, 0.45, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);
    const bottom = suggestionFor([
      sample(2_000, 0.5, 0.9, 'move'),
      sample(2_900, 0.5, 0.55, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);

    expect((top?.tiltVertical ?? 0) * (bottom?.tiltVertical ?? 0)).toBeLessThan(0);
  });

  it('gives a longer, faster arrival more tilt intensity than a short, slow arrival', () => {
    const slow = suggestionFor([
      sample(2_400, 0.4, 0.5, 'move'),
      sample(2_900, 0.49, 0.5, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);
    const fast = suggestionFor([sample(2_900, 0.1, 0.5, 'move'), sample(3_000, 0.5, 0.5, 'click')]);

    expect(fast?.projection).toBe('2d');
    expectAutoTiltMetadata(fast);
    expect(fast?.tiltIntensity).toBeGreaterThan(slow?.tiltIntensity ?? 0);
    expect(fast?.tiltIntensity).toBeLessThanOrEqual(AUTO_TILT_MAX_INTENSITY);
    expect(slow?.tiltIntensity).toBeGreaterThanOrEqual(AUTO_TILT_MIN_INTENSITY);
  });

  it.each([
    ['absent', [sample(3_000, 0.5, 0.5, 'click')]],
    [
      'jitter below threshold',
      [sample(2_800, 0.499, 0.501, 'move'), sample(2_900, 0.501, 0.499, 'move'), sample(3_000, 0.5, 0.5, 'click')],
    ],
  ])('keeps %s movement in the default 2D projection', (_label, telemetry) => {
    const zoom = suggestionFor(telemetry);

    expectAutoTiltMetadata(zoom);
  });

  it('keeps absent movement in 2D with the default perspective metadata', () => {
    const zoom = suggestionFor([sample(3_000, 0.5, 0.5, 'click')]);

    expect(zoom).toMatchObject({
      projection: '2d',
      tiltIntensity: DEFAULT_ZOOM_TILT_INTENSITY,
      tiltHorizontal: DEFAULT_ZOOM_TILT_HORIZONTAL,
      tiltVertical: DEFAULT_ZOOM_TILT_VERTICAL,
      tiltPreset: 'custom',
    });
  });

  it('keeps generated perspective metadata finite and bounded for extreme movement', () => {
    const zoom = suggestionFor([
      sample(2_400, -10, 10, 'move'),
      sample(2_500, -10, 10, 'move'),
      sample(3_000, 0.5, 0.5, 'click'),
    ]);

    expectAutoTiltMetadata(zoom);
    expect(Number.isFinite(zoom?.tiltIntensity)).toBe(true);
    expect(zoom?.tiltIntensity).toBeGreaterThanOrEqual(AUTO_TILT_MIN_INTENSITY);
    expect(zoom?.tiltIntensity).toBeLessThanOrEqual(AUTO_TILT_MAX_INTENSITY);
    expect(zoom?.tiltHorizontal).toBeGreaterThanOrEqual(-1);
    expect(zoom?.tiltHorizontal).toBeLessThanOrEqual(1);
    expect(zoom?.tiltVertical).toBeGreaterThanOrEqual(-1);
    expect(zoom?.tiltVertical).toBeLessThanOrEqual(1);
  });

  it('increments the automatic zoom algorithm version for perspective metadata', () => {
    expect(ZOOM_ALGORITHM_VERSION).toBe(8);
  });
});

describe('normalizeCursorTelemetry', () => {
  it('sorts and clamps malformed coordinate bounds', () => {
    expect(normalizeCursorTelemetry([sample(20, 2, -1), sample(-5, 0.2, 0.3)], 10)).toEqual([
      sample(0, 0.2, 0.3),
      sample(10, 1, 0),
    ]);
  });
});
