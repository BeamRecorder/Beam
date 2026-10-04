const bounded = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateLayerRotation3d(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['x', 'y', 'perspective'].includes(key)) ||
    !bounded(value.x, -80, 80) ||
    !bounded(value.y, -80, 80) ||
    !bounded(value.perspective, 200, 10000)
  )
    throw new TypeError('Invalid layer 3D rotation.');
}
