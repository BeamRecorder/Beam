import { compileSceneComposition } from '../../scene/scene-clock';
import { buildInteractionZoomSuggestions } from '../recordly/timeline/zoomSuggestionUtils';
import { recordlyTelemetry } from './recordly-inputs';
import { normalizeRecordlyZoom } from '../recordly-settings-schema.js';
import type { RecordlyZoomSettings } from '../recordly-settings-types';
import type { ClipComposition } from '../../shared/composition-types';
import type { CursorTelemetryPoint, CursorEvent } from '../../capture/capture-session';
import type { ZoomElement } from '../zoom-types';
import { compositionDurationMs } from '../../shared/timeline-mapping';
import { experimentalTelemetry } from './experimental-zoom-actions';

/** Adapt source-session clocks to the reference's independent clip intervals. */
export function experimentalRecordingZoomPlan(
  composition: ClipComposition,
  sessionId: string,
  telemetry: readonly CursorTelemetryPoint[],
  reserved: readonly ZoomElement[],
  events?: readonly CursorEvent[],
  settings?: RecordlyZoomSettings,
) {
  composition = compileSceneComposition(composition);
  const durationMs = compositionDurationMs(composition);
  const assets = new Map(
    composition.assets.filter((asset) => asset.sessionId === sessionId).map((asset) => [asset.id, asset]),
  );
  const clips = composition.clips
    .toSorted((left, right) => left.timelineStartMs - right.timelineStartMs)
    .flatMap((clip) => {
      const asset = 'assetId' in clip ? assets.get(clip.assetId) : undefined;
      if (clip.kind !== 'screen' || clip.enabled === false || clip.freezeFrameSourceMs !== undefined || !asset)
        return [];
      return [
        {
          id: clip.id,
          startMs: clip.timelineStartMs,
          endMs: clip.timelineStartMs + clip.timelineDurationMs,
          sourceStartMs: (asset.sessionStartMs ?? 0) + clip.sourceInMs,
          speed: clip.playbackRate,
        },
      ];
    });
  if (!clips.length) return { elements: [] as ZoomElement[], status: 'no-slots' as const };
  const result = buildInteractionZoomSuggestions({
    cursorTelemetry: recordlyTelemetry(experimentalTelemetry(telemetry, events)),
    totalMs: durationMs,
    clipRegions: clips,
    reservedSpans: reserved.map((zoom) => ({ start: zoom.startMs, end: zoom.endMs })),
    defaultDurationMs: Math.min(normalizeRecordlyZoom(settings).defaultDurationMs, durationMs),
  });
  const ids = new Set(reserved.map((zoom) => zoom.id));
  const elements: ZoomElement[] = result.suggestions.map((suggestion) => {
    const startMs = Math.round(suggestion.start),
      endMs = Math.round(suggestion.end);
    const clip = clips.find((clip) => suggestion.start >= clip.startMs && suggestion.end <= clip.endMs)!;
    const base = `experimental:${sessionId}:${clip.id}:${startMs}:${endMs}`;
    let id = base,
      suffix = 1;
    while (ids.has(id)) id = `${base}:${suffix++}`;
    ids.add(id);
    return {
      id,
      sessionId,
      linkedClipId: clip.id,
      startMs,
      endMs,
      focus: { ...suggestion.focus },
      depth: 3,
      mode: 'auto',
      projection: '2d',
      focusSpace: 'source',
      generation: 'automatic',
    };
  });
  return { elements, status: result.status };
}

export function experimentalRecordingZooms(
  composition: ClipComposition,
  sessionId: string,
  telemetry: readonly CursorTelemetryPoint[],
  reserved: readonly ZoomElement[],
  events?: readonly CursorEvent[],
  settings?: RecordlyZoomSettings,
): ZoomElement[] {
  return experimentalRecordingZoomPlan(composition, sessionId, telemetry, reserved, events, settings).elements;
}
