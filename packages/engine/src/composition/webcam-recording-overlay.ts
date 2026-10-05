import { CompositionEngineError, MIN_CLIP_DURATION_MS } from '../commands/clip-engine';
import { cameraLayoutTransform } from './camera-layout';
import { recordingMediaOwner } from './recording-media-links';
import { isCompositingClip, type ClipComposition, type VisualClip } from '../shared/composition-types';
import { forkComposition } from '../document/immutable-document';
import { normalizeClipOrders } from '../commands/visual-track-layout';
import { validateSceneEdit } from '../scene/scene-edit';
import type { WebcamRecordingOverlayRequest } from './webcam-recording-overlay-types';

export function webcamRecordingTarget(composition: ClipComposition, selectedClipId: string | null, timeMs: number) {
  const screens = composition.clips.filter(
    (clip): clip is VisualClip =>
      clip.kind === 'screen' &&
      clip.enabled &&
      Boolean(composition.assets.find((asset) => asset.id === clip.assetId)?.sessionId),
  );
  return (
    screens.find((screen) => screen.id === selectedClipId) ??
    screens.find(
      (screen) => timeMs >= screen.timelineStartMs && timeMs < screen.timelineStartMs + screen.timelineDurationMs,
    ) ??
    screens[0] ??
    null
  );
}

export function hasRecordingWebcam(composition: ClipComposition, screen: VisualClip) {
  return composition.clips.some(
    (clip) => clip.kind === 'webcam' && recordingMediaOwner(composition, clip)?.id === screen.id,
  );
}

/** Repeat a short project video on one webcam lane, preserving explicit recording links and real source bounds. */
export function attachWebcamRecordingOverlay(composition: ClipComposition, request: WebcamRecordingOverlayRequest) {
  const screen = composition.clips.find(
    (clip): clip is VisualClip => clip.id === request.screenClipId && clip.kind === 'screen',
  );
  const sessionId = screen && composition.assets.find((asset) => asset.id === screen.assetId)?.sessionId;
  if (!screen || !sessionId || screen.locked || !screen.enabled || hasRecordingWebcam(composition, screen))
    throw new CompositionEngineError('The recording cannot accept another webcam overlay.');
  if (
    request.asset.kind !== 'video' ||
    !Number.isFinite(request.asset.durationMs) ||
    request.asset.durationMs / screen.playbackRate < MIN_CLIP_DURATION_MS * 2
  )
    throw new CompositionEngineError('A webcam overlay requires a playable video.');
  // Project storage rounds milliseconds. Split on that same clock so rounding
  // each fragment cannot turn a shared boundary into a one-millisecond overlap.
  const timelineStartMs = Math.round(screen.timelineStartMs);
  const timelineDurationMs = Math.round(screen.timelineDurationMs);
  const maxDurationMs = Math.floor(request.asset.durationMs / screen.playbackRate);
  const count = Math.ceil(timelineDurationMs / maxDurationMs);
  const trackId = `webcam:${crypto.randomUUID()}`;
  const asset = { ...request.asset, id: `webcam-asset:${crypto.randomUUID()}`, sessionId };
  const order = Math.min(0, ...composition.clips.filter(isCompositingClip).map((clip) => clip.order)) - 1;
  const clips: VisualClip[] = Array.from({ length: count }, (_, index) => {
    const startOffsetMs = Math.round((index * timelineDurationMs) / count);
    const endOffsetMs = Math.round(((index + 1) * timelineDurationMs) / count);
    const startMs = timelineStartMs + startOffsetMs;
    const durationMs = endOffsetMs - startOffsetMs;
    return {
      id: crypto.randomUUID(),
      kind: 'webcam',
      name: request.name,
      assetId: asset.id,
      trackId,
      recordingClipId: screen.id,
      timelineStartMs: startMs,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs * screen.playbackRate,
      playbackRate: screen.playbackRate,
      transitions: { entry: null, exit: null },
      enabled: true,
      order,
      transform: cameraLayoutTransform('floating-bottom-right'),
      appearance: structuredClone(request.appearance),
      isMirrored: false,
      isMirroredY: false,
      cameraLayoutPreset: 'floating-bottom-right',
      cameraFramingPreset: 'squircle',
      cameraSplitRatio: 0.5,
      cameraSplitPadding: 0,
      reactToZoom: true,
    };
  });
  const next = forkComposition(composition);
  next.assets = [...next.assets, asset];
  next.clips = normalizeClipOrders([...next.clips, ...clips]);
  validateSceneEdit(next, composition);
  return next;
}
