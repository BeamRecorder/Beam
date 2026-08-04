import type { CursorTelemetryPoint } from '../../../api/types/capture-session'
import { DEFAULT_ZOOM_DEPTH, type ZoomElement, type ZoomFocus } from './zoom-types'

export const CLICK_CLUSTER_GAP_MS = 2500
export const ZOOM_REGION_PADDING_MS = 500
export const ZOOM_ALGORITHM_VERSION = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const explicitClickTypes = new Set(['click', 'double-click', 'right-click', 'middle-click'])

export function normalizeCursorTelemetry(samples: CursorTelemetryPoint[], durationMs: number): CursorTelemetryPoint[] {
  return samples
    .filter((sample) => Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy))
    .map((sample) => ({
      ...sample,
      timeMs: clamp(sample.timeMs, 0, durationMs),
      cx: clamp(sample.cx, 0, 1),
      cy: clamp(sample.cy, 0, 1),
    }))
    .sort((left, right) => left.timeMs - right.timeMs)
}

function interactionStrength(sample: CursorTelemetryPoint) {
  if (sample.interactionType === 'double-click') return 1500
  if (sample.interactionType === 'right-click' || sample.interactionType === 'middle-click') return 1200
  return 900
}

interface ClickCluster {
  firstMs: number
  lastMs: number
  focus: ZoomFocus
}

function clusterClicks(samples: CursorTelemetryPoint[]): ClickCluster[] {
  const clicks = samples.filter((sample) => explicitClickTypes.has(sample.interactionType ?? ''))
  if (clicks.length === 0) return []
  const clusters: ClickCluster[] = []
  let members = [clicks[0]]
  const flush = () => {
    const best = members.reduce((winner, sample) =>
      interactionStrength(sample) > interactionStrength(winner) ? sample : winner,
    )
    clusters.push({
      firstMs: members[0].timeMs,
      lastMs: members.at(-1)?.timeMs ?? members[0].timeMs,
      focus: { cx: best.cx, cy: best.cy },
    })
  }
  for (const click of clicks.slice(1)) {
    if (click.timeMs - (members.at(-1)?.timeMs ?? click.timeMs) <= CLICK_CLUSTER_GAP_MS) members.push(click)
    else {
      flush()
      members = [click]
    }
  }
  flush()
  return clusters
}

export function buildAutomaticZoomElements(params: {
  telemetry: CursorTelemetryPoint[]
  sessionId: string
  durationMs: number
  reserved?: ZoomElement[]
}): ZoomElement[] {
  if (params.durationMs <= 0) return []
  const reserved = params.reserved ?? []
  return clusterClicks(normalizeCursorTelemetry(params.telemetry, params.durationMs)).flatMap((cluster) => {
    const startMs = Math.round(clamp(cluster.firstMs - ZOOM_REGION_PADDING_MS, 0, params.durationMs))
    const endMs = Math.round(clamp(cluster.lastMs + ZOOM_REGION_PADDING_MS, 0, params.durationMs))
    if (endMs <= startMs || reserved.some((zoom) => endMs > zoom.startMs && startMs < zoom.endMs)) return []
    return [
      {
        id: `auto:${params.sessionId}:${Math.round(cluster.firstMs)}`,
        sessionId: params.sessionId,
        startMs,
        endMs,
        focus: cluster.focus,
        depth: DEFAULT_ZOOM_DEPTH,
        mode: 'auto' as const,
      },
    ]
  })
}
