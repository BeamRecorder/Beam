import { screenCursorPresentation } from '@beam/engine/capture/screen-cursor-settings';
import { cursorWaterRipplesAt } from '@beam/engine/cursor/cursor-water-ripple';
import { screenCursorEnabled } from '@beam/engine/capture/screen-cursor';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { WaterRippleGpu } from '../cursor/water-ripple-gpu';
import type { RenderableMedia } from './render-types';

let gpu: WaterRippleGpu | null = null;

/** Refract only screen pixels, before framing, rotation, transitions and camera projection. */
export function screenWithWaterRipples(
  media: RenderableMedia,
  snapshot: CompositionSnapshot,
  sessionTime: number,
  screen: VisualClip,
): RenderableMedia {
  const enabled = screenCursorEnabled(screen, snapshot.cursorSettings.enabled !== false);
  if (!snapshot.cursor.available || !enabled) return media;
  const samples = cursorWaterRipplesAt(
    snapshot.cursor.events,
    screenCursorPresentation(screen, snapshot.cursorSettings).clickEffects,
    sessionTime,
  );
  if (!samples.length) return media;
  gpu ??= new WaterRippleGpu();
  return { ...media, source: gpu.render(media, samples) };
}

export function disposeWaterRippleRenderer() {
  gpu?.dispose();
  gpu = null;
}
