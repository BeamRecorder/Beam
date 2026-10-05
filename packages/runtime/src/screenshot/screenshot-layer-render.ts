import { drawWithLayerPerspective } from '../composition/render-layer-perspective';
import { drawWithLayerEffects } from '../gradient/layer-effects';
import { screenshotLayerEffectRect } from './screenshot-layer-effect-geometry';
import { applyBlurEffect } from '@beam/runtime/composition/effects/blur-effect';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { renderBackground } from '@beam/runtime/composition/background/render-background';
import { drawDecoratedMedia } from '@beam/runtime/composition/appearance/render-decorated-media';
import { drawShapeClip } from '@beam/runtime/composition/shape/render-shape-clip';
import { drawBeamWatermark } from '@beam/runtime/rendering/watermark-render';
import { screenshotImageFraming } from '@beam/engine/screenshot/screenshot-geometry';
import { drawScreenshotCursor } from './screenshot-cursors';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import { screenshotImageRaster } from './screenshot-image-raster';
import { drawScreenshotZoom } from './screenshot-zoom-render';
import type { GlassScenePainter } from '../zoom/glass-highlight-gpu-types';

function drawScreenshotContent(
  target: Canvas2DContext,
  state: ScreenshotState,
  layer: ScreenshotLayer,
  assets: Partial<ScreenshotRenderAssets>,
  width: number,
  height: number,
  backdrop?: CanvasImageSource,
  editingId?: string,
  drawScene?: GlassScenePainter,
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
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    drawDecoratedMedia(target, {
      source: asset.image,
      ...screenshotImageRaster(screenshotImageFraming({ ...state, image }, asset.width, asset.height, width, height), {
        width: asset.width,
        height: asset.height,
        rasterSize: asset.rasterSize,
      }),
      appearance: image.appearance,
      title: image.name,
      shadowScale: Math.min(width / state.canvas.width, height / state.canvas.height),
      mirrored: image.isMirrored,
      mirroredY: image.isMirroredY,
      rotation: image.rotation,
    });
  } else if (layer.kind === 'zoom') {
    const zoom = state.zooms?.find((item) => item.id === layer.id);
    if (!zoom) throw new Error(`Screenshot zoom unavailable: ${layer.id}`);
    drawScreenshotZoom(target, zoom, state.canvas, width, height, backdrop ?? target.canvas, drawScene);
  } else if (layer.kind === 'effect') {
    const effect = state.effects?.find((item) => item.id === layer.id);
    if (!effect) throw new Error(`Screenshot effect unavailable: ${layer.id}`);
    applyBlurEffect(
      target,
      effect,
      {
        x: effect.transform.x * width,
        y: effect.transform.y * height,
        width: effect.transform.width * width,
        height: effect.transform.height * height,
      },
      { source: backdrop },
    );
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

export function drawScreenshotLayer(
  target: Canvas2DContext,
  state: ScreenshotState,
  layer: ScreenshotLayer,
  assets: Partial<ScreenshotRenderAssets>,
  width: number,
  height: number,
  backdrop?: CanvasImageSource,
  editingId?: string,
  drawScene?: GlassScenePainter,
) {
  const scale = Math.min(width / state.canvas.width, height / state.canvas.height);
  const draw = (context: Canvas2DContext) =>
    drawScreenshotContent(
      context,
      state,
      layer,
      assets,
      width,
      height,
      backdrop ?? target.canvas,
      editingId,
      drawScene,
    );
  const active = layer.effects?.some((effect) => effect.enabled && effect.opacity > 0);
  const rect =
    active || layer.rotation3d
      ? screenshotLayerEffectRect(state, layer, assets, width, height)
      : { x: 0, y: 0, width, height };
  drawWithLayerPerspective(target, layer.rotation3d, rect, scale, (context) => {
    if (active) drawWithLayerEffects(context, layer.effects!, rect, scale, draw);
    else draw(context);
  });
}
