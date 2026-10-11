import { captionLayerKey, isCaptionClip, type CaptionClip } from '@beam/engine/shared/composition-types';
import { TimelineLockedError } from '@beam/engine/composition/timeline-locks';
import type { CaptionPastePlacementOptions } from './timeline-clipboard-types';

/** Keep text copies on their source layer; the paste transaction trims any covered content. */
export function resolveCaptionPastePlacement(options: CaptionPastePlacementOptions) {
  const layerIds = new Map<string, string>();
  const copiedLayers = new Map<string, CaptionClip[]>();
  for (const clip of options.captions) {
    if (options.placement !== 'auto' && options.placement !== 'new-layer' && clip.caption.type !== 'text') continue;
    const key = captionLayerKey(clip);
    const layer = copiedLayers.get(key);
    if (layer) layer.push(clip);
    else copiedLayers.set(key, [clip]);
  }
  if (!copiedLayers.size) return { composition: options.composition, layerIds };
  const existingLayers = new Map<string, CaptionClip[]>();
  const originalsById = new Map<string, CaptionClip>();
  for (const clip of options.composition.clips) {
    if (!isCaptionClip(clip)) continue;
    originalsById.set(clip.id, clip);
    const key = captionLayerKey(clip);
    const layer = existingLayers.get(key);
    if (layer) layer.push(clip);
    else existingLayers.set(key, [clip]);
  }

  const reusedLegacyLayers = new Set<string>();
  for (const [key, copied] of copiedLayers) {
    const original = originalsById.get(copied[0]!.id);
    // A previous paste may already have assigned a shared ID to this legacy source.
    const source = !copied[0]!.captionLayerId && original?.captionLayerId ? original : copied[0]!;
    const assignedLegacyKey = captionLayerKey({ ...source, captionLayerId: source.id });
    const sourceKey =
      !source.captionLayerId && existingLayers.has(assignedLegacyKey) ? assignedLegacyKey : captionLayerKey(source);
    const existing = existingLayers.get(sourceKey) ?? [];
    const reuse = options.placement !== 'new-layer' && copied.every((clip) => clip.caption.type === 'text');
    if (reuse && existing.some((clip) => clip.locked)) throw new TimelineLockedError();
    layerIds.set(key, reuse ? (source.captionLayerId ?? source.id) : options.idFactory());
    if (reuse && !source.captionLayerId && sourceKey === key && existing.length) reusedLegacyLayers.add(sourceKey);
  }

  // Older manual captions used their clip ID as their lane. Give both originals and copies
  // an explicit shared layer ID; otherwise the new clip ID would silently create another row.
  const composition = reusedLegacyLayers.size
    ? {
        ...options.composition,
        clips: options.composition.clips.map((clip) =>
          isCaptionClip(clip) && reusedLegacyLayers.has(captionLayerKey(clip))
            ? { ...clip, captionLayerId: layerIds.get(captionLayerKey(clip))! }
            : clip,
        ),
      }
    : options.composition;
  return { composition, layerIds };
}
