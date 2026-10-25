import { validateCursorClickEffect } from './cursor-click-schema.js';

const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;

/** Per-clip cursor settings are complete; older clips inherit the project's presentation. */
export function validateScreenCursorSettings(value) {
  if (
    !record(value) ||
    value.enabled !== undefined ||
    !record(value.selection) ||
    !text(value.selection.packId) ||
    !['automatic', 'fixed'].includes(value.selection.mode) ||
    (value.selection.mode === 'fixed' ? !text(value.selection.cursorId) : value.selection.cursorId !== null) ||
    !bounded(value.size, 1, 384) ||
    !text(value.color) ||
    !record(value.shadow) ||
    typeof value.shadow.enabled !== 'boolean' ||
    !bounded(value.shadow.blur, 0, 96) ||
    !text(value.shadow.color) ||
    !['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadow.direction) ||
    !record(value.clickEffects) ||
    !record(value.motion) ||
    !['focused', 'smooth', 'custom'].includes(value.motion.preset) ||
    !bounded(value.motion.smoothing, 0, 1) ||
    !bounded(value.motion.springMassMultiplier, 0.5, 2) ||
    !bounded(value.motion.motionBlur, 0, 1) ||
    typeof value.motion.stopSpringEnabled !== 'boolean' ||
    !bounded(value.motion.stopSpringStrength, 0, 1) ||
    (value.motion.model3d !== undefined && typeof value.motion.model3d !== 'boolean') ||
    !record(value.autoHide) ||
    typeof value.autoHide.enabled !== 'boolean' ||
    !bounded(value.autoHide.delaySeconds, 0.5, 10) ||
    !bounded(value.autoHide.fadeDurationMs, 0, 1000)
  )
    throw new TypeError('Invalid screen cursor settings.');
  validateCursorClickEffect(value.clickEffects.left);
  validateCursorClickEffect(value.clickEffects.right);
}
