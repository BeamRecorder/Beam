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
  playing: Ref<boolean>,
  playbackEpoch: Ref<number>,
  domClipId?: Ref<string | null>,
  documentReady?: Ref<boolean>,
) {
  const preview = createHtmlPreview({
    render: async (html, timeMs) =>
      createImageBitmap(new Blob([new Uint8Array(await capture.renderHtmlFrame(html, timeMs))], { type: 'image/png' })),
    changed,
    failed,
  });
  let resolve = createCompositionSceneLayerResolver(composition.value);
  const update = () => {
    if (documentReady && !documentReady.value) {
      preview.update([]);
      return;
    }
    const timeMs = currentTime.value * 1000;
    const assets = new Map(composition.value.assets.map((asset) => [asset.id, asset]));
    const frames: HtmlPreviewFrame[] = [];
    for (const clip of resolve(timeMs).cameraVisuals) {
      if (clip.id === domClipId?.value) continue;
      const html = assets.get(clip.assetId)?.html;
      const sourceMs = sourceTimeAt(clip, timeMs);
      if (!html || sourceMs === null) continue;
      frames.push({
        clipId: clip.id,
        html,
        ...(playing.value ? { playbackEpoch: playbackEpoch.value } : {}),
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
  watch(
    [currentTime, playing, playbackEpoch, ...(domClipId ? [domClipId] : []), ...(documentReady ? [documentReady] : [])],
    update,
    { immediate: true },
  );
  onScopeDispose(preview.dispose);
  return preview;
}
