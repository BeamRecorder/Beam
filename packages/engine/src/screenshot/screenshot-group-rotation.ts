import type { ScreenshotState } from './screenshot-types';
import type { NormalizedTransform } from '../shared/composition-types';
import { screenshotLayers } from './screenshot-layers';
import { expandScreenshotGroups } from './screenshot-groups';
import { normalizeMediaRotation, rotateMediaVector } from '../layout/media-rotation';

/** Rotate member centers in canvas pixels, retaining their relative orientation and dimensions. */
export function rotateScreenshotGroup(
  state: ScreenshotState,
  ids: readonly string[],
  bounds: NormalizedTransform,
  degrees: number,
): ScreenshotState {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height, degrees].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new TypeError('Invalid group rotation.');
  const members = new Set(expandScreenshotGroups(state, ids));
  const layers = screenshotLayers(state).filter((layer) => members.has(layer.id));
  if (
    members.size < 2 ||
    layers.length !== members.size ||
    layers.some(
      (layer) => layer.locked || !['image', 'shape', 'text', 'arrow', 'drawing', 'cursor'].includes(layer.kind),
    )
  )
    throw new Error('Invalid group rotation selection.');
  if (degrees % 360 === 0) return state;
  const { width, height } = state.canvas;
  const pivot = { x: (bounds.x + bounds.width / 2) * width, y: (bounds.y + bounds.height / 2) * height };
  const point = (value: { x: number; y: number }) => {
    const offset = rotateMediaVector({ x: value.x * width - pivot.x, y: value.y * height - pivot.y }, degrees);
    return { x: (pivot.x + offset.x) / width, y: (pivot.y + offset.y) / height };
  };
  const transform = (value: NormalizedTransform) => {
    const center = point({ x: value.x + value.width / 2, y: value.y + value.height / 2 });
    return { ...value, x: center.x - value.width / 2, y: center.y - value.height / 2 };
  };
  const rotate = <T extends { id: string; transform: NormalizedTransform; rotation?: number }>(layer: T) =>
    members.has(layer.id)
      ? {
          ...layer,
          transform: transform(layer.transform),
          rotation: normalizeMediaRotation((layer.rotation ?? 0) + degrees),
        }
      : layer;
  return {
    ...state,
    image: rotate(state.image),
    ...(state.images ? { images: state.images.map(rotate) } : {}),
    shapes: state.shapes.map(rotate),
    ...(state.cursors
      ? {
          cursors: state.cursors.map((cursor) =>
            members.has(cursor.id)
              ? {
                  ...cursor,
                  position: point(cursor.position),
                  rotation: normalizeMediaRotation(cursor.rotation + degrees),
                }
              : cursor,
          ),
        }
      : {}),
  };
}
