import { captionContentAt } from '@beam/engine/shared/caption-text-layout';
import { drawCaptionText } from '../composition/captions/render-caption-text';
import type { CaptionClip } from '@beam/engine/shared/composition-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { Canvas2DContext } from '../canvas-types';

export function drawCaption(
  ctx: Canvas2DContext,
  clip: CaptionClip,
  timeMs: number,
  snapshot: CompositionSnapshot,
  cursorPosition?: { x: number; y: number } | null,
) {
  const { text, runs, wordHighlight } = captionContentAt(clip, timeMs);
  if (!text) return;
  drawCaptionText(ctx, {
    clip,
    text,
    runs,
    wordHighlight,
    cursorPosition,
    canvas: snapshot.referenceCanvas ?? snapshot.canvas,
    viewport: { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
  });
}
