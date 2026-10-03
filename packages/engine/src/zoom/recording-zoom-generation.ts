import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { CursorTelemetryPoint } from '@beam/engine/capture/capture-session';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { recordingFocus } from './recording-focus';
import { compileSceneComposition } from '../scene/scene-clock';
import { createSceneAnimator } from '../scene/scene-animation';
import { createScenePointMapper } from '../scene/scene-spatial';
import { buildAutomaticGlassElements } from './glass-generation';
import type { ZoomGenerationOptions } from './glass-generation-types';
import { buildAutomaticZoomElements } from '@beam/engine/zoom/zoom-suggestions';

export function generateRecordingZooms(
  composition: ClipComposition,
  sessionId: string,
  telemetry: CursorTelemetryPoint[],
  reserved: ZoomElement[],
  options?: ZoomGenerationOptions,
): ZoomElement[] {
  composition = compileSceneComposition(composition);
  const animate = createSceneAnimator(composition);
  const scenePoint = options ? createScenePointMapper(composition, options.canvas.width, options.canvas.height) : null;
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
    if (clip.kind !== 'screen' || clip.enabled === false || !assets.has(clip.assetId)) return [];
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
    let generated: ZoomElement[];
    if (options?.style === 'glass') {
      const asset = composition.assets.find((asset) => asset.id === clip.assetId)!;
      if (!asset.width || !asset.height) throw new Error('Automatic lenses require recording dimensions.');
      const { width, height } = options.canvas;
      const mapped = samples.flatMap((point) => {
        const time = clip.timelineStartMs + point.timeMs;
        const focus = recordingFocus(animate(clip, time), point, asset.width!, asset.height!, options.canvas);
        return focus ? [{ ...point, ...scenePoint!(clip.id, focus, time) }] : [];
      });
      generated = buildAutomaticGlassElements({
        sessionId,
        telemetry: mapped,
        durationMs,
        width,
        height,
        reserved: occupied,
      });
    } else generated = buildAutomaticZoomElements({ sessionId, telemetry: samples, durationMs, reserved: occupied });
    return generated.map((zoom) => ({
      ...zoom,
      ...(options?.style === '3d' ? { projection: '3d' as const } : {}),
      id: allocateId(`${zoom.id}:${clip.id}`),
      linkedClipId: clip.id,
      startMs: zoom.startMs + clip.timelineStartMs,
      endMs: zoom.endMs + clip.timelineStartMs,
    }));
  });
}
