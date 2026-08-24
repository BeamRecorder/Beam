import type { ClipAppearance } from '~/media/shared/composition-types';
import type { DecoratedMediaOptions, MediaRect } from './appearance-types';
import { drawFrameChrome, frameContentRect, frameMediaRect, frameOuterRect, frameRadius } from './frames';
import { adaptiveShadowColor } from './adaptive-shadow';
import { isPhoneFrame } from './phone-frames';
import type { Canvas2DContext } from '~/types/canvas';
import { resolvePhoneFrameGeometry } from './frame-geometry';
import { drawPhoneFrameFill } from './phone-frame-fill';
import { DEFAULT_PHONE_FRAME_FILL } from '~/media/shared/color-fill-types';

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
  phoneFrameFill: { kind: 'color', color: '#000000' },
};
const SHADOW_BLURS = { sm: 16, md: 24, lg: 32 } as const;

export function shadowBlurForAppearance(appearance: ClipAppearance | undefined) {
  const style = { ...DEFAULT_CLIP_APPEARANCE, ...appearance };
  if (style.shadowSize === 'none') return 0;
  if (style.shadowSize === 'custom') return Math.min(96, Math.max(0, style.shadowBlur ?? 40));
  return SHADOW_BLURS[style.shadowSize];
}

export const radiusForAppearance = (appearance: ClipAppearance | undefined, scale = 1) => {
  const value = appearance?.cornerRadius ?? DEFAULT_CLIP_APPEARANCE.cornerRadius;
  const radii: Record<string, number> = {
    none: 0,
    sm: 8,
    md: 16,
    lg: 24,
    full: Number.MAX_SAFE_INTEGER,
  };
  const radius = typeof value === 'number' ? value : (radii[value] ?? 16);
  return radius * Math.max(0, scale);
};
export function applyClipShadow(
  ctx: Canvas2DContext,
  appearance: ClipAppearance | undefined,
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
  const offset = blur * 0.5;
  ctx.shadowOffsetX =
    style.shadowDirection === 'top-left' ? -offset : style.shadowDirection === 'bottom-right' ? offset : 0;
  ctx.shadowOffsetY = style.shadowDirection === 'top-left' ? -offset : style.shadowDirection === 'all' ? 0 : offset;
}
const appendMediaPath = (ctx: Canvas2DContext, rect: MediaRect, radius: number, mask?: 'circle' | 'squircle') => {
  if (mask === 'circle') {
    ctx.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.min(rect.width, rect.height) / 2, 0, Math.PI * 2);
  } else if (mask === 'squircle') {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    for (let index = 0; index <= 64; index += 1) {
      const angle = (index / 64) * Math.PI * 2;
      const x = centerX + (rect.width / 2) * Math.sign(Math.cos(angle)) * Math.sqrt(Math.abs(Math.cos(angle)));
      const y = centerY + (rect.height / 2) * Math.sign(Math.sin(angle)) * Math.sqrt(Math.abs(Math.sin(angle)));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, Math.min(radius, rect.width / 2, rect.height / 2));
  }
};
const mediaPath = (ctx: Canvas2DContext, rect: MediaRect, radius: number, mask?: 'circle' | 'squircle') => {
  ctx.beginPath();
  appendMediaPath(ctx, rect, radius, mask);
};
const clipOutsideMedia = (
  ctx: Canvas2DContext,
  rect: MediaRect,
  radius: number,
  mask: 'circle' | 'squircle' | undefined,
  shadowBlur: number,
) => {
  // Canvas shadows need an opaque caster. Keep only the pixels outside the
  // media shape so transparent image pixels never reveal that caster.
  const edgeGuard = 1;
  const padding = Math.max(2, shadowBlur * 4 + edgeGuard);
  ctx.beginPath();
  appendMediaPath(
    ctx,
    {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    },
    0,
  );
  appendMediaPath(
    ctx,
    {
      x: rect.x - edgeGuard,
      y: rect.y - edgeGuard,
      width: rect.width + edgeGuard * 2,
      height: rect.height + edgeGuard * 2,
    },
    radius + edgeGuard,
    mask,
  );
  ctx.clip('evenodd');
};
const clipRect = (ctx: Canvas2DContext, rect: MediaRect, radius: number, mask?: 'circle' | 'squircle') => {
  mediaPath(ctx, rect, radius, mask);
  ctx.clip();
};
const drawMediaSource = (ctx: Canvas2DContext, options: DecoratedMediaOptions, content: MediaRect) => {
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
};

const mediaSourceDimensions = (options: DecoratedMediaOptions) => {
  if (options.sourceRect) return { width: options.sourceRect.width, height: options.sourceRect.height };
  const source = options.source as unknown as Record<string, unknown>;
  const dimension = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  };
  return {
    width: dimension('videoWidth', 'naturalWidth', 'displayWidth', 'width'),
    height: dimension('videoHeight', 'naturalHeight', 'displayHeight', 'height'),
  };
};

type AlphaShadowSurface = OffscreenCanvas | HTMLCanvasElement;
const alphaShadowSurfaces = new WeakMap<object, { key: string; surface: AlphaShadowSurface }>();
const MAX_ALPHA_SHADOW_SURFACE_SIZE = 4_096;

const createAlphaShadowSurface = (width: number, height: number): AlphaShadowSurface | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface;
};

