import type { ClipComposition } from '../shared/composition-types';
import { createSceneAnimator } from './scene-animation';

/** Map a normalized point from a clip's scene through its parents, including animated transforms. */
export function createScenePointMapper(composition: ClipComposition, width: number, height: number) {
  const groups = new Map(composition.scene?.groups.map((group) => [group.id, group]));
  const parents = new Map(
    composition.scene?.groups.flatMap((group) => group.children.map((child) => [child, group.id] as const)),
  );
  const animate = createSceneAnimator(composition);
  return (id: string, point: { cx: number; cy: number }, timeMs: number) => {
    let x = point.cx * width,
      y = point.cy * height;
    let parent = parents.get(id);
    while (parent) {
      const group = animate(groups.get(parent)!, timeMs);
      const transform = group.transform,
        angle = (transform.rotation * Math.PI) / 180;
      const localX = (x - width / 2) * transform.scaleX,
        localY = (y - height / 2) * transform.scaleY;
      x = width / 2 + transform.x * width + localX * Math.cos(angle) - localY * Math.sin(angle);
      y = height / 2 + transform.y * height + localX * Math.sin(angle) + localY * Math.cos(angle);
      parent = parents.get(parent);
    }
    return { cx: x / width, cy: y / height };
  };
}
