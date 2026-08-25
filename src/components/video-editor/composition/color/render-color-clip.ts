import type { BlurClip, ColorClip, NormalizedTransform } from '~/media/shared/composition-types';
import { normalizeColorLayerStyle } from '~/media/shared/color-layer-style';
import type { Canvas2DContext } from '~/types/canvas';
import { backgroundFillStyle } from '../background/render-background';
import { applyBlurEffect } from '../effects/blur-effect';
import { applyClipShadow, DEFAULT_CLIP_APPEARANCE, radiusForAppearance } from '../appearance/render-decorated-media';

export function drawColorClip(
  context: Canvas2DContext,
  clip: ColorClip,
  viewport: { x: number; y: number; width: number; height: number },
  transform: NormalizedTransform = clip.transform,
) {
  const rect = {
    x: viewport.x + transform.x * viewport.width,
    y: viewport.y + transform.y * viewport.height,
    width: transform.width * viewport.width,
    height: transform.height * viewport.height,
  };
  if (rect.width <= 0 || rect.height <= 0) return;
  const style = normalizeColorLayerStyle(clip);
  const viewportScale = Math.min(viewport.width, viewport.height) / 1080;
  const radius = Math.min(
    radiusForAppearance({ ...DEFAULT_CLIP_APPEARANCE, cornerRadius: style.cornerRadius }, viewportScale),
    rect.width / 2,
    rect.height / 2,
  );
  if (style.backdropBlurEnabled && style.backdropBlur > 0) {
    const backdropClip: BlurClip = {
      ...clip,
      kind: 'blur',
      shape: 'rectangle',
      mode: 'blur',
      strength: style.backdropBlur,
      feather: 0,
      cornerRadius: (radius * 200) / Math.min(rect.width, rect.height),
      tintOpacity: 0,
      color: '#000000',
    };
    applyBlurEffect(context, backdropClip, rect);
  }

  const adaptiveShadowColor =
    clip.fill.kind === 'color'
      ? clip.fill.color
      : (clip.fill.gradient.stops[Math.floor(clip.fill.gradient.stops.length / 2)]?.color ?? style.shadowColor);
  context.save();
  context.globalAlpha *= style.opacityEnabled ? style.opacity / 100 : 1;
  applyClipShadow(
    context,
    {
      ...DEFAULT_CLIP_APPEARANCE,
      cornerRadius: style.cornerRadius,
      shadowSize: style.shadowSize,
      shadowBlur: style.shadowBlur,
      shadowMode: 'solid',
      shadowColor: style.shadowMode === 'adaptive' ? adaptiveShadowColor : style.shadowColor,
      shadowDirection: style.shadowDirection,
    },
    undefined,
    undefined,
    viewportScale,
  );
  context.fillStyle = backgroundFillStyle(context, clip.fill, rect);
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  context.fill();
  context.restore();
}
