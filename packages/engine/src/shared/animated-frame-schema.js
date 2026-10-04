export const ANIMATED_FRAME_PRESETS = ['purple-haze', 'neon-duo', 'aurora', 'ember', 'electric'];
const bounded = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateAnimatedFrame(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['preset', 'width', 'speed'].includes(key)) ||
    !ANIMATED_FRAME_PRESETS.includes(value.preset) ||
    !bounded(value.width, 1, 16) ||
    !bounded(value.speed, 0, 3)
  )
    throw new TypeError('Invalid animated frame.');
}
