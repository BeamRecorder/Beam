import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '@beam/engine/capture/capture-session';
import {
  buildAutomaticZoomElements,
  normalizeCursorTelemetry,
  ZOOM_ALGORITHM_VERSION,
} from '@beam/engine/zoom/zoom-suggestions';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_INTENSITY,
  DEFAULT_ZOOM_TILT_VERTICAL,
} from '@beam/engine/zoom/zoom-types';

const sample = (
  timeMs: number,
  cx = 0.5,
  cy = 0.5,
  interactionType?: CursorTelemetryPoint['interactionType'],
): CursorTelemetryPoint => ({ timeMs, cx, cy, interactionType });

const suggestionFor = (telemetry: CursorTelemetryPoint[]) =>
  buildAutomaticZoomElements({
    telemetry: telemetry.map((p) => ({ ...p, timeMs: p.timeMs + 3000 })),
    sessionId: 'session',
    durationMs: 15_000,
  })[0];
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
      telemetry: [sample(6_000, 0.25, 0.75, 'click')],
      sessionId: 'session',
      durationMs: 15_000,
    });
    expect(zooms).toEqual([
      expect.objectContaining({
        startMs: 5_500,
        endMs: 7_500,
        focus: { cx: 0.25, cy: 0.75 },
        depth: 3,
        mode: 'auto',
        projection: '2d',
        tiltPreset: 'custom',
      }),
    ]);
    expectAutoTiltMetadata(zooms[0]);
  });

  it('frames nearby actions together but keeps distant actions separate', () => {
    const zooms = buildAutomaticZoomElements({
      telemetry: [
        sample(6_000, 0.2, 0.3, 'click'),
        sample(7_500, 0.3, 0.4, 'double-click'),
        sample(16_000, 0.9, 0.9, 'click'),
      ],
      sessionId: 'session',
      durationMs: 25_000,
    });
    expect(zooms).toHaveLength(2);
    expect(zooms[0]).toMatchObject({ focus: { cx: 0.25, cy: 0.35 }, depth: 3, transition: 'cinematic' });
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

  it('keeps a readable wide gap around an authored zoom', () => {
    const reserved = [
      {
        id: 'manual',
        sessionId: 'session',
        startMs: 0,
        endMs: 8000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2 as const,
        mode: 'manual' as const,
      },
    ];
    expect(
      buildAutomaticZoomElements({
        telemetry: [sample(8100, 0.25, 0.75, 'click')],
        sessionId: 'session',
        durationMs: 20_000,
        reserved,
      }),
    ).toEqual([]);
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(14000, 0.25, 0.75, 'click')],
      sessionId: 'session',
      durationMs: 25_000,
      reserved,
    });
    expect(zooms[0]).toMatchObject({ startMs: 13500, endMs: 15500 });
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

  it('increments the automatic zoom algorithm version for opening actions and drag framing', () => {
    expect(ZOOM_ALGORITHM_VERSION).toBe(11);
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
