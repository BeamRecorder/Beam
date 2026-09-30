import type { EyeStyle } from '../mascot-types';
import { clamp, lerp } from './math';
import { PROFILE_SAMPLES } from './profiles';
import { capsulePath, closedPath, profileFromPolygon, radiusAtAngle } from './shape';

const STAR_PROFILE = profileFromPolygon(
  Array.from({ length: 10 }, (_, index) => {
    const angle = (index * Math.PI) / 5 - Math.PI / 2;
    const radius = index % 2 === 0 ? 1 : 0.45;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }),
  0,
  0,
);

// All eyes share the body's radial topology, so switching styles is a real
// geometric morph. The astroid produces four soft, concave sparkle points.
export function eyeShapePath(width: number, height: number, from: EyeStyle, to: EyeStyle, mix: number): string {
  const progress = clamp(mix);
  if ((to === 'capsule' && progress === 1) || (from === 'capsule' && progress === 0)) {
    return capsulePath(width, height);
  }
  const radius = Math.min(width, height) / 2;
  const extension = Math.abs(width - height) / 2;
  const profile = (angle: number, style: EyeStyle) => {
    const c = Math.abs(Math.cos(angle));
    const s = Math.abs(Math.sin(angle));
    if (style === 'sparkle') return (c ** (2 / 3) + s ** (2 / 3)) ** -1.5;
    if (style === 'star') return radiusAtAngle(STAR_PROFILE, angle);
    const along = width >= height ? c : s;
    const across = width >= height ? s : c;
    const r = across > 0 ? radius / across : Infinity;
    const axis = r * along;
    const distance =
      axis <= extension ? r : extension * along + Math.sqrt(Math.max(0, radius ** 2 - extension ** 2 * across ** 2));
    return distance;
  };
  return closedPath(
    Array.from({ length: PROFILE_SAMPLES }, (_, index) => {
      const angle = (index / PROFILE_SAMPLES) * Math.PI * 2;
      const point = (style: EyeStyle) => {
        const r = profile(angle, style);
        return style === 'capsule'
          ? { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
          : { x: (Math.cos(angle) * r * width) / 2, y: (Math.sin(angle) * r * height) / 2 };
      };
      const a = point(from);
      const b = point(to);
      return { x: lerp(a.x, b.x, progress), y: lerp(a.y, b.y, progress) };
    }),
  );
}
