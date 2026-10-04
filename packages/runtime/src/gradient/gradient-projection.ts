import type { GradientProjection, GradientRect, GradientTransform } from './gradient-types';

/** Invert the object's local frame, including rotation and the host canvas transform. */
export function gradientProjection(rect: GradientRect, transform: GradientTransform): GradientProjection {
  const angle = ((rect.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const a = (transform.a * cos + transform.c * sin) * rect.width;
  const b = (transform.b * cos + transform.d * sin) * rect.width;
  const c = (-transform.a * sin + transform.c * cos) * rect.height;
  const d = (-transform.b * sin + transform.d * cos) * rect.height;
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const e = transform.a * cx + transform.c * cy + transform.e - a / 2 - c / 2;
  const f = transform.b * cx + transform.d * cy + transform.f - b / 2 - d / 2;
  const determinant = a * d - b * c;
  if (![a, b, c, d, e, f, determinant].every(Number.isFinite) || Math.abs(determinant) < 1e-12)
    throw new Error('Invalid gradient surface geometry.');
  return {
    x: [d / determinant, -c / determinant, (c * f - d * e) / determinant],
    y: [-b / determinant, a / determinant, (b * e - a * f) / determinant],
  };
}
