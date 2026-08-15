import type { ClipAppearance } from '~/media/shared/composition-types';
import type { DecoratedMediaOptions, MediaRect } from './appearance-types';
import { drawFrameChrome, frameContentRect } from './frames';
import { adaptiveShadowColor } from './adaptive-shadow';
import type { Canvas2DContext } from '~/types/canvas';

export const DEFAULT_CLIP_APPEARANCE: ClipAppearance = {
  cornerRadius: 'sm',
  shadowSize: 'md',
  shadowBlur: 20,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
};
const SHADOW_BLURS = { sm: 10, md: 20, lg: 32 } as const;

export function shadowBlurForAppearance(appearance: ClipAppearance | undefined) {
  const style = { ...DEFAULT_CLIP_APPEARANCE, ...appearance };
  if (style.shadowSize === 'none') return 0;
  if (style.shadowSize === 'custom') return Math.min(96, Math.max(0, style.shadowBlur ?? 40));
  return SHADOW_BLURS[style.shadowSize];
}

export const radiusForAppearance = (appearance: ClipAppearance | undefined) => {
  const value = appearance?.cornerRadius ?? DEFAULT_CLIP_APPEARANCE.cornerRadius;
  const radii: Record<string, number> = {
    none: 0,
    sm: 8,
    md: 16,
    lg: 24,
    full: Number.MAX_SAFE_INTEGER,
  };
  return typeof value === 'number' ? value : (radii[value] ?? 16);
};
export function applyClipShadow(
  ctx: Canvas2DContext,
  appearance: ClipAppearance | undefined,
  width: number,
  source?: CanvasImageSource,
  sourceRect?: MediaRect,
  shadowScale = 1,
) {
  const style = { ...DEFAULT_CLIP_APPEARANCE, ...appearance };
  const blur = shadowBlurForAppearance(style) * Math.max(0, shadowScale);
  const shadowColor =
    style.shadowMode === 'adaptive' && source
      ? adaptiveShadowColor(source, sourceRect, style.shadowColor)
      : style.shadowColor;
  ctx.shadowColor = blur > 0 ? shadowColor : 'transparent';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX =
    style.shadowDirection === 'top-left'
      ? -width * 0.018
      : style.shadowDirection === 'bottom-right'
        ? width * 0.018
        : 0;
  ctx.shadowOffsetY =
    style.shadowDirection === 'top-left' ? -width * 0.018 : style.shadowDirection === 'all' ? 0 : width * 0.018;
}
const clipRect = (ctx: Canvas2DContext, rect: MediaRect, radius: number) => {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, Math.min(radius, rect.width / 2, rect.height / 2));
  ctx.clip();
};
export function drawDecoratedMedia(ctx: Canvas2DContext, options: DecoratedMediaOptions) {
  const appearance = { ...DEFAULT_CLIP_APPEARANCE, ...options.appearance };
  const windowsOptions = {
    showMenu: appearance.frameShowMenu,
    showScrollbars: appearance.frameShowScrollbars,
    chromeScale: appearance.frameChromeScale,
  };
  const content = frameContentRect(options.rect, appearance.frame, windowsOptions);
  const outerRadius = Math.min(radiusForAppearance(appearance), options.rect.width / 2, options.rect.height / 2);
  if (appearance.shadowSize !== 'none') {
    ctx.save();
    applyClipShadow(ctx, appearance, options.rect.width, options.source, options.sourceRect, options.shadowScale);
    ctx.fillStyle = appearance.frame !== 'none' ? appearance.frameColor : '#000000';
    ctx.beginPath();
    ctx.roundRect(options.rect.x, options.rect.y, options.rect.width, options.rect.height, outerRadius);
    ctx.fill();
    ctx.restore();
  }
  const title = appearance.frameTitle.trim() || options.title;
  ctx.save();
  clipRect(ctx, options.rect, outerRadius);
  drawFrameChrome(ctx, options.rect, appearance.frame, title, true, appearance.frameColor, windowsOptions);
  ctx.save();
  const scaleX = options.mirrored ? -1 : 1;
  const scaleY = options.mirroredY ? -1 : 1;
  if (scaleX !== 1 || scaleY !== 1) {
    ctx.translate(
      scaleX === -1 ? content.x * 2 + content.width : 0,
      scaleY === -1 ? content.y * 2 + content.height : 0,
    );
    ctx.scale(scaleX, scaleY);
  }
  const source = options.sourceRect;
  if (source)
    ctx.drawImage(
      options.source,
      source.x,
      source.y,
      source.width,
      source.height,
      content.x,
      content.y,
      content.width,
      content.height,
    );
  else ctx.drawImage(options.source, content.x, content.y, content.width, content.height);
  ctx.restore();
  if (appearance.frame !== 'none')
    drawFrameChrome(ctx, options.rect, appearance.frame, title, false, appearance.frameColor, windowsOptions);
  ctx.restore();
  if (appearance.borderEnabled && appearance.borderWidth > 0) {
    ctx.save();
    ctx.strokeStyle = appearance.borderColor;
    ctx.lineWidth = appearance.borderWidth;
    ctx.beginPath();
    ctx.roundRect(
      options.rect.x - appearance.borderWidth / 2,
      options.rect.y - appearance.borderWidth / 2,
      options.rect.width + appearance.borderWidth,
      options.rect.height + appearance.borderWidth,
      outerRadius + appearance.borderWidth / 2,
    );
    ctx.stroke();
    ctx.restore();
  }
}