const alphaShadowSurface = (options: DecoratedMediaOptions, radius: number): AlphaShadowSurface | null => {
  const logicalWidth = Math.max(1, options.rect.width);
  const logicalHeight = Math.max(1, options.rect.height);
  const renderScale = Math.min(1, MAX_ALPHA_SHADOW_SURFACE_SIZE / Math.max(logicalWidth, logicalHeight));
  const width = Math.max(1, Math.ceil(logicalWidth * renderScale));
  const height = Math.max(1, Math.ceil(logicalHeight * renderScale));
  const source = options.sourceRect;
  const key = [
    width,
    height,
    radius,
    options.mask ?? '',
    options.mirrored === true,
    options.mirroredY === true,
    source?.x ?? '',
    source?.y ?? '',
    source?.width ?? '',
    source?.height ?? '',
  ].join(':');
  const sourceKey = options.source as object;
  const cached = alphaShadowSurfaces.get(sourceKey);
  if (cached?.key === key) return cached.surface;
  const surface = createAlphaShadowSurface(width, height);
  const context = surface?.getContext('2d') as Canvas2DContext | null | undefined;
  if (!surface || !context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(width / logicalWidth, height / logicalHeight);
  const rect = { x: 0, y: 0, width: logicalWidth, height: logicalHeight };
  clipRect(context, rect, radius, options.mask);
  drawMediaSource(context, { ...options, rect }, rect);
  context.restore();
  alphaShadowSurfaces.set(sourceKey, { key, surface });
  return surface;
};

export function drawDecoratedMedia(ctx: Canvas2DContext, options: DecoratedMediaOptions) {
  const appearance = { ...DEFAULT_CLIP_APPEARANCE, ...options.appearance };
  const appearanceScale = Math.max(0, options.shadowScale ?? 1);
  const windowsOptions = {
    showMenu: appearance.frameShowMenu,
    showScrollbars: appearance.frameShowScrollbars,
    chromeScale: appearance.frameChromeScale,
  };
  const outer = frameOuterRect(options.rect, appearance.frame);
  const sourceSize = mediaSourceDimensions(options);
  const content = frameMediaRect(
    options.rect,
    appearance.frame,
    sourceSize.width || options.rect.width,
    sourceSize.height || options.rect.height,
    windowsOptions,
  );
  const frameContent = frameContentRect(options.rect, appearance.frame, windowsOptions);
  const mask = isPhoneFrame(appearance.frame) ? undefined : options.mask;
  const appearanceRadius =
    mask === 'circle' ? Number.MAX_SAFE_INTEGER : radiusForAppearance(appearance, appearanceScale);
  const outerRadius = frameRadius(appearance.frame, appearanceRadius, outer);
  const shadowBlur = shadowBlurForAppearance(appearance) * appearanceScale;
  let sourceDrawn = false;
  if (shadowBlur > 0) {
    const alphaSurface =
      options.shadowFollowsSourceAlpha && appearance.frame === 'none' ? alphaShadowSurface(options, outerRadius) : null;
    if (alphaSurface) {
      ctx.save();
      applyClipShadow(ctx, appearance, options.source, options.sourceRect, options.shadowScale);
      ctx.drawImage(alphaSurface, options.rect.x, options.rect.y, options.rect.width, options.rect.height);
      ctx.restore();
      sourceDrawn = true;
    } else {
      ctx.save();
      applyClipShadow(ctx, appearance, options.source, options.sourceRect, options.shadowScale);
      clipOutsideMedia(ctx, outer, outerRadius, mask, shadowBlur);
      ctx.fillStyle = appearance.frame !== 'none' ? appearance.frameColor : '#000000';
      mediaPath(ctx, outer, outerRadius, mask);
      ctx.fill();
      ctx.restore();
    }
  }
  const title = appearance.frameTitle.trim() || options.title;
  ctx.save();
  clipRect(ctx, outer, outerRadius, mask);
  drawFrameChrome(ctx, outer, appearance.frame, title, true, appearance.frameColor, windowsOptions);
  if (isPhoneFrame(appearance.frame)) {
    const geometry = resolvePhoneFrameGeometry(options.rect, appearance.frame);
    drawPhoneFrameFill(
      ctx,
      appearance.phoneFrameFill ?? DEFAULT_PHONE_FRAME_FILL,
      frameContent,
      geometry.contentRadius,
      options.source,
      options.sourceRect,
      options.mirrored,
      options.mirroredY,
    );
  }
  if (!sourceDrawn) drawMediaSource(ctx, options, content);
  if (appearance.frame !== 'none')
    drawFrameChrome(ctx, outer, appearance.frame, title, false, appearance.frameColor, windowsOptions);
  ctx.restore();
  if (appearance.borderEnabled && appearance.borderWidth > 0) {
    ctx.save();
    ctx.strokeStyle = appearance.borderColor;
    ctx.lineWidth = appearance.borderWidth;
    mediaPath(
      ctx,
      {
        x: outer.x - appearance.borderWidth / 2,
        y: outer.y - appearance.borderWidth / 2,
        width: outer.width + appearance.borderWidth,
        height: outer.height + appearance.borderWidth,
      },
      outerRadius + appearance.borderWidth / 2,
      mask,
    );
    ctx.stroke();
    ctx.restore();
  }
}
