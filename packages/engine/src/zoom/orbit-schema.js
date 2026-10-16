export const DEFAULT_ORBIT_SETTINGS = Object.freeze({
  yaw: 0,
  pitch: 4,
  roll: 0,
  horizontal: 22,
  vertical: 12,
  fieldOfView: 35,
  dolly: 0.5,
  responseMs: 450,
  leadMs: 100,
  pullback: 0,
});
export const ORBIT_SETTING_LIMITS = Object.freeze({
  yaw: [-35, 35],
  pitch: [-30, 30],
  roll: [-20, 20],
  horizontal: [-30, 30],
  vertical: [-24, 24],
  fieldOfView: [20, 60],
  dolly: [0, 1],
  responseMs: [100, 1200],
  leadMs: [0, 200],
  pullback: [0, 0.65],
});
export function validateOrbitSettings(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== Object.keys(ORBIT_SETTING_LIMITS).length ||
    Object.entries(ORBIT_SETTING_LIMITS).some(
      ([key, [min, max]]) => !Number.isFinite(value[key]) || value[key] < min || value[key] > max,
    )
  )
    throw new TypeError('Invalid orbit camera settings.');
}
