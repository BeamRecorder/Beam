import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_SHAPE_LAYER_STYLE, normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import type { ShapeLayerStyle } from '@beam/engine/shared/shape-layer-types';
import type { CachedShapePaintStyle } from './shape-paint-style-types';

const fields: readonly (keyof ShapeLayerStyle)[] = [
  ...(Object.keys(DEFAULT_SHAPE_LAYER_STYLE) as (keyof ShapeLayerStyle)[]),
  'fill',
  'text',
  'drawing',
];
const styles = new WeakMap<ShapeClip, CachedShapePaintStyle>();

/** Reuse normalization across camera frames while respecting mutable still-editor property drafts. */
export function shapePaintStyle(clip: ShapeClip) {
  const cached = styles.get(clip);
  if (cached && fields.every((field, index) => Object.is(clip[field], cached.values[index]))) return cached.style;
  const style = normalizeShapeLayerStyle(clip);
  styles.set(clip, { style, values: fields.map((field) => clip[field]) });
  return style;
}
