import { previewRenderScale } from '~/media/playback';
import type { PreviewQuality } from '~/media/playback/playback-preview';

export function resizeEditorCanvas(
  canvas: HTMLCanvasElement | null,
  container: HTMLDivElement | null,
  quality: PreviewQuality,
) {
  if (!canvas || !container) return null;
  const width = Math.max(1, container.clientWidth),
    height = Math.max(1, container.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = previewRenderScale(width, height, dpr, quality);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return { width, height, scale };
}
