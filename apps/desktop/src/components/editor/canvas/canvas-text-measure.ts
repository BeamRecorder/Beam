import type { CaptionStyle } from '@beam/engine/shared/composition-types';
import { applyCanvasCaptionFont } from '@beam/runtime/shared/caption-font-render';
import { approximateCaptionTextWidth } from '@beam/engine/shared/caption-text-layout';

export function measureCanvasCaptionText(
  canvas: HTMLCanvasElement | null,
  text: string,
  fontSize: number,
  style?: CaptionStyle,
) {
  const context = canvas?.getContext('2d');
  if (!context) return approximateCaptionTextWidth(text, fontSize);
  context.save();
  applyCanvasCaptionFont(context, style ?? { ...({} as CaptionStyle), fontSize }, fontSize);
  const width = context.measureText(text).width;
  context.restore();
  return width;
}
