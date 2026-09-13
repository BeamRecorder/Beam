import { drawScreenshotLayer } from '../../screenshot-layer-render';
import { screenshotLayerRotation, screenshotLayerTransform } from '../../screenshot-layer-geometry';
import type { ScreenshotRenderAssets } from '../../screenshot-types';
import { alphaBounds, fitThumbnail } from './thumbnail-pixels';
import type { ThumbnailRequest } from './thumbnail-types';
import { shadowBlurForAppearance } from '../../../composition/appearance/render-decorated-media';

export async function renderLayerThumbnail(
  request: ThumbnailRequest,
  assets: Partial<ScreenshotRenderAssets>,
): Promise<Blob> {
  const { state, layer } = request;
  const { width, height } = state.canvas;
  const transform =
    layer.kind === 'effect'
      ? null
      : screenshotLayerTransform(
          state,
          { width: assets.width ?? width, height: assets.height ?? height, cursors: assets.cursors },
          layer.id,
        );
  const rect = transform
    ? {
        x: transform.x * width,
        y: transform.y * height,
        width: transform.width * width,
        height: transform.height * height,
      }
    : { x: 0, y: 0, width, height };
  const angle = (screenshotLayerRotation(state, layer.id) * Math.PI) / 180;
  const rotatedWidth = Math.abs(rect.width * Math.cos(angle)) + Math.abs(rect.height * Math.sin(angle));
  const rotatedHeight = Math.abs(rect.height * Math.cos(angle)) + Math.abs(rect.width * Math.sin(angle));
  const unit = Math.min(width, height) / 1080;
  const cursor = state.cursors?.find((item) => item.id === layer.id);
  const shape = state.shapes.find((item) => item.id === layer.id);
  const shadow = cursor?.shadowEnabled
    ? 4.4 * cursor.shadowBlur * unit
    : shape?.shadowEnabled
      ? (4 * shape.shadowBlur + 12) * unit
      : layer.kind === 'image'
        ? 4 * shadowBlurForAppearance(state.image.appearance)
        : 0;
  const padding = shadow + (shape?.borderWidth ?? 0) * unit;
  const scale = 176 / Math.max(1, rotatedWidth + padding * 2, rotatedHeight + padding * 2);
  const surface = new OffscreenCanvas(
    layer.kind === 'effect' ? Math.max(1, Math.round(width * scale)) : 256,
    layer.kind === 'effect' ? Math.max(1, Math.round(height * scale)) : 256,
  );
  const context = surface.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Thumbnail rendering context unavailable.');
  context.translate(
    surface.width / 2 - (rect.x + rect.width / 2) * scale,
    surface.height / 2 - (rect.y + rect.height / 2) * scale,
  );
  const visibleState = {
    ...state,
    canvas: {
      ...state.canvas,
      watermark: state.canvas.watermark ? { ...state.canvas.watermark, enabled: true } : undefined,
    },
  };
  drawScreenshotLayer(context, visibleState, layer, assets, width * scale, height * scale);
  const bounds = alphaBounds(
    context.getImageData(0, 0, surface.width, surface.height).data,
    surface.width,
    surface.height,
  );
  const output = new OffscreenCanvas(96, 96);
  const target = output.getContext('2d', { willReadFrequently: true });
  if (!target) throw new Error('Thumbnail output context unavailable.');
  if (bounds) {
    const fit = fitThumbnail(bounds, 96);
    target.drawImage(surface, bounds.x, bounds.y, bounds.width, bounds.height, fit.x, fit.y, fit.width, fit.height);
  }
  return output.convertToBlob({ type: 'image/png' });
}
