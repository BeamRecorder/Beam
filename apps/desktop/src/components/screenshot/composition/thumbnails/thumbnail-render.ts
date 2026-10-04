import { releaseCompositedLayerSurface } from '@beam/runtime/composition/render-composited-layer';
import { drawScreenshotLayer } from '@beam/runtime/screenshot/screenshot-layer-render';
import { screenshotLayerRotation, screenshotLayerTransform } from '../../screenshot-layer-geometry';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { alphaBounds, fitThumbnail } from './thumbnail-pixels';
import type { ThumbnailRequest } from './thumbnail-types';
import { shadowBlurForAppearance } from '@beam/runtime/composition/appearance/render-decorated-media';
import { layerPerspectiveCorners } from '@beam/engine/layout/layer-perspective';

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
          {
            width: assets.width ?? width,
            height: assets.height ?? height,
            cursors: assets.cursors,
          },
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
  const corners = layerPerspectiveCorners(rect, layer.rotation3d, screenshotLayerRotation(state, layer.id));
  const left = Math.min(...corners.map((p) => p.x)),
    top = Math.min(...corners.map((p) => p.y));
  const rotatedWidth = Math.max(...corners.map((p) => p.x)) - left;
  const rotatedHeight = Math.max(...corners.map((p) => p.y)) - top;
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
    surface.width / 2 - (left + rotatedWidth / 2) * scale,
    surface.height / 2 - (top + rotatedHeight / 2) * scale,
  );
  const visibleState = {
    ...state,
    canvas: {
      ...state.canvas,
      watermark: state.canvas.watermark ? { ...state.canvas.watermark, enabled: true } : undefined,
    },
  };
  try {
    drawScreenshotLayer(context, visibleState, layer, assets, width * scale, height * scale);
  } finally {
    releaseCompositedLayerSurface(context);
  }
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
