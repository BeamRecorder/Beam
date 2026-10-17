import { isVisualClip, type ClipComposition } from '@beam/runtime/shared/index';

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
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const assetIds = [
    ...new Set(composition.clips.flatMap((clip) => (clip.kind === 'audio' ? [clip.assetId] : []))),
  ].sort();
  return JSON.stringify(
    assetIds.map((assetId) => {
      const asset = assets.get(assetId);
      return { assetId, kind: asset?.kind, src: asset?.src };
    }),
  );
}

/** Fingerprints describe what was loaded, independently of later host mutations. */
export class PlaybackCompositionTopology {
  private video = '';
  private audio = '';

  capture(composition: ClipComposition) {
    this.video = videoPlaybackTopology(composition);
    this.audio = audioPlaybackTopology(composition);
  }

  matchesVideo(composition: ClipComposition) {
    return this.video === videoPlaybackTopology(composition);
  }

  updateAudio(composition: ClipComposition) {
    const next = audioPlaybackTopology(composition);
    const changed = this.audio !== next;
    this.audio = next;
    return changed;
  }
}
