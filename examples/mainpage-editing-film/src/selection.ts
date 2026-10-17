import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { projectPerspectivePoint, hasPerspectiveTilt } from '@beam/engine/zoom/perspective-projection';

export function selectionAt(transform: NormalizedTransform, camera: CameraSample, width: number, height: number) {
  const projection = { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0, orbit: camera.orbit };
  const project = (x: number, y: number) => {
    const point = {
      x: (0.5 + (x - camera.focus.cx) * camera.scale) * 1920,
      y: (0.5 + (y - camera.focus.cy) * camera.scale) * 1080,
    };
    const projected =
      camera.orbit || hasPerspectiveTilt(projection)
        ? projectPerspectivePoint(point, { x: 0, y: 0, width: 1920, height: 1080 }, projection)
        : point;
    return { x: (projected.x * width) / 1920, y: (projected.y * height) / 1080 };
  };
  const { x, y, width: w, height: h } = transform;
  const corners = [project(x, y), project(x + w, y), project(x + w, y + h), project(x, y + h)];
  const left = Math.min(...corners.map((point) => point.x)),
    top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x)),
    bottom = Math.max(...corners.map((point) => point.y));
  const local = corners.map((point) => ({ x: point.x - left, y: point.y - top }));
  return {
    handleStyle: { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` },
    perspectiveCorners: local as [(typeof local)[0], (typeof local)[0], (typeof local)[0], (typeof local)[0]],
    resizeHandlePositions: {
      'top-left': local[0],
      'top-right': local[1],
      'bottom-right': local[2],
      'bottom-left': local[3],
    },
  };
}
