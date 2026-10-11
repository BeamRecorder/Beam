import { constrainPointerDelta } from '~/shortcuts/pointer-modifiers';
import { matchesGesture } from '~/shortcuts/action-bindings';
import { moveScreenshotLayer } from './screenshot-state';
import { resizeScreenshotImage } from '@beam/engine/screenshot/screenshot-geometry';
import type { ScreenshotDrag, ScreenshotTranslation } from './screenshot-types';
import type { ModifierState } from '~/shortcuts/action-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
export function screenshotDragDelta(drag: ScreenshotDrag, event: ModifierState & { clientX: number; clientY: number }) {
  const raw = { x: event.clientX - drag.x, y: event.clientY - drag.y };
  const delta = drag.corner ? raw : constrainPointerDelta(raw, event);
  return { x: delta.x / drag.width, y: delta.y / drag.height };
}
export function constrainedScreenshotTranslation(
  raw: ScreenshotTranslation,
  snapped: ScreenshotTranslation,
  event: ModifierState,
) {
  if (!matchesGesture(event, 'constrain')) return snapped;
  return raw.x === 0 ? { ...snapped, x: 0 } : { ...snapped, y: 0 };
}
export function resizedScreenshotTransform(
  drag: ScreenshotDrag,
  dx: number,
  dy: number,
  event: ModifierState,
  frame?: NormalizedTransform,
) {
  if (frame && drag.corner && !matchesGesture(event, 'freeAspect'))
    return resizeScreenshotImage(drag.initial, frame, dx, dy, drag.corner);
  return moveScreenshotLayer(drag.initial, dx, dy, drag.corner);
}
