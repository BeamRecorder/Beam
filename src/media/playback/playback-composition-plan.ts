import {
  MediaInputError,
  isVisualClip,
  mediaSourceDescriptor,
  type ClipComposition,
  type MediaError,
  type MediaSourceDescriptor,
} from '../shared';
import type { PlaybackClipDescriptor } from './playback-types';

const playbackError = (error: unknown, sourceId: string): MediaError =>
  error instanceof MediaInputError
    ? error.detail
    : { kind: 'decode-failure', sourceId, message: error instanceof Error ? error.message : 'Playback failed.' };

export function videoPlaybackPlan(composition: ClipComposition): {
  clips: PlaybackClipDescriptor[];
  assets: MediaSourceDescriptor[];
  issues: MediaError[];
} {
  const requestedClips = composition.clips.flatMap((clip) => {
    if (!clip.enabled || !isVisualClip(clip) || clip.kind === 'image') return [];
    return [
      {
        clipId: clip.id,
        assetId: clip.assetId,
        timelineStartSeconds: clip.timelineStartMs / 1_000,
        timelineDurationSeconds: clip.timelineDurationMs / 1_000,
        sourceInSeconds: clip.sourceInMs / 1_000,
        playbackRate: clip.playbackRate,
      },
    ];
  });
  const requestedAssetIds = new Set(
    composition.clips.flatMap((clip) => (isVisualClip(clip) && clip.kind !== 'image' ? [clip.assetId] : [])),
  );
  const assetsById = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const descriptors = new Map<string, MediaSourceDescriptor>();
  const issues = new Map<string, MediaError>();
  for (const assetId of requestedAssetIds) {
    const asset = assetsById.get(assetId);
    if (!asset) {
      issues.set(assetId, {
        kind: 'missing',
        sourceId: assetId,
        message: 'A playback clip references a missing media asset.',
      });
      continue;
    }
    try {
      const descriptor = mediaSourceDescriptor(asset);
      if (descriptor.kind !== 'video') throw new Error('The playback asset is not a video.');
      descriptors.set(assetId, descriptor);
    } catch (error) {
      issues.set(assetId, playbackError(error, assetId));
    }
  }
  return {
    assets: [...descriptors.values()],
    clips: requestedClips.filter((clip) => descriptors.has(clip.assetId)),
    issues: [...issues.values()],
  };
}
