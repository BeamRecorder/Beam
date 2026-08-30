import type { ProjectEditorData, SessionTrackAsset, SessionTrackData } from '../../../api/types/capture-api';
import {
  COMPOSITION_SCHEMA_VERSION,
  SCREEN_CLIP_ID,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
  isVisualClip,
} from '~/media/shared/composition-types';
import { createComposition, setCameraLayout, updateClip } from './engine/clip-engine';
import { keyboardCaptionClipsFromInput } from '~/media/shared/keyboard-captions';
import type { EditorPreferenceDefaults } from '../composables/editor-default-types';
import {
  audioDefaultsFor,
  captionDefaultsFor,
  normalizeEditorPreferenceDefaults,
  visualClipDefaultProps,
} from '../composables/editor-defaults';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { cameraScreenPartner } from './camera-screen-link';
import { cameraLayoutTransform } from './camera-layout';

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
  editorDefaults: EditorPreferenceDefaults,
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
    transitions: { entry: null, exit: null },
    enabled: true,
    order,
  } as const;
  if (track.kind === 'system-audio' || track.kind === 'microphone') {
    return {
      ...common,
      kind: 'audio',
      assetId: id,
      role: track.kind === 'system-audio' ? 'system' : 'microphone',
      volume: audioDefaultsFor(editorDefaults).volume,
    } satisfies AudioClip;
  }
  const kind = track.kind === 'camera' ? 'webcam' : 'screen';
  const defaults = visualClipDefaultProps(editorDefaults, kind, durationMs);
  return {
    ...common,
    kind,
    trackId: `session:${editorData.sessionId}:track:${track.trackId}`,
    assetId: id,
    ...defaults,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    ...(track.kind === 'camera' && !editorDefaults.visual?.webcam ? { transform: placement(track) } : {}),
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
  defaults: EditorPreferenceDefaults = normalizeEditorPreferenceDefaults(undefined),
): ClipComposition {
  const input = composition as ClipComposition & {
    schemaVersion?: number;
    assets?: MediaAsset[];
    clips?: Clip[];
    keyboardCaptionSessions?: string[];
  };
  const canonicalComposition =
    input.schemaVersion === COMPOSITION_SCHEMA_VERSION &&
    Array.isArray(input.assets) &&
    Array.isArray(input.clips) &&
    Array.isArray(input.keyboardCaptionSessions)
      ? composition
      : createComposition(
          Array.isArray(input.assets) ? input.assets : [],
          Array.isArray(input.clips) ? input.clips : [],
          Array.isArray(input.keyboardCaptionSessions) ? input.keyboardCaptionSessions : [],
        );
  if (!editorData) return canonicalComposition;
  const assets = new Map(canonicalComposition.assets.map((asset) => [asset.id, asset]));
  const clips = [...canonicalComposition.clips];
  const existingIds = new Set(clips.map((clip) => clip.id));
  const fallbackEndNs = editorData.manifest.durationNs;
  const candidates: Clip[] = [];
  const keyboardCaptionSessions = [...canonicalComposition.keyboardCaptionSessions];
  let assetsChanged = false;
  let hasKnownScreenSource = false;

  for (const track of editorData.tracks) {
    if (!['screen', 'camera', 'system-audio', 'microphone'].includes(track.kind) || track.status === 'failed') continue;
    for (const segment of track.assets) {
      if (!segment.complete || !segment.exists || !segment.src) continue;
      const durationMs = safeDuration(segment, fallbackEndNs);
      const asset = sessionAsset(editorData, track, segment, durationMs);
      const sourceWasAlreadyMaterialized = assets.has(asset.id);
      if (track.kind === 'screen' && sourceWasAlreadyMaterialized) hasKnownScreenSource = true;
      if (!sourceWasAlreadyMaterialized) {
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
      const clip = sessionClip(editorData, track, segment, durationMs, priority + candidates.length, defaults);
      // A split or trimmed recording no longer owns the canonical source clip
      // id, but it still references the immutable session asset. Treat that
      // asset as the synchronization marker so reload never restores a second,
      // overlapping full-length clip on top of the user's edited fragments.
      if (!sourceWasAlreadyMaterialized && !existingIds.has(clip.id)) candidates.push(clip);
    }
  }

  if (
    !candidates.some((clip) => clip.kind === 'screen') &&
    !clips.some((clip) => clip.kind === 'screen') &&
    !hasKnownScreenSource &&
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
      trackId: `session:${editorData.sessionId}:track:screen`,
      kind: 'screen',
      name: 'Screen recording',
      assetId: asset.id,
      timelineStartMs: 0,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs,
      enabled: true,
      order: 30_000,
      ...visualClipDefaultProps(defaults, 'screen', durationMs),
      playbackRate: 1,
      transitions: { entry: null, exit: null },
    });
  }

  const sessionHasMaterializedSource =
    Boolean(editorData.videoSrc) ||
    editorData.tracks.some((track) =>
      track.assets.some((asset) => asset.complete && asset.exists && Boolean(asset.src)),
    );
  if (sessionHasMaterializedSource && !keyboardCaptionSessions.includes(editorData.sessionId)) {
    if (editorData.recordedPlatform && editorData.interactions) {
      const keyboardCaptions = keyboardCaptionClipsFromInput(
        editorData.interactions,
        editorData.sessionId,
        editorData.recordedPlatform,
      );
      if (keyboardCaptions.length > 0) keyboardCaptionSessions.push(editorData.sessionId);
      for (const clip of keyboardCaptions) {
        const captionDefaults = captionDefaultsFor(defaults, clip.caption.style.fontSize);
        clip.caption.style = captionDefaults.style;
        if (captionDefaults.transform) clip.transform = captionDefaults.transform;
        if (!existingIds.has(clip.id)) candidates.push(clip);
      }
    }
  }

  const groups = new Map<string, Clip[]>();
  for (const clip of candidates) {
    if (clip.kind === 'caption') continue;
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

  if (
    !assetsChanged &&
    candidates.length === 0 &&
    keyboardCaptionSessions.length === canonicalComposition.keyboardCaptionSessions.length
  )
    return canonicalComposition;
  let next = createComposition([...assets.values()], [...clips, ...candidates], keyboardCaptionSessions);
  for (const candidate of candidates) {
    if (!isVisualClip(candidate) || candidate.kind !== 'webcam') continue;
    const preset = candidate.cameraLayoutPreset;
    if (!preset || preset === 'custom' || !isSplitCameraLayout(preset)) continue;
    if (cameraScreenPartner(next, candidate, true)) {
      next = setCameraLayout(next, candidate.id, preset);
      continue;
    }
    next = updateClip(next, candidate.id, (clip) =>
      isVisualClip(clip)
        ? {
            ...clip,
            cameraLayoutPreset: 'floating-bottom-right',
            transform: cameraLayoutTransform('floating-bottom-right'),
          }
        : clip,
    );
  }
  return next;
}
