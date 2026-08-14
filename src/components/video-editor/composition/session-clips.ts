import type { ProjectEditorData, SessionTrackAsset, SessionTrackData } from '../../../api/types/capture-api';
import {
  SCREEN_CLIP_ID,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import { createComposition } from './engine/clip-engine';

const milliseconds = (nanoseconds: number | null | undefined) =>
  Math.max(0, Math.round((nanoseconds ?? 0) / 1_000_000));

const safeDuration = (asset: SessionTrackAsset, fallbackEndNs: number) => {
  const endNs = asset.endNs ?? fallbackEndNs;
  return Math.max(40, milliseconds(endNs - asset.startNs));
};

const sourceId = (sessionId: string, track: SessionTrackData, asset: SessionTrackAsset) =>
  `session:${sessionId}:${track.kind}:${asset.path}`;

const dimensions = (track: SessionTrackData) => ({
  width: typeof track.format.width === 'number' ? track.format.width : null,
  height: typeof track.format.height === 'number' ? track.format.height : null,
});

const placement = (track: SessionTrackData) => {
  const value = track.format.placement;
  const fallback = { x: 0.72, y: 0.72, width: 0.24, height: 0.24 };
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Record<string, unknown>;
  if (!['x', 'y', 'width', 'height'].every((key) => typeof input[key] === 'number' && Number.isFinite(input[key])))
    return fallback;
  const width = Math.max(0.001, Math.min(1, Number(input.width)));
  const height = Math.max(0.001, Math.min(1, Number(input.height)));
  return {
    x: Math.max(0, Math.min(1 - width, Number(input.x))),
    y: Math.max(0, Math.min(1 - height, Number(input.y))),
    width,
    height,
  };
};

const sessionAsset = (
  editorData: ProjectEditorData,
  track: SessionTrackData,
  segment: SessionTrackAsset,
  durationMs: number,
): MediaAsset => {
  const id = sourceId(editorData.sessionId, track, segment);
  const visual = track.kind === 'screen' || track.kind === 'camera';
  return {
    id,
    kind: visual ? 'video' : 'audio',
    name:
      track.kind === 'screen'
        ? 'Screen recording'
        : track.kind === 'camera'
          ? 'Webcam'
          : track.kind === 'system-audio'
            ? 'System audio'
            : 'Microphone',
    fileName: null,
    durationMs,
    ...dimensions(track),
    src: segment.src ?? '',
    origin: 'session',
    sessionId: editorData.sessionId,
    sessionPath: segment.path,
  };
};

const sessionClip = (
  editorData: ProjectEditorData,
  track: SessionTrackData,
  segment: SessionTrackAsset,
  durationMs: number,
  order: number,
): Clip => {
  const id = sourceId(editorData.sessionId, track, segment);
  const timelineStartMs = milliseconds(segment.startNs);
  const common = {
    id: track.kind === 'screen' && timelineStartMs === 0 ? SCREEN_CLIP_ID : `clip:${id}`,
    name:
      track.kind === 'screen'
        ? 'Screen recording'
        : track.kind === 'camera'
          ? 'Webcam'
          : track.kind === 'system-audio'
            ? 'System audio'
            : 'Microphone',
    timelineStartMs,
    timelineDurationMs: durationMs,
    sourceInMs: 0,
    sourceDurationMs: durationMs,
    playbackRate: 1,
    enabled: true,
    order,
  } as const;
  if (track.kind === 'system-audio' || track.kind === 'microphone') {
    return {
      ...common,
      kind: 'audio',
      assetId: id,
      role: track.kind === 'system-audio' ? 'system' : 'microphone',
      volume: 100,
    } satisfies AudioClip;
  }
  return {
    ...common,
    kind: track.kind === 'camera' ? 'webcam' : 'screen',
    assetId: id,
    transform: track.kind === 'camera' ? placement(track) : { x: 0, y: 0, width: 1, height: 1 },
  } satisfies VisualClip;
};

/**
 * Adds immutable recording sources to the canonical composition exactly once.
 * Existing clips are never overwritten, so trims, splits, moves and detaches are
 * preserved on subsequent loads.
 */
export function synchronizeRecordingClips(
  composition: ClipComposition,
  editorData: ProjectEditorData | null | undefined,
): ClipComposition {
  if (!editorData) return composition;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const clips = [...composition.clips];
  const existingIds = new Set(clips.map((clip) => clip.id));
  const fallbackEndNs = editorData.manifest.durationNs;
  const candidates: Clip[] = [];
  let assetsChanged = false;

  for (const track of editorData.tracks) {
    if (!['screen', 'camera', 'system-audio', 'microphone'].includes(track.kind) || track.status === 'failed') continue;
    for (const segment of track.assets) {
      if (!segment.complete || !segment.exists || !segment.src) continue;
      const durationMs = safeDuration(segment, fallbackEndNs);
      const asset = sessionAsset(editorData, track, segment, durationMs);
      if (!assets.has(asset.id)) {
        assets.set(asset.id, asset);
        assetsChanged = true;
      }
      const priority =
        track.kind === 'camera'
          ? 20_000
          : track.kind === 'screen'
            ? 30_000
            : track.kind === 'system-audio'
              ? 40_000
              : 50_000;
      const clip = sessionClip(editorData, track, segment, durationMs, priority + candidates.length);
      if (!existingIds.has(clip.id)) candidates.push(clip);
    }
  }

  if (
    !candidates.some((clip) => clip.kind === 'screen') &&
    !clips.some((clip) => clip.kind === 'screen') &&
    editorData.videoSrc
  ) {
    const durationMs = Math.max(40, milliseconds(editorData.manifest.durationNs));
    const asset: MediaAsset = {
      id: `session:${editorData.sessionId}:screen:primary`,
      kind: 'video',
      name: 'Screen recording',
      fileName: null,
      durationMs,
      width: null,
      height: null,
      src: editorData.videoSrc,
      origin: 'session',
      sessionId: editorData.sessionId,
      sessionPath: 'screen/primary',
    };
    assets.set(asset.id, asset);
    assetsChanged = true;
    candidates.push({
      id: SCREEN_CLIP_ID,
      kind: 'screen',
      name: 'Screen recording',
      assetId: asset.id,
      timelineStartMs: 0,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs,
      playbackRate: 1,
      enabled: true,
      order: 30_000,
      transform: { x: 0, y: 0, width: 1, height: 1 },
    });
  }

  const groups = new Map<string, Clip[]>();
  for (const clip of candidates) {
    const key = `${clip.timelineStartMs}:${clip.timelineDurationMs}`;
    const group = groups.get(key) ?? [];
    group.push(clip);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const groupId = `recording:${editorData.sessionId}:${key}`;
    group.forEach((clip) => {
      clip.groupId = groupId;
    });
  }

  if (!assetsChanged && candidates.length === 0) return composition;
  return createComposition([...assets.values()], [...clips, ...candidates]);
}
