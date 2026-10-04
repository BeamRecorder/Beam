import { cursorWaterRipplesAt } from '@beam/engine/cursor/cursor-water-ripple';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { WaterRippleGpu } from '../cursor/water-ripple-gpu';
import type { RenderableMedia } from './render-types';

let gpu: WaterRippleGpu | null = null;

/** Refract only screen pixels, before framing, rotation, transitions and camera projection. */
export function screenWithWaterRipples(
  media: RenderableMedia,
  snapshot: CompositionSnapshot,
  sessionTime: number,
): RenderableMedia {
  if (!snapshot.cursor.available || snapshot.cursorSettings.enabled === false) return media;
  const samples = cursorWaterRipplesAt(snapshot.cursor.events, snapshot.cursorSettings.clickEffects, sessionTime);
  if (!samples.length) return media;
  gpu ??= new WaterRippleGpu();
  return { ...media, source: gpu.render(media, samples) };
}

export function disposeWaterRippleRenderer() {
  gpu?.dispose();
  gpu = null;
}
