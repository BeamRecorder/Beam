import type { ClipComposition } from '~/media/shared/composition-types';
import type { CursorTelemetryPoint } from '~/api/types/capture-session';
import type { ZoomElement } from './zoom-types';
import { buildAutomaticZoomElements } from './zoom-suggestions';

export function generateRecordingZooms(
  composition: ClipComposition,
  sessionId: string,
  telemetry: CursorTelemetryPoint[],
  reserved: ZoomElement[],
): ZoomElement[] {
  const assets = new Set(composition.assets.filter((asset) => asset.sessionId === sessionId).map((asset) => asset.id));
  const ids = new Set(reserved.map((zoom) => zoom.id));
  const allocateId = (base: string) => {
    let id = base;
    let suffix = 1;
    while (ids.has(id)) id = `${base}:${suffix++}`;
    ids.add(id);
    return id;
  };
  return composition.clips.flatMap((clip) => {
    if (clip.kind !== 'screen' || !assets.has(clip.assetId)) return [];
    const rate = clip.playbackRate;
    const durationMs = clip.timelineDurationMs;
    const samples = telemetry
      .filter((point) => point.timeMs >= clip.sourceInMs && point.timeMs < clip.sourceInMs + clip.sourceDurationMs)
      .map((point) => ({ ...point, timeMs: (point.timeMs - clip.sourceInMs) / rate }));
    const occupied = reserved
      .filter((zoom) => zoom.startMs < clip.timelineStartMs + durationMs && zoom.endMs > clip.timelineStartMs)
      .map((zoom) => ({
        ...zoom,
        startMs: Math.max(0, zoom.startMs - clip.timelineStartMs),
        endMs: Math.min(durationMs, zoom.endMs - clip.timelineStartMs),
      }));
    return buildAutomaticZoomElements({ sessionId, telemetry: samples, durationMs, reserved: occupied }).map(
      (zoom) => ({
        ...zoom,
        id: allocateId(`${zoom.id}:${clip.id}`),
        linkedClipId: clip.id,
        startMs: zoom.startMs + clip.timelineStartMs,
        endMs: zoom.endMs + clip.timelineStartMs,
      }),
    );
  });
}
