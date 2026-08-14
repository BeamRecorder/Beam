import { compositionDurationMs } from '~/media/shared';
import {
  isAudioClip,
  isVisualClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
} from '~/media/shared/composition-types';

type PlaybackClipSignature = {
  id: string;
  kind: string;
  assetId: string;
  timelineStartMs: number;
  timelineDurationMs: number;
  sourceInMs: number;
  sourceDurationMs: number;
  playbackRate: number;
  volume?: number;
};

const playbackAsset = (asset: MediaAsset) => ({
  id: asset.id,
  kind: asset.kind,
  name: asset.name,
  src: asset.src,
});

const playbackClip = (clip: Clip): PlaybackClipSignature | null => {
  if (!clip.enabled) return null;
  if (!isAudioClip(clip) && (!isVisualClip(clip) || clip.kind === 'image')) return null;
  return {
    id: clip.id,
    kind: clip.kind,
    assetId: clip.assetId,
    timelineStartMs: clip.timelineStartMs,
    timelineDurationMs: clip.timelineDurationMs,
    sourceInMs: clip.sourceInMs,
    sourceDurationMs: clip.sourceDurationMs,
    playbackRate: clip.playbackRate,
    ...(isAudioClip(clip) ? { volume: clip.volume } : {}),
  };
};

export function compositionPlaybackSignature(composition: ClipComposition): string {
  const clips = composition.clips
    .map(playbackClip)
    .filter((clip): clip is PlaybackClipSignature => clip !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const requiredAssets = new Set(clips.map((clip) => clip.assetId));
  const assets = composition.assets
    .filter((asset) => requiredAssets.has(asset.id))
    .map(playbackAsset)
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify({
    schemaVersion: composition.schemaVersion,
    durationMs: compositionDurationMs(composition),
    assets,
    clips,
  });
}
