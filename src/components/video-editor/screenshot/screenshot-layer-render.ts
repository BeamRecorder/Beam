import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { renderBackground } from '../composition/background/render-background';
import { drawDecoratedMedia } from '../composition/appearance/render-decorated-media';
import { drawShapeClip } from '../composition/shape/render-shape-clip';
import { drawBeamWatermark } from '../canvas/watermark-render';
import { screenshotImageFraming } from './screenshot-geometry';
import { drawScreenshotCursor } from './screenshot-cursors';
import type { ScreenshotLayer } from './screenshot-layer-types';
import type { ScreenshotRenderAssets } from './screenshot-types';
import { screenshotImage } from './screenshot-images';

export function drawScreenshotLayer(
  target: Canvas2DContext,
  state: ScreenshotState,
  layer: ScreenshotLayer,
  assets: Partial<ScreenshotRenderAssets>,
  width: number,
  height: number,
  backdrop?: CanvasImageSource,
  editingId?: string,
) {
  const viewport = { x: 0, y: 0, width, height };
  if (layer.kind === 'background')
    renderBackground(target, {
      value: state.background,
      source: assets.background,
      rect: viewport,
      blurPixels: state.blurPercent * 0.48 * Math.min(width / state.canvas.width, height / state.canvas.height),
    });
  else if (layer.kind === 'image') {
    const image = screenshotImage(state, layer.id);
    const asset = layer.id === state.image.id ? assets : assets.images?.get(layer.id);
    if (!image || !asset?.image || !asset.width || !asset.height) throw new Error('Screenshot image unavailable.');
    drawDecoratedMedia(target, {
      source: asset.image,
      ...screenshotImageFraming({ ...state, image }, asset.width, asset.height, width, height),
      appearance: image.appearance,
      title: image.name,
      shadowScale: Math.min(width / state.canvas.width, height / state.canvas.height),
      mirrored: image.isMirrored,
      mirroredY: image.isMirroredY,
    });
  } else if (layer.kind === 'watermark') drawBeamWatermark(target, state.canvas, viewport, assets.logo);
  else if (layer.kind === 'cursor') {
    const asset = assets.cursors?.get(layer.id);
    const cursor = state.cursors?.find((item) => item.id === layer.id);
    if (!asset || !cursor) throw new Error(`Cursor image unavailable: ${layer.id}`);
    drawScreenshotCursor(target, cursor, asset, width, height);
  } else {
    const shape = state.shapes.find((item) => item.id === layer.id);
    if (!shape) throw new Error(`Screenshot element unavailable: ${layer.id}`);
    const visible = shape.id === editingId ? { ...shape, text: undefined } : shape;
    drawShapeClip(target, visible, viewport, visible.transform, backdrop);
  }
}
