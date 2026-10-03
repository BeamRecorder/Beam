import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { WATERMARK_LOGO_PATH } from '@beam/runtime/rendering/watermark-render';
import { requestEditorImage } from '../../resources/editor-image-cache';

export function useEditorCanvasAssets(
  container: Ref<HTMLDivElement | null>,
  resizeCanvas: () => void,
  renderOnce: () => void,
) {
  const watermarkLogo = ref<HTMLImageElement | null>(null);
  let resizeObserver: ResizeObserver | null = null;
  let disposed = false;

  onMounted(() => {
    const { image, ready } = requestEditorImage(WATERMARK_LOGO_PATH);
    watermarkLogo.value = image;
    void ready
      .then(() => {
        if (!disposed) renderOnce();
      })
      .catch((reason: unknown) => {
        if (!disposed) console.error('[Beam media:editor] watermark loading failed.', reason);
      });
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    if (container.value) resizeObserver.observe(container.value);
    renderOnce();
  });
  onUnmounted(() => {
    disposed = true;
    resizeObserver?.disconnect();
  });

  return watermarkLogo;
}
