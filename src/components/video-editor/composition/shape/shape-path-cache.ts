import type { ShapeClip } from '~/media/shared/composition-types';

const MAX_GEOMETRIES_PER_CLIP = 4;
const paths = new WeakMap<ShapeClip, Map<string, Path2D>>();

/** Stable paths let the native renderer reuse vector/shadow geometry, not scene pixels. */
export function cachedShapePath(clip: ShapeClip, geometry: string, create: () => Path2D): Path2D {
  let variants = paths.get(clip);
  if (!variants) paths.set(clip, (variants = new Map()));
  const cached = variants.get(geometry);
  if (cached) return cached;
  const path = create();
  if (variants.size === MAX_GEOMETRIES_PER_CLIP) variants.delete(variants.keys().next().value!);
  variants.set(geometry, path);
  return path;
}
