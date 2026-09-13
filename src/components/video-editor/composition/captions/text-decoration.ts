import type { Canvas2DContext } from '~/types/canvas';
import type { CaptionStyle } from '~/media/shared/composition-types';

export function drawTextDecoration(
  ctx: Canvas2DContext,
  decoration: CaptionStyle['textDecoration'],
  x: number,
  y: number,
  width: number,
  fontSize: number,
) {
  if (decoration.includes('line-through')) ctx.fillRect(x, y - fontSize * 0.08, width, Math.max(1, fontSize * 0.07));
  if (decoration.includes('underline')) ctx.fillRect(x, y + fontSize * 0.43, width, Math.max(1, fontSize * 0.06));
}
