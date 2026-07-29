import type { ClipAppearance } from "../composition-types";
import type { DecoratedMediaOptions, MediaRect } from "./appearance-types";
import { drawFrameChrome, frameContentRect, frameRadius } from "./frames";

export const DEFAULT_CLIP_APPEARANCE: ClipAppearance = { cornerRadius: "sm", shadowSize: "md", shadowColor: "#000000", shadowDirection: "bottom", borderEnabled: false, borderColor: "#000000", borderWidth: 1, frame: "none", frameTitle: "", frameColor: "#c0c0c0", frameShowMenu: true, frameShowScrollbars: true };
export const radiusForAppearance = (appearance: ClipAppearance | undefined) => {
  const value = appearance?.cornerRadius ?? DEFAULT_CLIP_APPEARANCE.cornerRadius;
  const radii: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 24, full: Number.MAX_SAFE_INTEGER };
  return typeof value === "number" ? value : (radii[value] ?? 16);
};
export function applyClipShadow(ctx: CanvasRenderingContext2D, appearance: ClipAppearance | undefined, width: number) {
  const style = { ...DEFAULT_CLIP_APPEARANCE, ...appearance };
  const blur = { none: 0, sm: 10, md: 20, lg: 32 }[style.shadowSize];
  ctx.shadowColor = blur > 0 ? style.shadowColor : "transparent";
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = style.shadowDirection === "top-left" ? -width * .018 : style.shadowDirection === "bottom-right" ? width * .018 : 0;
  ctx.shadowOffsetY = style.shadowDirection === "top-left" ? -width * .018 : style.shadowDirection === "all" ? 0 : width * .018;
}
const clipRect = (ctx: CanvasRenderingContext2D, rect: MediaRect, radius: number) => { ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.width, rect.height, Math.min(radius, rect.width / 2, rect.height / 2)); ctx.clip(); };
export function drawDecoratedMedia(ctx: CanvasRenderingContext2D, options: DecoratedMediaOptions) {
  const appearance = { ...DEFAULT_CLIP_APPEARANCE, ...options.appearance };
  const windowsOptions = { showMenu: appearance.frameShowMenu, showScrollbars: appearance.frameShowScrollbars };
  const content = frameContentRect(options.rect, appearance.frame, windowsOptions);
  const outerRadius = frameRadius(appearance.frame, radiusForAppearance(appearance), options.rect);
  if (appearance.shadowSize !== "none") {
    ctx.save();
    applyClipShadow(ctx, appearance, options.rect.width);
    ctx.fillStyle = appearance.frame !== "none" ? appearance.frameColor : "#000000";
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
  clipRect(ctx, content, appearance.frame === "none" ? radiusForAppearance(appearance) : 0);
  if (options.mirrored) { ctx.translate(content.x * 2 + content.width, 0); ctx.scale(-1, 1); }
  const source = options.sourceRect;
  if (source) ctx.drawImage(options.source, source.x, source.y, source.width, source.height, content.x, content.y, content.width, content.height);
  else ctx.drawImage(options.source, content.x, content.y, content.width, content.height);
  ctx.restore();
  if (appearance.frame !== "none") drawFrameChrome(ctx, options.rect, appearance.frame, title, false, appearance.frameColor, windowsOptions);
  ctx.restore();
  if (appearance.borderEnabled && appearance.borderWidth > 0) { ctx.save(); ctx.strokeStyle = appearance.borderColor; ctx.lineWidth = appearance.borderWidth; ctx.beginPath(); ctx.roundRect(options.rect.x + appearance.borderWidth / 2, options.rect.y + appearance.borderWidth / 2, Math.max(0, options.rect.width - appearance.borderWidth), Math.max(0, options.rect.height - appearance.borderWidth), Math.max(0, outerRadius - appearance.borderWidth / 2)); ctx.stroke(); ctx.restore(); }
}
