import { onUnmounted, watch } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import { requestEditorImage } from '../../resources/editor-image-cache';

/** Share image loading without creating the media painter's GPU/editing scope. */
export function useCompositionImages(composition: () => ClipComposition, onRenderOnce: () => void) {
  const images = new Map<string, HTMLImageElement>();
  const sources = new Map<string, string>();
  const reconcile = () => {
    const assets = new Map(composition().assets.map((asset) => [asset.id, asset]));
    for (const id of images.keys())
      if (assets.get(id)?.kind !== 'image' || assets.get(id)?.src !== sources.get(id)) {
        images.delete(id);
        sources.delete(id);
      }
    for (const asset of assets.values()) {
      if (asset.kind === 'image' && asset.src && !images.has(asset.id)) {
        const { image, ready } = requestEditorImage(asset.src);
        sources.set(asset.id, asset.src);
        images.set(asset.id, image);
        void ready
          .then(() => {
            if (images.get(asset.id) === image) onRenderOnce();
          })
          .catch((reason: unknown) => {
            if (images.get(asset.id) !== image) return;
            // Retain this failed source until it changes, avoiding a decode on every reconciliation.
            console.error('[Beam media:editor] image loading failed.', reason);
          });
      }
    }
  };
  watch(
    () =>
      composition()
        .assets.map((asset) => `${asset.id}:${asset.kind}:${asset.src}`)
        .join('|'),
    reconcile,
    { immediate: true },
  );

  onUnmounted(() => {
    images.clear();
    sources.clear();
  });
  return images;
}
