import type { CaptionStyle } from '~/media/shared/composition-types';
import { applyCanvasCaptionFont } from '~/media/shared/caption-font';
import { approximateCaptionTextWidth } from '~/media/shared/caption-text-layout';

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
