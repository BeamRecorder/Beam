import { watch, onScopeDispose, type Ref } from 'vue';
import { capture } from '~/api/capture';
import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import { sourceTimeAt } from '@beam/engine/shared/timeline-mapping';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { HtmlPreviewFrame } from './html-preview-types';
import { createHtmlPreview } from './html-preview';

export function useHtmlPreview(
  composition: Ref<ClipComposition>,
  currentTime: Ref<number>,
  changed: () => void,
  failed: (error: unknown) => void,
) {
  const preview = createHtmlPreview({
    render: (html, timeMs) => capture.renderHtmlFrame(html, timeMs),
    decode: (bytes) => createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })),
    changed,
    failed,
  });
  let resolve = createCompositionSceneLayerResolver(composition.value);
  const update = () => {
    const timeMs = currentTime.value * 1000;
    const assets = new Map(composition.value.assets.map((asset) => [asset.id, asset]));
    const frames: HtmlPreviewFrame[] = [];
    for (const clip of resolve(timeMs).cameraVisuals) {
      const html = assets.get(clip.assetId)?.html;
      const sourceMs = sourceTimeAt(clip, timeMs);
      if (!html || sourceMs === null) continue;
      frames.push({
        clipId: clip.id,
        html,
        timeMs:
          html.durationMs === 0
            ? 0
            : Math.min(html.durationMs, (Math.floor((sourceMs * html.fps) / 1000) * 1000) / html.fps),
      });
    }
    preview.update(frames);
  };
  watch(
    composition,
    () => {
      resolve = createCompositionSceneLayerResolver(composition.value);
      update();
    },
    { deep: true },
  );
  watch(currentTime, update, { immediate: true });
  onScopeDispose(preview.dispose);
  return preview;
}
