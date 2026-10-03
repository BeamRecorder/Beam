import type { CaptionStyle } from '@beam/engine/shared/composition-types';
import { canvasCaptionFont } from '@beam/engine/shared/caption-font';

export const applyCanvasCaptionFont = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  style: CaptionStyle,
  fontSize = style.fontSize,
) => {
  context.font = canvasCaptionFont(style, fontSize);
  const scale = Math.max(1, fontSize) / Math.max(1, style.fontSize);
  (context as typeof context & { letterSpacing: string }).letterSpacing = `${(style.letterSpacing ?? 0) * scale}px`;
};
