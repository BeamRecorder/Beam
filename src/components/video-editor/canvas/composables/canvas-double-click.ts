import { isVisualClip } from '@beam/engine/shared/composition-types';
import type { CanvasDoubleClickOptions } from './canvas-edit-types';
export function canvasDoubleClick(event: MouseEvent, options: CanvasDoubleClickOptions) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || options.blocked()) return;
  if (event.target instanceof Element && event.target.closest('button, input, textarea, [role="button"]')) return;
  if (options.beginElement(event) || options.beginCaption(event)) return;
  const id = options.clipIdAt(event);
  if (!id) return options.add(event);
  const clip = options.composition().clips.find((clip) => clip.id === id);
  if (clip && isVisualClip(clip) && !clip.locked) options.crop(clip.id);
}
