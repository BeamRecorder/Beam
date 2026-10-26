import type { NormalizedTransform, ShapeClip } from './composition-types';
import { isShapeKind, shapeDefinition } from './shape-catalog';

/** The semantic text body follows the same local geometry as its enclosing shape. */
export function elementTextRegion(
  clip: ShapeClip,
  transform: NormalizedTransform = clip.transform,
): NormalizedTransform {
  if (!isShapeKind(clip.preset)) return transform;
  const region = shapeDefinition(clip.preset).textRegion;
  if (!region) return transform;
  let bounds = region.bounds;
  if (clip.vector) {
    const nodes = clip.vector.contours
      .flatMap((contour) => contour.nodes)
      .filter((node) => region.vectorNodeIds.includes(node.id));
    // A fully replaced path has no remaining preset body to distinguish from its outline.
    if (!nodes.length) return transform;
    const points = nodes.flatMap((node) => [node, ...(node.in ? [node.in] : []), ...(node.out ? [node.out] : [])]);
    const left = Math.min(...points.map((point) => point.x)),
      top = Math.min(...points.map((point) => point.y));
    bounds = {
      x: left,
      y: top,
      width: Math.max(...points.map((point) => point.x)) - left,
      height: Math.max(...points.map((point) => point.y)) - top,
    };
  }
  return {
    x: transform.x + bounds.x * transform.width,
    y: transform.y + bounds.y * transform.height,
    width: bounds.width * transform.width,
    height: bounds.height * transform.height,
  };
}
