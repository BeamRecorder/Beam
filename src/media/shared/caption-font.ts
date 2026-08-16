import type { CaptionStyle } from './composition-types';

export const canvasCaptionFont = (style: CaptionStyle, fontSize = style.fontSize) => {
  const rawFamily = style.fontFamily || 'sans-serif';
  const family = rawFamily.includes(' ') ? `"${rawFamily.replaceAll('"', '')}"` : rawFamily;
  return `${style.fontStyle ?? 'normal'} ${style.fontWeight ?? 800} ${Math.max(1, fontSize)}px ${family}`;
};

export const applyCanvasCaptionFont = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  style: CaptionStyle,
  fontSize = style.fontSize,
) => {
  context.font = canvasCaptionFont(style, fontSize);
  const scale = Math.max(1, fontSize) / Math.max(1, style.fontSize);
  (context as typeof context & { letterSpacing: string }).letterSpacing = `${(style.letterSpacing ?? 0) * scale}px`;
};
