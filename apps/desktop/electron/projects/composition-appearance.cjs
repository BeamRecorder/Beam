const { normalizePhoneFrameFill } = require('./composition-phone-frame-fill.cjs');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;

const historicalAppearance = (kind, showBackground) => ({
  cornerRadius: kind === 'screen' ? (showBackground ? 'md' : 'none') : 'sm',
  shadowSize: 'md',
  shadowBlur: kind === 'screen' ? 40 : 20,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: kind === 'screen' ? 'bottom' : 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
});

const normalizeAppearance = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Apparence de clip invalide');
  const radius = finite(value.cornerRadius)
    ? Math.max(0, Math.min(9999, value.cornerRadius))
    : ['none', 'sm', 'md', 'lg', 'full'].includes(value.cornerRadius)
      ? value.cornerRadius
      : null;
  if (
    radius === null ||
    !['none', 'sm', 'md', 'lg', 'custom'].includes(value.shadowSize) ||
    !finite(value.shadowBlur) ||
    !['solid', 'adaptive'].includes(value.shadowMode) ||
    color(value.shadowColor, null) === null ||
    !['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection) ||
    typeof value.borderEnabled !== 'boolean' ||
    color(value.borderColor, null) === null ||
    !finite(value.borderWidth) ||
    !['none', 'safari', 'windows-95', 'iphone-16-max', 'pixel-9-pro'].includes(value.frame) ||
    color(value.frameColor, null) === null ||
    typeof value.frameShowMenu !== 'boolean' ||
    typeof value.frameShowScrollbars !== 'boolean' ||
    !finite(value.frameChromeScale)
  )
    throw new Error('Apparence de clip invalide');
  return {
    cornerRadius: radius,
    shadowSize: value.shadowSize,
    shadowBlur: Math.max(0, Math.min(96, value.shadowBlur)),
    shadowMode: value.shadowMode,
    shadowColor: color(value.shadowColor, null),
    shadowDirection: value.shadowDirection,
    borderEnabled: value.borderEnabled,
    borderColor: color(value.borderColor, null),
    borderWidth: Math.max(0, Math.min(32, value.borderWidth)),
    frame: value.frame,
    frameTitle: text(value.frameTitle, 120),
    frameColor: color(value.frameColor, null),
    frameShowMenu: value.frameShowMenu,
    frameShowScrollbars: value.frameShowScrollbars,
    frameChromeScale: Math.max(0.5, Math.min(2, value.frameChromeScale)),
    phoneFrameFill: normalizePhoneFrameFill(value.phoneFrameFill),
  };
};

module.exports = { historicalAppearance, normalizeAppearance };
