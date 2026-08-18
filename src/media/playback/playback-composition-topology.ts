import { isVisualClip, type ClipComposition } from '../shared';

export function videoPlaybackTopology(composition: ClipComposition): string {
  const clips = composition.clips
    .flatMap((clip) => {
      if (isVisualClip(clip) && clip.kind !== 'image') return [{ id: clip.id, assetId: clip.assetId }];
      return [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const assetIds = new Set(clips.map((clip) => clip.assetId));
  const assets = composition.assets
    .filter((asset) => assetIds.has(asset.id))
    .map((asset) => ({ id: asset.id, kind: asset.kind, src: asset.src }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ clips, assets });
}

export function audioPlaybackTopology(composition: ClipComposition): string {
  const assetIds = [
    ...new Set(composition.clips.flatMap((clip) => (clip.kind === 'audio' ? [clip.assetId] : []))),
  ].sort();
  return JSON.stringify(
    assetIds.map((assetId) => {
      const asset = composition.assets.find((entry) => entry.id === assetId);
      return { assetId, kind: asset?.kind, src: asset?.src };
    }),
  );
}
