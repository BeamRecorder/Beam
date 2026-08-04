import { describe, expect, it } from 'vitest'
import type { CursorTelemetryPoint } from '../../../../api/types/capture-session'
import { buildAutomaticZoomElements, normalizeCursorTelemetry } from '../zoom-suggestions'

const sample = (
  timeMs: number,
  cx = 0.5,
  cy = 0.5,
  interactionType?: CursorTelemetryPoint['interactionType'],
): CursorTelemetryPoint => ({ timeMs, cx, cy, interactionType })

describe('buildAutomaticZoomElements', () => {
  it('creates a sensible size region for an explicit click', () => {
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(1_000, 0.25, 0.75, 'click')],
      sessionId: 'session',
      durationMs: 5_000,
    })
    expect(zooms).toEqual([
      expect.objectContaining({
        startMs: 500,
        endMs: 1_500,
        focus: { cx: 0.25, cy: 0.75 },
        depth: 2,
        mode: 'auto',
      }),
    ])
  })

  it('clusters explicit clicks separated by at most 2500 ms regardless of position', () => {
    const zooms = buildAutomaticZoomElements({
      telemetry: [sample(1_000, 0.1, 0.1, 'click'), sample(3_400, 0.9, 0.9, 'double-click')],
      sessionId: 'session',
      durationMs: 5_000,
    })
    expect(zooms).toHaveLength(1)
    expect(zooms[0]).toMatchObject({
      startMs: 500,
      endMs: 3_900,
      focus: { cx: 0.9, cy: 0.9 },
    })
  })

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
    ]
    expect(
      buildAutomaticZoomElements({
        telemetry: [sample(1_000, 0.5, 0.5, 'move'), sample(1_000, 0.5, 0.5, 'click')],
        sessionId: 'session',
        durationMs: 5_000,
        reserved,
      }),
    ).toEqual([])
  })
})

describe('normalizeCursorTelemetry', () => {
  it('sorts and clamps malformed coordinate bounds', () => {
    expect(normalizeCursorTelemetry([sample(20, 2, -1), sample(-5, 0.2, 0.3)], 10)).toEqual([
      sample(0, 0.2, 0.3),
      sample(10, 1, 0),
    ])
  })
})
