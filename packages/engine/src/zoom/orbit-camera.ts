import type { ZoomFocus } from './zoom-types';
import type { OrbitCameraPose, OrbitCameraSettings } from './orbit-camera-types';
import { normalizeOrbitSettings } from './orbit-settings';

const radians = Math.PI / 180;

/** A look-at camera on a sphere around the framed subject, with a bounded offline lead. */
export function orbitCameraPose(options: {
  timeMs: number;
  weight: number;
  intensity: number;
  scale: number;
  fixed?: ZoomFocus;
  settings?: OrbitCameraSettings;
  pointAt(timeMs: number): ZoomFocus | null;
}): OrbitCameraPose {
  const settings = normalizeOrbitSettings(options.settings);
  let x = 0,
    y = 0,
    total = 0;
  if (options.fixed) {
    x = options.fixed.cx;
    y = options.fixed.cy;
    total = 1;
  } else
    for (let index = 1; index <= Math.ceil((settings.responseMs / 1000) * 2 * 120); index++) {
      const age = index / 120;
      const point = options.pointAt(Math.max(0, options.timeMs + settings.leadMs - age * 1000));
      if (!point) continue;
      const weight = age * Math.exp((-6 / (settings.responseMs / 1000)) * age);
      x += point.cx * weight;
      y += point.cy * weight;
      total += weight;
    }
  const strength = Math.max(0, Math.min(1, options.weight)) * Math.max(0, Math.min(1, options.intensity));
  const cx = total ? Math.max(0, Math.min(1, x / total)) : 0.5;
  const cy = total ? Math.max(0, Math.min(1, y / total)) : 0.5;
  const automatic = !options.fixed;
  const clampAngle = (angle: number) => Math.max(-55, Math.min(55, angle));
  const zoomScale = Math.max(1, options.scale);
  const framingDistance = 1 / Math.tan((settings.fieldOfView * radians) / 2);
  return {
    azimuth: clampAngle(settings.yaw + (automatic ? (cx - 0.5) * 2 * settings.horizontal : 0)) * radians * strength,
    elevation: clampAngle(settings.pitch + (automatic ? (0.5 - cy) * 2 * settings.vertical : 0)) * radians * strength,
    roll: settings.roll * radians * strength,
    pullback: settings.pullback * strength,
    maxAzimuth:
      Math.min(55, Math.abs(settings.yaw) + (automatic ? Math.abs(settings.horizontal) : 0)) * radians * strength,
    maxElevation:
      Math.min(55, Math.abs(settings.pitch) + (automatic ? Math.abs(settings.vertical) : 0)) * radians * strength,
    distance: framingDistance / zoomScale ** settings.dolly,
    zoomScale,
    framingDistance,
    strength,
  };
}

/** View coordinates of a world point, obtained from the camera eye and orthonormal basis. */
export function orbitCameraPoint(x: number, y: number, z: number, aspect: number, pose: OrbitCameraPose) {
  const sy = Math.sin(pose.azimuth),
    cy = Math.cos(pose.azimuth);
  const se = Math.sin(pose.elevation),
    ce = Math.cos(pose.elevation);
  // Keep the complete plane in front of the near plane, including wide displays.
  const distance =
    (pose.zoomScale ?? 1) *
    Math.max(
      pose.distance,
      (aspect * Math.sin(pose.maxAzimuth ?? 22 * radians * pose.strength) +
        Math.sin(pose.maxElevation ?? 16 * radians * pose.strength)) /
        0.75 +
        0.5,
    );
  const eye = { x: distance * sy * ce, y: distance * se, z: distance * cy * ce };
  const relative = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
  const viewX = cy * relative.x - sy * relative.z,
    viewY = -sy * se * relative.x + ce * relative.y - cy * se * relative.z;
  const cr = Math.cos(pose.roll ?? 0),
    sr = Math.sin(pose.roll ?? 0);
  return {
    x: (cr * viewX + sr * viewY) / aspect,
    y: -sr * viewX + cr * viewY,
    // Keep the homography linear even outside the viewport; WebGL clips the complete plane.
    w: (-sy * ce * relative.x - se * relative.y - cy * ce * relative.z) / distance,
  };
}

export function orbitCameraCoverScale(aspect: number, pose: OrbitCameraPose) {
  const yaw = pose.maxAzimuth ?? 22 * radians * pose.strength,
    pitch = pose.maxElevation ?? 16 * radians * pose.strength;
  const distance = pose.framingDistance ?? pose.distance;
  // OpenScreen fits the complete orbit at 1x, then fades that reduction out by 2x.
  // Filling every tilted corner would multiply the authored zoom (1.25x became >2x).
  // The fixed lens/envelope makes this independent of cursor position and dolly movement.
  let extent = 1;
  for (const azimuth of [-yaw, 0, yaw])
    for (const elevation of [-pitch, 0, pitch])
      for (const px of [-aspect, aspect])
        for (const py of [-1, 1]) {
          const point = orbitCameraPoint(px, py, 0, aspect, { ...pose, azimuth, elevation, distance, zoomScale: 1 });
          extent = Math.max(extent, Math.abs(point.x / point.w), Math.abs(point.y / point.w));
        }
  const fit = extent > 1 ? (1 - 0.005 * pose.strength) / extent : 1;
  const fade = Math.max(0, Math.min(1, (pose.zoomScale ?? 1) - 1));
  return (fit + (1 - fit) * fade) * (1 - (pose.pullback ?? 0));
}
