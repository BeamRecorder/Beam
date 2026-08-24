import { captionLayerKey, isTextCaptionClip, type CaptionClip, type Clip } from '~/media/shared/composition-types';
import { normalizeClipOrders } from './visual-track-layout';

export interface TextCaptionLayer {
  id: string;
  clips: CaptionClip[];
  representative: CaptionClip;
  order: number;
}

export const groupTextCaptionLayers = (clips: CaptionClip[]): TextCaptionLayer[] => {
  const grouped = new Map<string, CaptionClip[]>();
  for (const clip of [...clips].sort((left, right) => left.order - right.order)) {
    const id = captionLayerKey(clip);
    const layer = grouped.get(id);
    if (layer) layer.push(clip);
    else grouped.set(id, [clip]);
  }
  return [...grouped].map(([id, layerClips]) => ({
    id,
    clips: layerClips,
    representative: layerClips[0]!,
    order: layerClips[0]!.order,
  }));
};

/** Reorders logical text layers inside their existing caption slots, leaving every other category fixed. */
export const reorderTextCaptionOrders = (clips: Clip[], clipId: string, targetIndex: number): Clip[] | null => {
  if (!Number.isInteger(targetIndex)) return null;
  const ordered = normalizeClipOrders(clips);
  const layers = groupTextCaptionLayers(ordered.filter(isTextCaptionClip));
  const sourceIndex = layers.findIndex((layer) => layer.clips.some((clip) => clip.id === clipId));
  if (sourceIndex < 0) return null;

  const [source] = layers.splice(sourceIndex, 1);
  layers.splice(Math.max(0, Math.min(layers.length, targetIndex)), 0, source!);
  const captionOrderSlots = groupTextCaptionLayers(ordered.filter(isTextCaptionClip)).map((layer) => layer.order);
  const orderById = new Map(
    layers.flatMap((layer, index) => layer.clips.map((clip) => [clip.id, captionOrderSlots[index]!] as const)),
  );

  return normalizeClipOrders(
    ordered.map((clip) => (isTextCaptionClip(clip) ? { ...clip, order: orderById.get(clip.id)! } : clip)),
  );
};
