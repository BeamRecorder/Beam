import { isVisualClip, type ClipComposition } from '@beam/runtime/shared/index';

export function videoPlaybackTopology(composition: ClipComposition): string {
  const assetIds = new Set(videoBindings(composition).values());
  const assets = composition.assets
    .filter((asset) => assetIds.has(asset.id))
    .map((asset) => ({ id: asset.id, kind: asset.kind, src: asset.src }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ assetIds: [...assetIds].sort(), assets });
}

const videoBindings = (composition: ClipComposition) =>
  new Map(
    composition.clips.flatMap((clip) => {
      if (isVisualClip(clip) && clip.kind !== 'image') return [[clip.id, clip.assetId] as const];
      return [];
    }),
  );

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
  private bindings = new Map<string, string>();

  capture(composition: ClipComposition) {
    this.video = videoPlaybackTopology(composition);
    this.audio = audioPlaybackTopology(composition);
    this.bindings = videoBindings(composition);
  }

  matchesVideo(composition: ClipComposition) {
    return (
      this.video === videoPlaybackTopology(composition) &&
      [...videoBindings(composition)].every(
        ([id, assetId]) => !this.bindings.has(id) || this.bindings.get(id) === assetId,
      )
    );
  }

  updateForRetime(composition: ClipComposition) {
    this.bindings = videoBindings(composition);
    const next = audioPlaybackTopology(composition);
    const changed = this.audio !== next;
    this.audio = next;
    return changed;
  }
}
