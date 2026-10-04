import { createGlassHighlight } from './glass-highlight';
import { normalizeCursorTelemetry } from './zoom-suggestions';
import { fitZoomPlacement } from './zoom-placement';
import { ZOOM_DEPTH_SCALES, type ZoomDepth, type ZoomElement } from './zoom-types';
import type { GlassGenerationInputs } from './glass-generation-types';
import type { CursorTelemetryPoint } from '../capture/capture-session';

const clickTypes = new Set(['click', 'double-click', 'right-click', 'middle-click']);
const weight = (point: CursorTelemetryPoint) => (point.interactionType === 'double-click' ? 2 : 1);
export const isAutomaticZoom = (zoom: ZoomElement) => zoom.mode === 'auto' || zoom.generation === 'automatic';

/** Click groups are bounded in both time and space, avoiding lenses over unrelated interactions. */
export function buildAutomaticGlassElements(inputs: GlassGenerationInputs): ZoomElement[] {
  const { width, height, durationMs } = inputs;
  if (![width, height, durationMs].every((value) => Number.isFinite(value) && value > 0)) return [];
  const short = Math.min(width, height);
  // Reject off-canvas clicks before normalization: cropped-out activity is not useful to highlight.
  const clicks = normalizeCursorTelemetry(
    inputs.telemetry.filter(
      (point) =>
        point.cx >= 0 &&
        point.cx <= 1 &&
        point.cy >= 0 &&
        point.cy <= 1 &&
        point.timeMs >= 0 &&
        point.timeMs < durationMs,
    ),
    durationMs,
  ).filter((point) => clickTypes.has(point.interactionType ?? ''));
  const groups: CursorTelemetryPoint[][] = [];
  for (const click of clicks) {
    const previous = groups.at(-1);
    if (
      previous &&
      click.timeMs - previous.at(-1)!.timeMs <= 1200 &&
      click.timeMs - previous[0]!.timeMs <= 3200 &&
      previous.every(
        (point) => Math.hypot((click.cx - point.cx) * width, (click.cy - point.cy) * height) <= short * 0.2,
      )
    )
      previous.push(click);
    else groups.push([click]);
  }
  const result: ZoomElement[] = [];
  for (const [index, group] of groups.entries()) {
    const first = group[0]!,
      last = group.at(-1)!;
    const lower = index ? (groups[index - 1]!.at(-1)!.timeMs + first.timeMs) / 2 : 0;
    const upper = index + 1 < groups.length ? (last.timeMs + groups[index + 1]![0]!.timeMs) / 2 : durationMs;
    const local = fitZoomPlacement({
      anchorMs: (first.timeMs + last.timeMs) / 2 - lower,
      preferredDurationMs: Math.max(1600, last.timeMs - first.timeMs + 1400),
      timelineDurationMs: upper - lower,
      occupied: inputs.reserved.map((zoom) => ({ ...zoom, startMs: zoom.startMs - lower, endMs: zoom.endMs - lower })),
    });
    const placement = local ? { startMs: local.startMs + lower, endMs: local.endMs + lower } : null;
    if (
      !placement ||
      group.some((click) => click.timeMs < placement.startMs || click.timeMs >= placement.endMs) ||
      placement.endMs - placement.startMs < 400
    )
      continue;
    const total = group.reduce((sum, point) => sum + weight(point), 0);
    const focus = {
      cx: group.reduce((sum, point) => sum + point.cx * weight(point), 0) / total,
      cy: group.reduce((sum, point) => sum + point.cy * weight(point), 0) / total,
    };
    const extent =
      Math.max(...group.map((point) => Math.hypot((point.cx - focus.cx) * width, (point.cy - focus.cy) * height))) /
      short;
    let depth: ZoomDepth = 4;
    // Keep the complete clicked region plus context visible within a readable, bounded lens.
    while (depth > 1 && 2 * (extent + 0.1) * ZOOM_DEPTH_SCALES[depth] > 0.85) depth = (depth - 1) as ZoomDepth;
    const size = Math.min(0.85, Math.max(0.6, 2 * (extent + 0.1) * ZOOM_DEPTH_SCALES[depth]));
    result.push({
      id: `auto:glass:${inputs.sessionId}:${Math.round(first.timeMs)}`,
      sessionId: inputs.sessionId,
      ...placement,
      focus,
      depth,
      mode: 'manual',
      effect: 'glass',
      generation: 'automatic',
      enabled: true,
      glass: {
        ...createGlassHighlight(),
        size,
        transitionMs: Math.min(250, (placement.endMs - placement.startMs) / 5),
      },
    });
  }
  return result;
}
