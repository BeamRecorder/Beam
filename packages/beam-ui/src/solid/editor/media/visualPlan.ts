import type { VisualPlan, VisualTile } from './visualTypes';

/** A source-time grid survives panning, placement and power-of-two zoom changes. */
export function planVisuals(plan: VisualPlan, kind: 'video' | 'audio'): VisualTile[] {
  const { asset, clip, viewport } = plan;
  if (!Number.isFinite(viewport.pixels) || viewport.pixels <= 0 || viewport.startMs >= viewport.endMs) return [];
  if (kind === 'video' ? !asset.hasVideo : !asset.hasAudio) return [];
  const start = Math.max(0, clip.sourceInMs, clip.sourceInMs + viewport.startMs - clip.startMs);
  const end = Math.min(asset.durationMs, clip.sourceInMs + clip.durationMs, clip.sourceInMs + viewport.endMs - clip.startMs);
  if (start >= end) return [];
  const target = kind === 'video' ? 96 : 1.5;
  const step = Math.max(1, 2 ** Math.ceil(Math.log2(target * 1000 / viewport.pixels)));
  const span = kind === 'video' ? step : Math.min(120_000, step * 128);
  const tiles: VisualTile[] = [];
  for (let time = Math.floor(start / span) * span; time < end && tiles.length < 64; time += span) {
    const sourceEnd = Math.min(asset.durationMs, time + span);
    const request = kind === 'video' ? { kind, positionMs: asset.isImage ? 0 : time } as const : { kind, startMs: time, endMs: sourceEnd, stepMs: step } as const;
    // Rendering full tiles under the clip's native clip preserves exact trim placement.
    tiles.push({ id: `${kind}:${time}:${step}`, startMs: time, endMs: sourceEnd, x: (time - clip.sourceInMs) / 1000 * viewport.pixels,
      width: (sourceEnd - time) / 1000 * viewport.pixels, request });
  }
  return tiles;
}
