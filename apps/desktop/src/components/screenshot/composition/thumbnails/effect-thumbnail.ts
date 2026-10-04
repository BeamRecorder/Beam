import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { LayerThumbnail } from './thumbnail-types';
export const effectThumbnailId = (layerId: string, effectId: string): string =>
  `effect:${JSON.stringify([layerId, effectId])}`;
export function compositionThumbnailIds(layers: readonly ScreenshotLayer[]): Set<string> {
  return new Set(
    layers.flatMap((layer) => [
      layer.id,
      ...(layer.effects ?? []).map((effect) => effectThumbnailId(layer.id, effect.id)),
    ]),
  );
}
export function effectThumbnailRevision(layer: ScreenshotLayer, thumbnails: Record<string, LayerThumbnail>): string {
  return (layer.effects ?? [])
    .map((effect) => {
      const thumbnail = thumbnails[effectThumbnailId(layer.id, effect.id)];
      return thumbnail ? `${thumbnail.revision}:${thumbnail.status}` : '';
    })
    .join('|');
}
