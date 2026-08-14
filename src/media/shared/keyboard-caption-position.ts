import type { NormalizedTransform } from './composition-types';

export const KEYBOARD_CAPTION_CURSOR_GAP = 20;
export const KEYBOARD_CAPTION_EDGE_INSET = 16;

export function keyboardCaptionTransformAtCursor(options: {
  cursor: { x: number; y: number };
  canvas: { width: number; height: number };
  content: { width: number; height: number };
}): NormalizedTransform {
  const canvasWidth = Math.max(1, options.canvas.width);
  const canvasHeight = Math.max(1, options.canvas.height);
  const width = Math.min(
    Math.max(1, options.content.width),
    Math.max(1, canvasWidth - KEYBOARD_CAPTION_EDGE_INSET * 2),
  );
  const height = Math.min(
    Math.max(1, options.content.height),
    Math.max(1, canvasHeight - KEYBOARD_CAPTION_EDGE_INSET * 2),
  );
  let x = options.cursor.x + KEYBOARD_CAPTION_CURSOR_GAP;
  let y = options.cursor.y + KEYBOARD_CAPTION_CURSOR_GAP;
  if (x + width > canvasWidth - KEYBOARD_CAPTION_EDGE_INSET) x = options.cursor.x - KEYBOARD_CAPTION_CURSOR_GAP - width;
  if (y + height > canvasHeight - KEYBOARD_CAPTION_EDGE_INSET)
    y = options.cursor.y - KEYBOARD_CAPTION_CURSOR_GAP - height;
  x = Math.max(KEYBOARD_CAPTION_EDGE_INSET, Math.min(canvasWidth - KEYBOARD_CAPTION_EDGE_INSET - width, x));
  y = Math.max(KEYBOARD_CAPTION_EDGE_INSET, Math.min(canvasHeight - KEYBOARD_CAPTION_EDGE_INSET - height, y));
  return { x: x / canvasWidth, y: y / canvasHeight, width: width / canvasWidth, height: height / canvasHeight };
}
