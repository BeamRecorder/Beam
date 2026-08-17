import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';

export const cameraScreenCanShareGroup = (left: VisualClip, right: VisualClip) =>
  left.timelineStartMs === right.timelineStartMs &&
  left.timelineDurationMs === right.timelineDurationMs &&
  left.playbackRate === right.playbackRate;

const timelineRangesOverlap = (left: VisualClip, right: VisualClip) =>
  left.timelineStartMs < right.timelineStartMs + right.timelineDurationMs &&
  right.timelineStartMs < left.timelineStartMs + left.timelineDurationMs;

export function cameraScreenPartner(
  composition: ClipComposition,
  camera: VisualClip,
  includeCompatibleRecording = false,
): VisualClip | undefined {
  if (camera.kind !== 'webcam') return undefined;
  const linked = camera.groupId
    ? composition.clips.find((clip): clip is VisualClip => clip.kind === 'screen' && clip.groupId === camera.groupId)
    : undefined;
  if (linked || !includeCompatibleRecording) return linked;

  const cameraAsset = composition.assets.find((asset) => asset.id === camera.assetId);
  if (cameraAsset?.origin !== 'session' || !cameraAsset.sessionId) return undefined;
  const candidates = composition.clips.filter((clip): clip is VisualClip => {
    if (clip.kind !== 'screen' || !timelineRangesOverlap(camera, clip)) return false;
    if (camera.groupId && clip.groupId && camera.groupId !== clip.groupId) return false;
    const asset = composition.assets.find((entry) => entry.id === clip.assetId);
    return asset?.origin === 'session' && asset.sessionId === cameraAsset.sessionId;
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
