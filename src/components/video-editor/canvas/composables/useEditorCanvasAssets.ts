import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { WATERMARK_LOGO_PATH } from '../watermark-render';

export function useEditorCanvasAssets(
  container: Ref<HTMLDivElement | null>,
  resizeCanvas: () => void,
  renderOnce: () => void,
) {
  const watermarkLogo = ref<HTMLImageElement | null>(null);
  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    watermarkLogo.value = new Image();
    watermarkLogo.value.onload = renderOnce;
    watermarkLogo.value.src = resolvePublicAssetUrl(WATERMARK_LOGO_PATH);
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    if (container.value) resizeObserver.observe(container.value);
    renderOnce();
  });
  onUnmounted(() => resizeObserver?.disconnect());

  return watermarkLogo;
}
