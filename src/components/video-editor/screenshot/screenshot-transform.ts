import type { ScreenshotState } from '~/api/types/screenshot';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import type { ScreenshotRenderAssets } from './screenshot-types';
import { screenshotCursorTransform, transformScreenshotCursor } from './screenshot-cursors';

/** A drag preview owns only its moving layer. The document/history is committed on release. */
export function withScreenshotTransform(
  state: ScreenshotState,
  id: string,
  transform: NormalizedTransform,
  assets: ScreenshotRenderAssets | null,
): ScreenshotState {
  if (id === state.image.id) return { ...state, image: { ...state.image, transform } };
  if (state.images?.some((image) => image.id === id))
    return { ...state, images: state.images.map((image) => (image.id === id ? { ...image, transform } : image)) };
  const cursor = state.cursors?.find((item) => item.id === id);
  const asset = assets?.cursors?.get(id)?.asset;
  if (cursor && asset) {
    const next = { ...cursor };
    transformScreenshotCursor(next, screenshotCursorTransform(cursor, state.canvas, asset), transform);
    return { ...state, cursors: state.cursors!.map((item) => (item.id === id ? next : item)) };
  }
  return { ...state, shapes: state.shapes.map((shape) => (shape.id === id ? { ...shape, transform } : shape)) };
}
